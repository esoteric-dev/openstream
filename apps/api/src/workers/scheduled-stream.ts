import { Queue, Worker, Job } from 'bullmq';
import { ChildProcess } from 'child_process';
import { spawnFFmpeg } from '../services/ffmpeg.js';
import { prisma } from '@multistream/db';
import { setStreamStatus } from '../services/redis.js';
import { io } from '../index.js';

const REDIS_URL = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
const connection = {
  host: REDIS_URL.hostname,
  port: parseInt(REDIS_URL.port) || 6379,
  password: REDIS_URL.password || undefined,
};

export const scheduledStreamQueue = new Queue('scheduled-streams', { connection });

// Track active pre-recorded stream processes
const activePrerecordedStreams = new Map<string, ChildProcess>();

const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 5000;

interface ScheduledStreamJob {
  streamId: string;
  loop?: boolean;
  playlistUrls?: string[];
  scheduledEndAt?: string;
}

// Worker that processes scheduled stream jobs
const worker = new Worker<ScheduledStreamJob>(
  'scheduled-streams',
  async (job: Job<ScheduledStreamJob>) => {
    const { streamId, loop, playlistUrls } = job.data;

    // Handle 'stop' jobs
    if (job.name === 'stop') {
      console.log(`Auto-stopping stream ${streamId} (scheduled end time reached)`);
      await stopStreamCompletely(streamId);
      return;
    }

    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      include: { destination: true },
    });

    if (!stream) {
      console.error(`Scheduled stream ${streamId} not found`);
      return;
    }

    if (stream.status === 'live') {
      console.log(`Stream ${streamId} already live, skipping`);
      return;
    }

    const rtmpTarget = `rtmp://localhost:1935/live/${stream.rtmpKey}`;
    const dbPlaylist = (stream as any).playlist as Array<{ url: string }> | undefined;
    const dbPlaylistUrls = dbPlaylist?.length ? dbPlaylist.map(v => v.url) : null;
    const urls = playlistUrls?.length ? playlistUrls : dbPlaylistUrls ?? (stream.recordingUrl ? [stream.recordingUrl] : null);

    if (!urls) {
      await prisma.stream.update({ where: { id: streamId }, data: { status: 'offline' } });
      console.log(`Stream ${streamId} scheduled but no recording URL — waiting for RTMP input`);
      return;
    }

    console.log(`Starting scheduled stream ${streamId} with ${urls.length} file(s), loop=${loop}`);
    await streamPlaylist(stream.id, rtmpTarget, urls, loop ?? true);
  },
  { connection }
);

worker.on('completed', (job) => console.log(`Scheduled stream job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`Scheduled stream job ${job?.id} failed:`, err));

async function streamPlaylist(streamId: string, rtmpTarget: string, urls: string[], loop: boolean) {
  let retryCount = 0;

  async function playNext(index: number) {
    const url = urls[index % urls.length];

    await prisma.stream.update({ where: { id: streamId }, data: { status: 'live' } });
    await setStreamStatus(streamId, 'live', { startedAt: new Date().toISOString(), source: url });
    io.to(`stream:${streamId}`).emit('stream-status', { status: 'live' });

    const ffmpeg = spawnFFmpeg([
      '-re',
      '-i', url,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-b:v', '4500k',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-f', 'flv',
      '-flvflags', 'no_duration_filesize',
      rtmpTarget,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    activePrerecordedStreams.set(streamId, ffmpeg);

    ffmpeg.on('error', async (err) => {
      console.error(`FFmpeg spawn error for ${streamId}:`, err.message);
      if ((err as any).code === 'ENOENT') {
        console.error('FFmpeg not found. Install it: winget install ffmpeg');
      }
      activePrerecordedStreams.delete(streamId);
      await attemptRecovery(streamId, rtmpTarget, urls, index, loop);
    });

    ffmpeg.stderr?.on('data', (data: Buffer) => {
      const line = data.toString();
      if (line.includes('Error') || line.includes('error')) {
        console.error(`Prerecorded FFmpeg error for ${streamId}:`, line.slice(0, 200));
      }
    });

    ffmpeg.on('close', async (code) => {
      activePrerecordedStreams.delete(streamId);

      // Check if stream was explicitly stopped by user
      const stream = await prisma.stream.findUnique({ where: { id: streamId } });
      if (!stream || stream.status === 'ended') {
        console.log(`Stream ${streamId} was explicitly stopped, not restarting`);
        return;
      }

      if (code === 0) {
        // Video finished normally → play next, always loop back to start
        retryCount = 0;
        const nextIndex = (index + 1) % urls.length;
        console.log(`Stream ${streamId}: video ${index + 1}/${urls.length} finished, playing next (index ${nextIndex})`);
        await playNext(nextIndex);
      } else {
        // Error exit → attempt recovery with backoff
        console.warn(`FFmpeg exited with code ${code} for stream ${streamId}, attempting recovery...`);
        await attemptRecovery(streamId, rtmpTarget, urls, index, loop);
      }
    });
  }

  async function attemptRecovery(streamId: string, rtmpTarget: string, urls: string[], index: number, _loop: boolean) {
    retryCount++;
    if (retryCount > MAX_RETRIES) {
      console.error(`Stream ${streamId}: max retries (${MAX_RETRIES}) exceeded, ending stream`);
      await endStream(streamId);
      return;
    }

    const delay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, retryCount - 1), 60000);
    console.log(`Stream ${streamId}: retry ${retryCount}/${MAX_RETRIES} in ${delay}ms`);

    await new Promise(resolve => setTimeout(resolve, delay));

    // Check again if stream was stopped during the delay
    const stream = await prisma.stream.findUnique({ where: { id: streamId } });
    if (!stream || stream.status === 'ended') return;

    await playNext(index);
  }

  await playNext(0);
}

async function stopStreamCompletely(streamId: string) {
  const proc = activePrerecordedStreams.get(streamId);
  if (proc) {
    proc.kill('SIGTERM');
    activePrerecordedStreams.delete(streamId);
  }
  await endStream(streamId);
}

async function endStream(streamId: string) {
  await prisma.stream.update({ where: { id: streamId }, data: { status: 'ended' } });
  await setStreamStatus(streamId, 'ended', { endedAt: new Date().toISOString() });
  io.to(`stream:${streamId}`).emit('stream-status', { status: 'ended' });
}

// Schedule a stream job
export async function scheduleStream(
  streamId: string,
  scheduledAt: Date,
  options?: { loop?: boolean; playlistUrls?: string[]; scheduledEndAt?: Date }
) {
  const delay = scheduledAt.getTime() - Date.now();
  if (delay < 0) {
    console.warn(`Stream ${streamId} scheduled time is in the past`);
    return;
  }

  const job = await scheduledStreamQueue.add(
    'play',
    { streamId, loop: options?.loop, playlistUrls: options?.playlistUrls },
    { delay, jobId: `stream:${streamId}`, removeOnComplete: true }
  );

  console.log(`Stream ${streamId} scheduled in ${Math.round(delay / 1000)}s (job ${job.id})`);

  // If a stop time is set, schedule a stop job
  if (options?.scheduledEndAt) {
    const stopDelay = options.scheduledEndAt.getTime() - Date.now();
    if (stopDelay > 0) {
      await scheduledStreamQueue.add(
        'stop',
        { streamId },
        { delay: stopDelay, jobId: `stream-stop:${streamId}`, removeOnComplete: true }
      );
      console.log(`Stream ${streamId} auto-stop scheduled in ${Math.round(stopDelay / 1000)}s`);
    }
  }

  return job;
}

// Cancel a scheduled stream job (+ stop job)
export async function cancelScheduledStream(streamId: string) {
  const job = await scheduledStreamQueue.getJob(`stream:${streamId}`);
  if (job) {
    await job.remove();
    console.log(`Cancelled scheduled stream ${streamId}`);
  }
  const stopJob = await scheduledStreamQueue.getJob(`stream-stop:${streamId}`);
  if (stopJob) {
    await stopJob.remove();
    console.log(`Cancelled scheduled stop for stream ${streamId}`);
  }
}

// Start a pre-recorded stream immediately
export async function startPrerecordedStream(streamId: string, playlistUrls: string[], loop: boolean) {
  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  if (!stream) throw new Error(`Stream ${streamId} not found`);
  const rtmpTarget = `rtmp://localhost:1935/live/${stream.rtmpKey}`;
  await streamPlaylist(streamId, rtmpTarget, playlistUrls, loop);
}

// Stop a running pre-recorded stream
export async function stopPrerecordedStream(streamId: string) {
  const proc = activePrerecordedStreams.get(streamId);
  if (proc) {
    proc.kill('SIGTERM');
    activePrerecordedStreams.delete(streamId);
  }
}

export function initScheduledStreamWorker() {
  console.log('Scheduled stream worker initialized');
  return worker;
}
