import { prisma } from '@multistream/db';

interface PlatformRecord {
  id: string;
  type: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

/**
 * Ensure the platform's access token is fresh.
 * If expired (or within 5-minute buffer), refresh it and update the DB.
 * Returns the (possibly refreshed) access token.
 */
export async function ensureFreshToken(platform: PlatformRecord): Promise<string> {
  if (!platform.expiresAt) return platform.accessToken;

  const bufferMs = 5 * 60 * 1000; // 5 minutes
  const isExpired = platform.expiresAt.getTime() - bufferMs < Date.now();

  if (!isExpired) return platform.accessToken;

  if (!platform.refreshToken) {
    throw new Error(`${platform.type} token expired and no refresh token available`);
  }

  switch (platform.type) {
    case 'youtube':
      return refreshYouTubeToken(platform);
    case 'twitch':
      return refreshTwitchToken(platform);
    default:
      // Facebook long-lived tokens last ~60 days; no standard refresh flow
      return platform.accessToken;
  }
}

async function refreshYouTubeToken(platform: PlatformRecord): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID || '',
    client_secret: process.env.YOUTUBE_CLIENT_SECRET || '',
    refresh_token: platform.refreshToken!,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const data: any = await res.json();
  if (data.error) throw new Error(`YouTube token refresh failed: ${data.error_description || data.error}`);

  const newAccessToken = data.access_token;
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;

  await prisma.platform.update({
    where: { id: platform.id },
    data: {
      accessToken: newAccessToken,
      // Google may issue a new refresh token; update if present
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      expiresAt,
    },
  });

  console.log(`Refreshed YouTube token for platform ${platform.id}`);
  return newAccessToken;
}

async function refreshTwitchToken(platform: PlatformRecord): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID || '',
    client_secret: process.env.TWITCH_CLIENT_SECRET || '',
    refresh_token: platform.refreshToken!,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const data: any = await res.json();
  if (data.error) throw new Error(`Twitch token refresh failed: ${data.message || data.error}`);

  const newAccessToken = data.access_token;
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;

  await prisma.platform.update({
    where: { id: platform.id },
    data: {
      accessToken: newAccessToken,
      refreshToken: data.refresh_token ?? platform.refreshToken,
      expiresAt,
    },
  });

  console.log(`Refreshed Twitch token for platform ${platform.id}`);
  return newAccessToken;
}
