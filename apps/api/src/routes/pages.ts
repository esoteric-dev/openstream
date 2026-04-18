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
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};

const pageSchema = z.object({
  slug: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  title: z.string().min(1).max(200),
  streamId: z.string().optional(),
  customDomain: z.string().optional(),
});

// GET /api/pages/public/:slug - Public endpoint (no auth) for the hosted live page
router.get('/public/:slug', async (req: Request, res: Response) => {
  try {
    const page = await prisma.hostedPage.findUnique({
      where: { slug: req.params.slug },
      include: {
        stream: { select: { id: true, title: true, status: true, rtmpKey: true } },
        user: { select: { name: true } },
      },
    });
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json(page);
  } catch { res.status(500).json({ error: 'Internal server error' }); }
});

// All routes below require auth
router.use(authMiddleware);

// GET /api/pages - List all hosted pages for the authenticated user
router.get('/', async (req: Request, res: Response) => {
  try {
    const pages = await prisma.hostedPage.findMany({
      where: { userId: (req as any).userId },
      include: { stream: { select: { id: true, title: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(pages);
  } catch { res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/pages - Create a hosted page
router.post('/', async (req: Request, res: Response) => {
  try {
    const { slug, title, streamId, customDomain } = pageSchema.parse(req.body);
    const userId = (req as any).userId;

    // Slug uniqueness is enforced by DB constraint — catch the error gracefully
    const page = await prisma.hostedPage.create({
      data: { userId, slug, title, streamId, customDomain },
    });
    res.status(201).json(page);
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
    if (error.code === 'P2002') return res.status(409).json({ error: 'Slug already taken' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/pages/:id - Update a hosted page
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const updateSchema = pageSchema.partial();
    const data = updateSchema.parse(req.body);

    const existing = await prisma.hostedPage.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!existing) return res.status(404).json({ error: 'Page not found' });

    const page = await prisma.hostedPage.update({
      where: { id: req.params.id },
      data,
    });
    res.json(page);
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
    if (error.code === 'P2002') return res.status(409).json({ error: 'Slug already taken' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/pages/:id - Delete a hosted page
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deleted = await prisma.hostedPage.deleteMany({
      where: { id: req.params.id, userId },
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Page not found' });
    res.json({ message: 'Page deleted' });
  } catch { res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
