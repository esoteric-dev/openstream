import { Server, Socket } from 'socket.io';
import { spawnFFmpeg } from './ffmpeg.js';
import jwt from 'jsonwebtoken';
import { prisma } from '@multistream/db';
import { setStreamStatus } from './redis.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface StudioSession {
  ffmpeg: ReturnType<typeof spawn>;
  streamId: string;
}

export function registerStudioHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {

    socket.on('studio:start', async ({ streamId }: { streamId: string }) => {
      const token = (socket.handshake.auth as any)?.token;
      if (!token) { socket.emit('studio:error', 'Not authenticated'); return; }

      let userId: string;
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        userId = decoded.userId;
      } catch {
        socket.emit('studio:error', 'Invalid token');
        return;
      }

      const stream = await prisma.stream.findFirst({ where: { id: streamId, userId } });
      if (!stream) { socket.emit('studio:error', 'Stream not found'); return; }

      const rtmpTarget = `rtmp://localhost:1935/live/${stream.rtmpKey}`;

      const ffmpeg = spawnFFmpeg([
        '-probesize', '32',
        '-analyzeduration', '0',
        '-fflags', '+genpts',
        '-f', 'matroska',    // matroska is more forgiving than webm for piped input
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
        console.error('Studio FFmpeg spawn error:', err.message);
        socket.emit('studio:error',
          err.code === 'ENOENT' ? 'FFmpeg not installed on server (run: winget install ffmpeg)' : err.message
        );
        cleanupStudio(socket);
      });

      let ffmpegStarted = false;
      ffmpeg.stderr?.on('data', (d: Buffer) => {
        const line = d.toString();
        if (!ffmpegStarted && line.includes('Output #0')) {
          ffmpegStarted = true;
          console.log(`Studio FFmpeg connected to RTMP for stream ${streamId}`);
        }
        if (line.toLowerCase().includes('error')) {
          console.error(`[studio-ffmpeg] ${line.slice(0, 300)}`);
        }
      });

      ffmpeg.on('close', async (code) => {
        console.log(`Studio FFmpeg closed (code=${code}) for stream ${streamId}`);
        cleanupStudio(socket);
        try {
          await prisma.stream.update({ where: { id: streamId }, data: { status: 'ended' } });
          setStreamStatus(streamId, 'ended', { endedAt: new Date().toISOString() });
          io.to(`stream:${streamId}`).emit('stream-status', { status: 'ended' });
        } catch {}
      });

      (socket as any)._studio = { ffmpeg, streamId } as StudioSession;

      try {
        await prisma.stream.update({ where: { id: streamId }, data: { status: 'live' } });
        setStreamStatus(streamId, 'live', { startedAt: new Date().toISOString() });
        io.to(`stream:${streamId}`).emit('stream-status', { status: 'live' });
      } catch {}

      socket.emit('studio:started');
      console.log(`Studio session started for stream ${streamId}`);
    });

    socket.on('studio:data', (chunk: Buffer | ArrayBuffer) => {
      const session = (socket as any)._studio as StudioSession | undefined;
      if (!session?.ffmpeg?.stdin?.writable) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      session.ffmpeg.stdin.write(buf);
    });

    socket.on('studio:stop', () => {
      const session = (socket as any)._studio as StudioSession | undefined;
      if (session) {
        console.log(`Studio session stopping for stream ${session.streamId}`);
        session.ffmpeg.stdin?.end();
        setTimeout(() => session.ffmpeg.kill('SIGTERM'), 500);
        cleanupStudio(socket);
      }
    });

    socket.on('disconnect', () => {
      const session = (socket as any)._studio as StudioSession | undefined;
      if (session) {
        session.ffmpeg.stdin?.end();
        setTimeout(() => session.ffmpeg.kill('SIGTERM'), 500);
        cleanupStudio(socket);
      }
    });
  });
}

function cleanupStudio(socket: Socket) {
  delete (socket as any)._studio;
}
