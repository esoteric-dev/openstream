import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@multistream/db';

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
  } catch (error) { res.status(401).json({ error: 'Invalid token' }); }
};

router.use(authMiddleware);

// GET /api/recordings - Get all recordings for user
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const streams = await prisma.stream.findMany({
      where: { userId, recordingUrl: { not: null } },
      select: { id: true, title: true, recordingUrl: true, createdAt: true }
    });
    res.json(streams);
  } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
