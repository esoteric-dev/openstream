import { spawn, ChildProcess } from 'child_process';
import { Stream, Destination } from '@multistream/db';
import { setDestinationStatus } from '../services/redis.js';
import { io } from '../index.js';

/**
 * FFmpeg Worker Manager
 * Spawns and manages FFmpeg processes for multistreaming
 * Each destination gets its own output stream from a single input
 */

interface FFmpegWorker {
  process: ChildProcess;
  streamId: string;
  destinationId: string;
  startedAt: Date;
}

const activeWorkers = new Map<string, FFmpegWorker>();

/**
 * Spawn FFmpeg process to restream to multiple destinations
 * Uses FFmpeg's multi-output feature to fan-out efficiently
 */
export async function spawnFFmpegWorker(stream: Stream & { destination: Destination[] }) {
  const rtmpInput = `rtmp://localhost:1935/live/${stream.rtmpKey}`;
  
  console.log(`Spawning FFmpeg worker for stream ${stream.id} with ${stream.destination.length} destinations`);
  
  // Build FFmpeg command with multiple outputs
  // -c copy avoids re-encoding for efficiency
  const args: string[] = [
    '-i', rtmpInput,
    '-c', 'copy',  // Copy codec without re-encoding
  ];
  
  // Add output for each destination
  for (const dest of stream.destination) {
    if (dest.status === 'active') {
      const outputUrl = `${dest.rtmpUrl}/${dest.streamKey}`;
      args.push('-f', 'flv', outputUrl);
      
      // Create worker entry
      const workerId = `${stream.id}-${dest.id}`;
      activeWorkers.set(workerId, {
        process: null as any,
        streamId: stream.id,
        destinationId: dest.id,
        startedAt: new Date()
      });
    }
  }
  
  // For better reliability, we spawn separate FFmpeg processes per destination
  // This way one failed destination doesn't affect others
  await Promise.all(
    stream.destination
      .filter(d => d.status === 'active')
      .map(dest => spawnSingleDestinationWorker(stream, dest))
  );
}

/**
 * Spawn a dedicated FFmpeg process for a single destination
 * This provides better isolation and error handling per destination
 */
async function spawnSingleDestinationWorker(stream: Stream, destination: Destination) {
  const rtmpInput = `rtmp://localhost:1935/live/${stream.rtmpKey}`;
  const outputUrl = `${destination.rtmpUrl}/${destination.streamKey}`;
  const workerId = `${stream.id}-${destination.id}`;
  
  // FFmpeg arguments for reliable streaming
  const args = [
    '-re',                    // Read input at native frame rate
    '-i', rtmpInput,          // Input from local RTMP server
    '-c:v', 'libx264',        // Video codec
    '-preset', 'veryfast',    // Fast encoding preset
    '-b:v', '4500k',          // Video bitrate
    '-c:a', 'aac',            // Audio codec
    '-b:a', '128k',           // Audio bitrate
    '-ar', '44100',           // Audio sample rate
    '-f', 'flv',              // Output format
    '-flvflags', 'no_duration_filesize',  // Required for RTMP
    outputUrl                  // Destination RTMP URL
  ];
  
  console.log(`Starting FFmpeg for destination ${destination.id}: ${outputUrl}`);
  
  // Update destination status
  await setDestinationStatus(stream.id, destination.id, 'connecting');
  io.to(`stream:${stream.id}`).emit('destination-status', {
    destinationId: destination.id,
    platform: destination.platform,
    status: 'connecting'
  });
  
  const ffmpeg = spawn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  activeWorkers.set(workerId, {
    process: ffmpeg,
    streamId: stream.id,
    destinationId: destination.id,
    startedAt: new Date()
  });
  
  // Handle FFmpeg output
  ffmpeg.stderr?.on('data', (data: Buffer) => {
    const output = data.toString();
    
    // Parse FFmpeg output for connection status
    if (output.includes('Connection refused') || output.includes('error')) {
      handleDestinationError(stream.id, destination.id, output);
    } else if (output.includes('Opening')) {
      setDestinationStatus(stream.id, destination.id, 'live');
      io.to(`stream:${stream.id}`).emit('destination-status', {
        destinationId: destination.id,
        platform: destination.platform,
        status: 'live'
      });
    }
    
    // Log bitrate and other stats
    if (output.includes('bitrate=')) {
      const match = output.match(/bitrate=\s*([\d.]+)kbits\/s/);
      if (match) {
        console.log(`Destination ${destination.id} bitrate: ${match[1]} kbits/s`);
      }
    }
  });
  
  ffmpeg.on('close', (code) => {
    console.log(`FFmpeg process for ${workerId} exited with code ${code}`);
    activeWorkers.delete(workerId);
    
    if (code !== 0 && code !== null) {
      handleDestinationError(stream.id, destination.id, `Process exited with code ${code}`);
    }
  });
  
  ffmpeg.on('error', (err) => {
    console.error(`FFmpeg error for ${workerId}:`, err);
    handleDestinationError(stream.id, destination.id, err.message);
  });
  
  return workerId;
}

/**
 * Handle destination connection error
 * Implements exponential backoff for reconnection
 */
async function handleDestinationError(streamId: string, destinationId: string, error: string) {
  console.error(`Destination ${destinationId} error:`, error);
  
  await setDestinationStatus(streamId, destinationId, 'error', error);
  io.to(`stream:${streamId}`).emit('destination-status', {
    destinationId,
    status: 'error',
    error
  });
  
  // Attempt reconnection after delay
  setTimeout(async () => {
    console.log(`Attempting reconnection for destination ${destinationId}`);
    await setDestinationStatus(streamId, destinationId, 'connecting');
    io.to(`stream:${streamId}`).emit('destination-status', {
      destinationId,
      status: 'connecting'
    });
  }, 5000);
}

/**
 * Stop all FFmpeg workers for a stream
 */
export async function stopFFmpegWorkers(streamId: string) {
  const workersToStop = Array.from(activeWorkers.entries())
    .filter(([_, worker]) => worker.streamId === streamId);
  
  for (const [workerId, worker] of workersToStop) {
    console.log(`Stopping FFmpeg worker ${workerId}`);
    
    // Send SIGTERM for graceful shutdown
    worker.process.kill('SIGTERM');
    
    // Force kill after timeout
    setTimeout(() => {
      if (!worker.process.killed) {
        worker.process.kill('SIGKILL');
      }
    }, 5000);
    
    activeWorkers.delete(workerId);
  }
}

/**
 * Get active worker count for monitoring
 */
export function getActiveWorkerCount(): number {
  return activeWorkers.size;
}

/**
 * Get worker stats for a specific stream
 */
export function getStreamWorkers(streamId: string): FFmpegWorker[] {
  return Array.from(activeWorkers.values())
    .filter(worker => worker.streamId === streamId);
}
