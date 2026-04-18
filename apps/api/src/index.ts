import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { redisClient } from './services/redis.js';
import authRoutes from './routes/auth.js';
import platformRoutes from './routes/platforms.js';
import streamRoutes from './routes/streams.js';
import uploadRoutes from './routes/uploads.js';
import recordingRoutes from './routes/recordings.js';
import pageRoutes from './routes/pages.js';
import teamRoutes from './routes/team.js';
import billingRoutes from './routes/billing.js';
import { setupRTMPWebhook } from './services/rtmp-webhook.js';
import { registerStudioHandlers } from './services/studio-socket.js';
import { initScheduledStreamWorker } from './workers/scheduled-stream.js';
import { startChatAggregation, stopChatAggregation } from './services/chat-aggregator.js';
import { ensureBucket } from './services/s3.js';
import { prisma } from '@multistream/db';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();
const PORT = process.env.API_PORT || 3001;

// --- Middleware ---
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4000',
  credentials: true,
}));

// Raw body for Stripe webhooks (must come before express.json)
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple in-process rate limiter (no extra deps required)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
app.use('/api/', (req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const window = 60_000; // 1 minute
  const limit = 120;     // 120 requests per minute per IP

  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + window });
    return next();
  }

  entry.count++;
  if (entry.count > limit) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  next();
});

// Prune old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap) {
    if (v.resetAt < now) rateLimitMap.delete(k);
  }
}, 300_000);

// --- Health check ---
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/billing', billingRoutes);

// --- Error handler ---
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// --- HTTP + Socket.IO ---
const httpServer = createServer(app);
export const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:4000',
    credentials: true,
  },
});

io.on('connection', (socket) => {
  // Join a stream room for real-time updates
  socket.on('join-stream', async (streamId: string) => {
    socket.join(`stream:${streamId}`);

    // Immediately send current stream status and last 50 chat messages
    try {
      const messages = await prisma.chatMessage.findMany({
        where: { streamId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { platform: true, username: true, message: true, createdAt: true },
      });
      socket.emit('chat-history', messages.reverse());
    } catch {}
  });

  socket.on('leave-stream', (streamId: string) => {
    socket.leave(`stream:${streamId}`);
  });

  // Chat message sent from the UI (platform-side replies handled separately)
  socket.on('chat-message', (data: { streamId: string; message: string; username?: string }) => {
    io.to(`stream:${data.streamId}`).emit('chat-message', {
      platform: 'studio',
      username: data.username || 'Host',
      message: data.message,
      timestamp: new Date().toISOString(),
    });
  });
});

// --- Server startup ---
async function startServer() {
  try {
    await redisClient.connect();
    console.log('Connected to Redis');

    setupRTMPWebhook(app);
    registerStudioHandlers(io);
    initScheduledStreamWorker();
    await ensureBucket();

    // Restart chat aggregation for any streams that were live before restart
    const liveStreams = await prisma.stream.findMany({ where: { status: 'live' } });
    for (const stream of liveStreams) {
      startChatAggregation(stream.id).catch(console.error);
    }

    httpServer.listen(PORT, () => {
      console.log(`API Server running on port ${PORT}`);
      console.log(`WebSocket server ready`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
export default app;
