import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '@multistream/db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const authMiddleware = (req: Request, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    (req as any).userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.use(authMiddleware);

// GET /api/platforms - Get all connected platforms
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const platforms = await prisma.platform.findMany({
      where: { userId },
      select: { id: true, type: true, channelName: true, channelId: true, createdAt: true }
    });
    res.json(platforms);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/platforms/oauth/:type - Initiate OAuth flow
router.post('/oauth/:type', async (req: Request, res: Response) => {
  const { type } = req.params;
  const oauthUrls: Record<string, string> = {
    youtube: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.YOUTUBE_CLIENT_ID}&redirect_uri=${process.env.FRONTEND_URL}/callback/youtube&response_type=code&scope=https://www.googleapis.com/auth/youtube.force-ssl`,
    facebook: `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${process.env.FRONTEND_URL}/callback/facebook&scope=pages_manage_posts,pages_read_engagement`,
    twitch: `https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${process.env.FRONTEND_URL}/callback/twitch&response_type=code&scope=channel:manage:broadcast`
  };
  
  if (!oauthUrls[type]) {
    return res.status(400).json({ error: 'Unsupported platform' });
  }
  
  res.json({ url: oauthUrls[type] });
});

// DELETE /api/platforms/:id - Disconnect platform
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    
    await prisma.platform.deleteMany({
      where: { id, userId }
    });
    
    res.json({ message: 'Platform disconnected' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
