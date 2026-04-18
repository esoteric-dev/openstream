import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '@multistream/db';
import { stopFFmpegWorkers } from '../workers/ffmpeg-worker.js';
import { setStreamStatus } from '../services/redis.js';
import { scheduleStream, cancelScheduledStream, stopPrerecordedStream, startPrerecordedStream } from '../workers/scheduled-stream.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware to authenticate requests
const authMiddleware = (req: Request, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    (req as any).userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.use(authMiddleware);

// Validation schemas
const createStreamSchema = z.object({
  title: z.string().min(1).max(200),
  scheduledAt: z.string().optional(),
  scheduledEndAt: z.string().optional(),
});

/**
 * GET /api/streams
 * Get all streams for authenticated user
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const streams = await prisma.stream.findMany({
      where: { userId },
      include: {
        destination: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(streams);
  } catch (error) {
    console.error('Get streams error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/streams
 * Create a new stream
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { title, scheduledAt, scheduledEndAt } = createStreamSchema.parse(req.body);

    // Generate unique RTMP key
    const rtmpKey = `sk_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check user's plan limits
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true }
    });

    const planLimits: Record<string, number> = {
      free: 3,
      pro: 10,
      business: 50,
      enterprise: -1 // unlimited
    };

    const plan = user?.subscription?.plan || user?.plan || 'free';
    const maxDestinations = planLimits[plan] || 3;

    // Create stream
    const stream = await prisma.stream.create({
      data: {
        userId,
        title,
        rtmpKey,
        status: scheduledAt ? 'scheduled' : 'offline',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        scheduledEndAt: scheduledEndAt ? new Date(scheduledEndAt) : null,
      },
      include: {
        destination: true
      }
    });

    // Queue BullMQ job if scheduled
    if (scheduledAt) {
      await scheduleStream(stream.id, new Date(scheduledAt), {
        scheduledEndAt: scheduledEndAt ? new Date(scheduledEndAt) : undefined,
      });
    }

    res.status(201).json({
      ...stream,
      rtmpUrl: process.env.RTMP_SERVER_URL || 'rtmp://localhost:1935/live',
      maxDestinations
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create stream error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/streams/:id
 * Get single stream details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const stream = await prisma.stream.findFirst({
      where: { id, userId },
      include: {
        destination: true,
        chatMessages: {
          orderBy: { createdAt: 'desc' },
          take: 100
        },
        hostedPage: true
      }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    res.json({
      ...stream,
      rtmpUrl: process.env.RTMP_SERVER_URL || 'rtmp://localhost:1935/live'
    });
  } catch (error) {
    console.error('Get stream error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/streams/:id
 * Update stream
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { title } = req.body;

    const stream = await prisma.stream.findFirst({
      where: { id, userId }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    const updated = await prisma.stream.update({
      where: { id },
      data: { title }
    });

    res.json(updated);
  } catch (error) {
    console.error('Update stream error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/streams/:id
 * Delete stream
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const stream = await prisma.stream.findFirst({
      where: { id, userId }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (stream.status === 'live') {
      await stopFFmpegWorkers(id);
      await stopPrerecordedStream(id);
    }
    if (stream.status === 'scheduled') {
      await cancelScheduledStream(id);
    }

    await prisma.stream.delete({ where: { id } });

    res.json({ message: 'Stream deleted' });
  } catch (error) {
    console.error('Delete stream error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/streams/:id/start
 * Start streaming (for pre-recorded content)
 */
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const stream = await prisma.stream.findFirst({
      where: { id, userId },
      include: { destination: true }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (stream.status === 'live') {
      return res.status(400).json({ error: 'Stream is already live' });
    }

    // Update status
    await prisma.stream.update({
      where: { id },
      data: { status: 'live' }
    });

    await setStreamStatus(id, 'live', { startedAt: new Date().toISOString() });

    // If the stream has a playlist, kick off pre-recorded playback immediately
    const playlist = (stream as any).playlist as Array<{ key: string; name: string; url: string }> | undefined;
    if (playlist && playlist.length > 0) {
      const playlistUrls = playlist.map(v => v.url);
      startPrerecordedStream(id, playlistUrls, false).catch(console.error);
    }

    res.json({ message: 'Stream started', rtmpKey: stream.rtmpKey });
  } catch (error) {
    console.error('Start stream error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/streams/:id/stop
 * Stop streaming
 */
router.post('/:id/stop', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const stream = await prisma.stream.findFirst({
      where: { id, userId }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    // Stop FFmpeg workers
    await stopFFmpegWorkers(id);

    // Update status
    await prisma.stream.update({
      where: { id },
      data: { status: 'ended' }
    });

    await setStreamStatus(id, 'ended', { endedAt: new Date().toISOString() });

    res.json({ message: 'Stream stopped' });
  } catch (error) {
    console.error('Stop stream error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/streams/:id/destinations
 * Add destination to stream
 */
router.post('/:id/destinations', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { platform, rtmpUrl, streamKey } = req.body;

    const stream = await prisma.stream.findFirst({
      where: { id, userId }
    });

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    const destination = await prisma.destination.create({
      data: {
        streamId: id,
        platform,
        rtmpUrl,
        streamKey
      }
    });

    res.status(201).json(destination);
  } catch (error) {
    console.error('Add destination error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/streams/:id/playlist
 * Return the playlist for a stream
 */
router.get('/:id/playlist', async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const stream = await prisma.stream.findFirst({ where: { id: req.params.id, userId } });
  if (!stream) return res.status(404).json({ error: 'Stream not found' });
  res.json({ playlist: stream.playlist ?? [] });
});

/**
 * PUT /api/streams/:id/playlist
 * Replace the entire playlist (used for reorder + delete)
 * Body: { playlist: Array<{ key: string; name: string; url: string }> }
 */
router.put('/:id/playlist', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const stream = await prisma.stream.findFirst({ where: { id: req.params.id, userId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const { playlist } = req.body;
    if (!Array.isArray(playlist)) return res.status(400).json({ error: 'playlist must be an array' });

    const updated = await prisma.stream.update({
      where: { id: req.params.id },
      data: { playlist },
    });
    res.json({ playlist: updated.playlist });
  } catch (err) {
    console.error('Update playlist error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/streams/:id/playlist
 * Append a single item to the playlist
 * Body: { key: string; name: string; url: string }
 */
router.post('/:id/playlist', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const stream = await prisma.stream.findFirst({ where: { id: req.params.id, userId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const { key, name, url } = req.body;
    if (!key || !name || !url) return res.status(400).json({ error: 'key, name, and url are required' });

    const current = (stream.playlist as any[]) ?? [];
    const playlist = [...current, { key, name, url }];

    const updated = await prisma.stream.update({
      where: { id: req.params.id },
      data: { playlist },
    });
    res.json({ playlist: updated.playlist });
  } catch (err) {
    console.error('Add to playlist error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
