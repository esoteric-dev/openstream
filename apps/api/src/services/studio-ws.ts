import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { spawn, ChildProcess } from 'child_process';
import jwt from 'jsonwebtoken';
import { prisma } from '@multistream/db';
import { setStreamStatus } from './redis.js';
import { io } from '../index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface Session {
  ffmpeg: ChildProcess;
  streamId: string;
}

const sessions = new Map<WebSocket, Session>();

export function setupStudioWS(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/api/studio/ws' });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url!, 'http://localhost');
    const token = url.searchParams.get('token');
    const streamId = url.searchParams.get('streamId');

    if (!token || !streamId) {
      ws.close(1008, 'Missing token or streamId');
      return;
    }

    let userId: string;
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      userId = decoded.userId;
    } catch {
      ws.close(1008, 'Invalid token');
      return;
    }

    const stream = await prisma.stream.findFirst({ where: { id: streamId, userId } });
    if (!stream) {
      ws.close(1008, 'Stream not found');
      return;
    }

    const rtmpTarget = `rtmp://localhost:1935/live/${stream.rtmpKey}`;

    const ffmpeg = spawn('ffmpeg', [
      '-fflags', '+genpts',
      '-f', 'webm',
      '-i', 'pipe:0',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-b:v', '3000k',
      '-maxrate', '3000k',
      '-bufsize', '6000k',
      '-pix_fmt', 'yuv420p',
      '-g', '60',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-f', 'flv',
      '-flvflags', 'no_duration_filesize',
      rtmpTarget,
    ], { stdio: ['pipe', 'ignore', 'pipe'] });

    ffmpeg.on('error', (err: any) => {
      console.error('Studio FFmpeg error:', err.message);
      if (err.code === 'ENOENT') console.error('FFmpeg not found — install via: winget install ffmpeg');
      ws.close(1011, 'FFmpeg error');
    });

    ffmpeg.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString();
      if (line.includes('Error') || line.includes('error')) {
        console.error('Studio FFmpeg:', line.slice(0, 200));
      }
    });

    ffmpeg.on('close', async (code) => {
      console.log(`Studio FFmpeg exited with code ${code} for stream ${streamId}`);
      sessions.delete(ws);
      try {
        await prisma.stream.update({ where: { id: streamId }, data: { status: 'ended' } });
        setStreamStatus(streamId, 'ended', { endedAt: new Date().toISOString() });
        io.to(`stream:${streamId}`).emit('stream-status', { status: 'ended' });
      } catch {}
    });

    // Mark stream live
    await prisma.stream.update({ where: { id: streamId }, data: { status: 'live' } });
    setStreamStatus(streamId, 'live', { startedAt: new Date().toISOString() });
    io.to(`stream:${streamId}`).emit('stream-status', { status: 'live' });

    sessions.set(ws, { ffmpeg, streamId });
    console.log(`Studio session started for stream ${streamId}`);

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      if (!ffmpeg.stdin?.writable) return;
      if (Buffer.isBuffer(data)) {
        ffmpeg.stdin.write(data);
      } else if (data instanceof ArrayBuffer) {
        ffmpeg.stdin.write(Buffer.from(data));
      } else {
        ffmpeg.stdin.write(Buffer.concat(data));
      }
    });

    ws.on('close', () => {
      const session = sessions.get(ws);
      if (session) {
        session.ffmpeg.stdin?.end();
        setTimeout(() => session.ffmpeg.kill('SIGTERM'), 500);
        sessions.delete(ws);
        console.log(`Studio session ended for stream ${streamId}`);
      }
    });

    ws.on('error', (err) => console.error('Studio WS error:', err.message));
  });

  return wss;
}
