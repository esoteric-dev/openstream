import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
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

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/billing', billingRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Create HTTP server with Socket.IO
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Join stream room for real-time updates
  socket.on('join-stream', (streamId: string) => {
    socket.join(`stream:${streamId}`);
    console.log(`Client ${socket.id} joined stream room: ${streamId}`);
  });
  
  // Chat message handling
  socket.on('chat-message', async (data: { streamId: string; message: string }) => {
    // Broadcast to all clients in the stream room
    io.to(`stream:${data.streamId}`).emit('chat-message', data);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Export io for use in routes
export { io };

// Initialize connections and start server
async function startServer() {
  try {
    // Connect to Redis
    await redisClient.connect();
    console.log('Connected to Redis');
    
    // Setup RTMP webhook handler (for SRS callbacks)
    setupRTMPWebhook(app);
    
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
