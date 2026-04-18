import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '@multistream/db';
import { ensureFreshToken } from '../services/token-refresh.js';

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
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};

router.use(authMiddleware);

// GET /api/platforms - List connected platforms
router.get('/', async (req: Request, res: Response) => {
  try {
    const platforms = await prisma.platform.findMany({
      where: { userId: (req as any).userId },
      select: { id: true, type: true, channelName: true, channelId: true, pageId: true, pageName: true, createdAt: true, expiresAt: true },
    });
    res.json(platforms);
  } catch { res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/platforms/oauth/:type - Get OAuth redirect URL
router.post('/oauth/:type', async (req: Request, res: Response) => {
  const { type } = req.params;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4000';
  const redirectUri = `${frontendUrl}/callback/${type}`;

  const urls: Record<string, string | null> = {
    youtube: process.env.YOUTUBE_CLIENT_ID
      ? `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.YOUTUBE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.force-ssl')}&access_type=offline&prompt=consent`
      : null,
    facebook: process.env.FACEBOOK_APP_ID
      ? `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=pages_manage_posts,pages_read_engagement,live_video`
      : null,
    twitch: process.env.TWITCH_CLIENT_ID
      ? `https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=channel%3Amanage%3Abroadcast+user%3Aread%3Aemail`
      : null,
  };

  const url = urls[type];
  if (url === undefined) return res.status(400).json({ error: 'Unsupported platform' });
  if (url === null) return res.status(503).json({ error: `${type} OAuth not configured` });

  res.json({ url });
});

// POST /api/platforms/oauth/:type/callback - Exchange auth code for tokens
router.post('/oauth/:type/callback', async (req: Request, res: Response) => {
  const { type } = req.params;
  const { code, pageId, pageName, pageAccessToken } = req.body;
  const userId = (req as any).userId;

  if (!code) return res.status(400).json({ error: 'Missing authorization code' });

  try {
    let tokenData: { accessToken: string; refreshToken?: string; expiresAt?: Date; channelId?: string; channelName?: string; pages?: any[] };

    switch (type) {
      case 'youtube':
        tokenData = await exchangeYouTubeCode(code);
        break;
      case 'twitch':
        tokenData = await exchangeTwitchCode(code);
        break;
      case 'facebook':
        tokenData = await exchangeFacebookCode(code);
        break;
      default:
        return res.status(400).json({ error: 'Unsupported platform' });
    }

    // If Facebook returned pages and user hasn't selected one yet, return pages list
    if (type === 'facebook' && tokenData.pages && !pageId) {
      return res.json({
        needsPageSelection: true,
        pages: tokenData.pages,
        // Pass token data back so frontend can re-submit with page selection
        tokenData: {
          accessToken: tokenData.accessToken,
          expiresAt: tokenData.expiresAt,
          channelId: tokenData.channelId,
          channelName: tokenData.channelName,
        },
      });
    }

    // Upsert platform record
    const platform = await prisma.platform.upsert({
      where: { userId_type: { userId, type } },
      create: {
        userId,
        type,
        accessToken: pageAccessToken || tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        channelId: tokenData.channelId,
        channelName: tokenData.channelName,
        pageId: pageId || null,
        pageName: pageName || null,
        expiresAt: tokenData.expiresAt,
      },
      update: {
        accessToken: pageAccessToken || tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        channelId: tokenData.channelId,
        channelName: tokenData.channelName,
        pageId: pageId || null,
        pageName: pageName || null,
        expiresAt: tokenData.expiresAt,
      },
      select: { id: true, type: true, channelName: true, channelId: true, pageId: true, pageName: true },
    });

    res.json(platform);
  } catch (error: any) {
    console.error(`OAuth callback error (${type}):`, error.message);
    res.status(500).json({ error: error.message || 'OAuth exchange failed' });
  }
});

// POST /api/platforms/:platformId/create-broadcast
// Auto-create a stream destination from a connected platform
router.post('/:platformId/create-broadcast', async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { platformId } = req.params;
  const { streamId, title } = req.body;

  if (!streamId) return res.status(400).json({ error: 'streamId is required' });

  try {
    // Verify platform belongs to user
    const platform = await prisma.platform.findFirst({
      where: { id: platformId, userId },
    });
    if (!platform) return res.status(404).json({ error: 'Platform not found' });

    // Verify stream belongs to user
    const stream = await prisma.stream.findFirst({
      where: { id: streamId, userId },
    });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    // Refresh token if needed
    const freshToken = await ensureFreshToken(platform);

    let broadcastData: { rtmpUrl: string; streamKey: string };

    switch (platform.type) {
      case 'youtube':
        broadcastData = await createYouTubeBroadcast(freshToken, title || stream.title);
        break;
      case 'twitch':
        broadcastData = await getTwitchStreamKey(freshToken, platform.channelId!);
        break;
      case 'facebook':
        broadcastData = await createFacebookBroadcast(freshToken, title || stream.title, platform.pageId);
        break;
      default:
        return res.status(400).json({ error: `Unsupported platform type: ${platform.type}` });
    }

    // Create destination record
    const destination = await prisma.destination.create({
      data: {
        streamId,
        platform: platform.type,
        rtmpUrl: broadcastData.rtmpUrl,
        streamKey: broadcastData.streamKey,
      },
    });

    res.status(201).json(destination);
  } catch (error: any) {
    console.error(`Create broadcast error:`, error.message);
    res.status(500).json({ error: error.message || 'Failed to create broadcast' });
  }
});

// POST /api/platforms/custom - Add custom RTMP destination
router.post('/custom', async (req: Request, res: Response) => {
  const schema = z.object({ channelName: z.string().min(1), rtmpUrl: z.string().url(), streamKey: z.string().min(1) });
  try {
    const { channelName, rtmpUrl, streamKey } = schema.parse(req.body);
    const userId = (req as any).userId;

    const platform = await prisma.platform.create({
      data: {
        userId,
        type: 'custom',
        accessToken: streamKey,  // store stream key in accessToken for custom destinations
        channelName,
        channelId: rtmpUrl,
      },
      select: { id: true, type: true, channelName: true },
    });
    res.status(201).json(platform);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/platforms/:id - Disconnect platform
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.platform.deleteMany({
      where: { id: req.params.id, userId: (req as any).userId },
    });
    res.json({ message: 'Platform disconnected' });
  } catch { res.status(500).json({ error: 'Internal server error' }); }
});

// --- OAuth token exchange helpers ---

async function exchangeYouTubeCode(code: string) {
  const redirectUri = `${process.env.FRONTEND_URL || 'http://localhost:4000'}/callback/youtube`;

  const params = new URLSearchParams({
    code,
    client_id: process.env.YOUTUBE_CLIENT_ID || '',
    client_secret: process.env.YOUTUBE_CLIENT_SECRET || '',
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const tokens: any = await tokenRes.json();
  if (tokens.error) throw new Error(tokens.error_description || tokens.error);

  // Fetch channel info
  const channelRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  );
  const channelData: any = await channelRes.json();
  const channel = channelData.items?.[0];

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
    channelId: channel?.id,
    channelName: channel?.snippet?.title,
  };
}

async function exchangeTwitchCode(code: string) {
  const redirectUri = `${process.env.FRONTEND_URL || 'http://localhost:4000'}/callback/twitch`;

  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID || '',
    client_secret: process.env.TWITCH_CLIENT_SECRET || '',
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const tokens: any = await tokenRes.json();
  if (tokens.error) throw new Error(tokens.message || tokens.error);

  // Fetch user info
  const userRes = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Client-Id': process.env.TWITCH_CLIENT_ID || '',
    },
  });
  const userData: any = await userRes.json();
  const user = userData.data?.[0];

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
    channelId: user?.id,
    channelName: user?.display_name,
  };
}

async function exchangeFacebookCode(code: string) {
  const redirectUri = `${process.env.FRONTEND_URL || 'http://localhost:4000'}/callback/facebook`;

  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID || '',
    client_secret: process.env.FACEBOOK_APP_SECRET || '',
    redirect_uri: redirectUri,
    code,
  });

  const tokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?${params}`);
  const tokens: any = await tokenRes.json();
  if (tokens.error) throw new Error(tokens.error.message || 'Facebook OAuth failed');

  // Fetch user info
  const meRes = await fetch(
    `https://graph.facebook.com/me?fields=id,name&access_token=${tokens.access_token}`
  );
  const me: any = await meRes.json();

  // Fetch user's Pages (for Page-level live streaming)
  let pages: any[] = [];
  try {
    const pagesRes = await fetch(
      `https://graph.facebook.com/me/accounts?fields=id,name,access_token&access_token=${tokens.access_token}`
    );
    const pagesData: any = await pagesRes.json();
    pages = pagesData.data?.map((p: any) => ({
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
    })) || [];
  } catch (err) {
    console.warn('Failed to fetch Facebook pages:', err);
  }

  return {
    accessToken: tokens.access_token,
    expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
    channelId: me.id,
    channelName: me.name,
    pages: pages.length > 0 ? pages : undefined,
  };
}

// --- Broadcast creation helpers ---

async function createYouTubeBroadcast(accessToken: string, title: string) {
  // First, check for existing reusable upcoming broadcasts to save API quota
  const existingRes = await fetch(
    'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,contentDetails,status&broadcastStatus=upcoming&mine=true&maxResults=5',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const existing: any = await existingRes.json();

  if (existing.items?.length > 0) {
    // Reuse the first upcoming broadcast
    const broadcast = existing.items[0];
    const boundStreamId = broadcast.contentDetails?.boundStreamId;

    if (boundStreamId) {
      // Fetch the stream's ingestion info
      const streamRes = await fetch(
        `https://www.googleapis.com/youtube/v3/liveStreams?part=cdn&id=${boundStreamId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const streamData: any = await streamRes.json();
      const ingestion = streamData.items?.[0]?.cdn?.ingestionInfo;

      if (ingestion) {
        console.log(`Reusing existing YouTube broadcast: ${broadcast.id}`);
        return {
          rtmpUrl: ingestion.ingestionAddress,
          streamKey: ingestion.streamName,
        };
      }
    }
  }

  // No reusable broadcast found — create a new one
  // Step 1: Create broadcast
  const broadcastRes = await fetch(
    'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,contentDetails,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: {
          title,
          scheduledStartTime: new Date().toISOString(),
        },
        contentDetails: {
          enableAutoStart: true,
          enableAutoStop: true,
        },
        status: {
          privacyStatus: 'public',
        },
      }),
    }
  );
  const broadcast: any = await broadcastRes.json();
  if (broadcast.error) throw new Error(broadcast.error.message || 'Failed to create YouTube broadcast');

  // Step 2: Create stream
  const liveStreamRes = await fetch(
    'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: {
          title: `${title} - Stream`,
        },
        cdn: {
          frameRate: '30fps',
          ingestionType: 'rtmp',
          resolution: '1080p',
        },
      }),
    }
  );
  const liveStream: any = await liveStreamRes.json();
  if (liveStream.error) throw new Error(liveStream.error.message || 'Failed to create YouTube stream');

  // Step 3: Bind stream to broadcast
  await fetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${broadcast.id}&part=id,contentDetails&streamId=${liveStream.id}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const ingestion = liveStream.cdn?.ingestionInfo;
  if (!ingestion) throw new Error('Failed to get YouTube ingestion info');

  return {
    rtmpUrl: ingestion.ingestionAddress,
    streamKey: ingestion.streamName,
  };
}

async function getTwitchStreamKey(accessToken: string, broadcasterId: string) {
  const res = await fetch(
    `https://api.twitch.tv/helix/streams/key?broadcaster_id=${broadcasterId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': process.env.TWITCH_CLIENT_ID || '',
      },
    }
  );
  const data: any = await res.json();
  const streamKey = data.data?.[0]?.stream_key;
  if (!streamKey) throw new Error('Failed to get Twitch stream key');

  return {
    rtmpUrl: 'rtmp://live.twitch.tv/live',
    streamKey,
  };
}

async function createFacebookBroadcast(accessToken: string, title: string, pageId?: string | null) {
  // Use page ID if available, otherwise user profile
  const target = pageId || 'me';

  const res = await fetch(
    `https://graph.facebook.com/v18.0/${target}/live_videos`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        access_token: accessToken,
        status: 'LIVE_NOW',
      }),
    }
  );
  const data: any = await res.json();
  if (data.error) throw new Error(data.error.message || 'Failed to create Facebook live video');

  // Facebook returns stream_url in format: rtmp://...?s=streamkey
  const streamUrl = data.stream_url || '';
  const urlParts = streamUrl.split('?s=');

  return {
    rtmpUrl: urlParts[0] || streamUrl,
    streamKey: urlParts[1] || data.stream_url || '',
  };
}

export default router;
