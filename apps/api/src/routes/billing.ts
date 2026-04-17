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

// POST /api/billing/checkout - Create Stripe checkout session
router.post('/checkout', async (req: Request, res: Response) => {
  try {
    const { plan } = req.body;
    // In production, create Stripe checkout session
    res.json({ url: 'https://checkout.stripe.com/session_id' });
  } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/billing/portal - Get Stripe billing portal URL
router.get('/portal', async (req: Request, res: Response) => {
  try {
    res.json({ url: 'https://billing.stripe.com/session_id' });
  } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/billing/webhook - Stripe webhook handler
router.post('/webhook', async (req: Request, res: Response) => {
  // Handle Stripe webhooks in production
  res.json({ received: true });
});

export default router;
