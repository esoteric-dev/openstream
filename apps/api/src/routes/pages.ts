import { Router, Request, Response } from 'express';
import { z } from 'zod';
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

const pageSchema = z.object({ slug: z.string().min(3), title: z.string(), streamId: z.string().optional() });

// GET /api/pages - Get all hosted pages
router.get('/', async (req: Request, res: Response) => {
  try {
    const pages = await prisma.hostedPage.findMany({ where: { userId: (req as any).userId } });
    res.json(pages);
  } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/pages - Create hosted page
router.post('/', async (req: Request, res: Response) => {
  try {
    const { slug, title, streamId } = pageSchema.parse(req.body);
    const page = await prisma.hostedPage.create({ data: { userId: (req as any).userId, slug, title, streamId } });
    res.status(201).json(page);
  } catch (error) { res.status(error instanceof z.ZodError ? 400 : 500).json({ error: 'Invalid request' }); }
});

export default router;
