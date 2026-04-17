import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient = createClient({
  url: REDIS_URL
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis client connecting...'));

// Helper functions for stream state management
export async function setStreamStatus(streamId: string, status: string, data?: any) {
  await redisClient.setEx(
    `stream:${streamId}:status`,
    3600, // 1 hour TTL
    JSON.stringify({ status, ...data, timestamp: Date.now() })
  );
}

export async function getStreamStatus(streamId: string) {
  const data = await redisClient.get(`stream:${streamId}:status`);
  return data ? JSON.parse(data) : null;
}

export async function setDestinationStatus(streamId: string, destinationId: string, status: string, error?: string) {
  await redisClient.hSet(
    `stream:${streamId}:destinations`,
    destinationId,
    JSON.stringify({ status, error, timestamp: Date.now() })
  );
}

export async function getDestinationStatuses(streamId: string) {
  const data = await redisClient.hGetAll(`stream:${streamId}:destinations`);
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = value ? JSON.parse(value) : null;
  }
  return result;
}

export async function incrementViewerCount(streamId: string) {
  return await redisClient.incr(`stream:${streamId}:viewers`);
}

export async function decrementViewerCount(streamId: string) {
  return await redisClient.decr(`stream:${streamId}:viewers`);
}

export async function getViewerCount(streamId: string) {
  const count = await redisClient.get(`stream:${streamId}:viewers`);
  return parseInt(count || '0');
}

export default redisClient;
