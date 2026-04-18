import express from 'express';
import { spawnFFmpeg } from './ffmpeg.js';
import path from 'path';
import os from 'os';
import { prisma } from '@multistream/db';
import { setStreamStatus } from './redis.js';
import { spawnFFmpegWorker, stopFFmpegWorkers } from '../workers/ffmpeg-worker.js';
import { io } from '../index.js';
import { uploadRecording } from './recording.js';
import { isStorageConfigured } from './s3.js';

interface SRSWebhookPayload {
  action: string;
  client_id: string;
  ip: string;
  vhost: string;
  app: string;
  stream: string; // RTMP key
  param: string;
}

// Track active recording processes: streamId → ChildProcess
const recordingProcesses = new Map<string, import('child_process').ChildProcess>();

export function setupRTMPWebhook(app: express.Application) {

  // Called when a publisher starts streaming
  app.post('/api/webhooks/rtmp/on-publish', async (req, res) => {
    const payload: SRSWebhookPayload = req.body;
    console.log('RTMP on-publish:', payload.stream);

    try {
      const stream = await prisma.stream.findUnique({
        where: { rtmpKey: payload.stream },
        include: { destination: true }
      });

      if (!stream) {
        console.error('Unknown RTMP key:', payload.stream);
        return res.json({ code: 1 }); // Reject
      }

      await prisma.stream.update({
        where: { id: stream.id },
        data: { status: 'live' }
      });

      await setStreamStatus(stream.id, 'live', {
        startedAt: new Date().toISOString(),
        clientId: payload.client_id
      });

      // Fan out to all active destinations
      const activeDestinations = stream.destination.filter(d => d.status !== 'disconnected');
      if (activeDestinations.length > 0) {
        await spawnFFmpegWorker({ ...stream, destination: activeDestinations });
      }

      // Start recording if any storage backend is configured (MinIO or AWS)
      if (isStorageConfigured()) {
        startRecording(stream.id, stream.rtmpKey);
      }

      io.to(`stream:${stream.id}`).emit('stream-status', {
        status: 'live',
        startedAt: new Date().toISOString()
      });

      res.json({ code: 0 }); // Accept
    } catch (error) {
      console.error('on-publish error:', error);
      res.json({ code: 1 });
    }
  });

  // Called when a publisher stops streaming
  app.post('/api/webhooks/rtmp/on-unpublish', async (req, res) => {
    const payload: SRSWebhookPayload = req.body;
    console.log('RTMP on-unpublish:', payload.stream);

    try {
      const stream = await prisma.stream.findUnique({
        where: { rtmpKey: payload.stream }
      });

      if (stream) {
        // Stop all FFmpeg relay workers
        await stopFFmpegWorkers(stream.id);

        // Stop recording process and upload to S3
        await stopRecording(stream.id);

        await prisma.stream.update({
          where: { id: stream.id },
          data: { status: 'ended' }
        });

        await setStreamStatus(stream.id, 'ended', {
          endedAt: new Date().toISOString()
        });

        io.to(`stream:${stream.id}`).emit('stream-status', {
          status: 'ended',
          endedAt: new Date().toISOString()
        });
      }

      res.json({ code: 0 });
    } catch (error) {
      console.error('on-unpublish error:', error);
      res.json({ code: 0 }); // Always accept to prevent SRS retries
    }
  });

  app.post('/api/webhooks/rtmp/on-connect', (_req, res) => res.json({ code: 0 }));
  app.post('/api/webhooks/rtmp/on-close', (_req, res) => res.json({ code: 0 }));

  console.log('RTMP webhook handlers registered');
}

function startRecording(streamId: string, rtmpKey: string) {
  const outputPath = path.join(os.tmpdir(), `recording-${streamId}.mp4`);
  const rtmpInput = `rtmp://localhost:1935/live/${rtmpKey}`;

  console.log(`Starting recording for stream ${streamId}`);

  const ffmpeg = spawnFFmpeg([
    '-i', rtmpInput,
    '-c', 'copy',
    '-y',
    outputPath
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  ffmpeg.on('error', (err) => console.error(`Recording error for ${streamId}:`, err.message));
  recordingProcesses.set(streamId, ffmpeg);
}

async function stopRecording(streamId: string) {
  const proc = recordingProcesses.get(streamId);
  if (!proc) return;

  recordingProcesses.delete(streamId);

  await new Promise<void>(resolve => {
    proc.kill('SIGTERM');
    proc.on('close', () => resolve());
    setTimeout(() => { proc.kill('SIGKILL'); resolve(); }, 5000);
  });

  const outputPath = path.join(os.tmpdir(), `recording-${streamId}.mp4`);
  try {
    const s3Url = await uploadRecording(streamId, outputPath);
    if (s3Url) {
      await prisma.stream.update({
        where: { id: streamId },
        data: { recordingUrl: s3Url }
      });
      console.log(`Recording uploaded for stream ${streamId}: ${s3Url}`);
    }
  } catch (err) {
    console.error(`Failed to upload recording for ${streamId}:`, err);
  }
}
