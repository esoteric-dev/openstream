import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@multistream/db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const authMiddleware = (req: Request, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    (req as any).userId = decoded.userId;
    next();
  } catch (error) { res.status(401).json({ error: 'Invalid token' }); }
};

router.use(authMiddleware);

// GET /api/recordings - Get all recordings for user
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const streams = await prisma.stream.findMany({
      where: { userId, recordingUrl: { not: null } },
      select: { id: true, title: true, recordingUrl: true, createdAt: true }
    });
    res.json(streams);
  } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/recordings/:id/add-to-stream - Add a recording to another stream's playlist
router.post('/:id/add-to-stream', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { targetStreamId } = req.body;

    if (!targetStreamId) return res.status(400).json({ error: 'targetStreamId is required' });

    // Find the source stream (which has the recording)
    const sourceStream = await prisma.stream.findFirst({
      where: { id, userId, recordingUrl: { not: null } },
    });
    if (!sourceStream || !sourceStream.recordingUrl) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Find the target stream
    const targetStream = await prisma.stream.findFirst({
      where: { id: targetStreamId, userId },
    });
    if (!targetStream) {
      return res.status(404).json({ error: 'Target stream not found' });
    }

    // Append to target stream's playlist
    const currentPlaylist = (targetStream.playlist as any[]) ?? [];
    const newItem = {
      key: `rec_${sourceStream.id}_${Date.now()}`,
      name: `Recording: ${sourceStream.title}`,
      url: sourceStream.recordingUrl,
    };
    const updatedPlaylist = [...currentPlaylist, newItem];

    const updated = await prisma.stream.update({
      where: { id: targetStreamId },
      data: { playlist: updatedPlaylist },
    });

    res.json({ playlist: updated.playlist, addedItem: newItem });
  } catch (error) {
    console.error('Add recording to stream error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
