import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import { prisma } from '@multistream/db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' as any })
  : null;

// Stripe price IDs — set these in .env after creating products in Stripe dashboard
const PRICE_IDS: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRO_PRICE_ID,
  business: process.env.STRIPE_BUSINESS_PRICE_ID,
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID,
};

const PLAN_FROM_PRICE: Record<string, string> = {};
if (process.env.STRIPE_PRO_PRICE_ID) PLAN_FROM_PRICE[process.env.STRIPE_PRO_PRICE_ID] = 'pro';
if (process.env.STRIPE_BUSINESS_PRICE_ID) PLAN_FROM_PRICE[process.env.STRIPE_BUSINESS_PRICE_ID] = 'business';
if (process.env.STRIPE_ENTERPRISE_PRICE_ID) PLAN_FROM_PRICE[process.env.STRIPE_ENTERPRISE_PRICE_ID] = 'enterprise';

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

// Stripe webhook must receive raw body — mount before authMiddleware
// POST /api/billing/webhook
router.post('/webhook',
  (req: Request, res: Response, next: any) => {
    // Collect raw body for signature verification
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk; });
    req.on('end', () => {
      (req as any).rawBody = rawBody;
      next();
    });
  },
  async (req: Request, res: Response) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res.json({ received: true });
    }

    const sig = req.headers['stripe-signature'];
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        (req as any).rawBody,
        sig as string,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err: any) {
      console.error('Webhook signature error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;
          const subscriptionId = session.subscription as string;
          if (!userId || !subscriptionId) break;

          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items.data[0]?.price.id;
          const plan = PLAN_FROM_PRICE[priceId] || 'pro';

          await prisma.$transaction([
            prisma.user.update({
              where: { id: userId },
              data: { plan, stripeCustomerId: session.customer as string },
            }),
            prisma.subscription.upsert({
              where: { userId },
              create: {
                userId,
                plan,
                status: subscription.status,
                stripeSubId: subscriptionId,
                currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
              },
              update: {
                plan,
                status: subscription.status,
                stripeSubId: subscriptionId,
                currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
              },
            }),
          ]);
          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          const existing = await prisma.subscription.findFirst({ where: { stripeSubId: sub.id } });
          if (!existing) break;

          const priceId = sub.items.data[0]?.price.id;
          const plan = PLAN_FROM_PRICE[priceId] || existing.plan;

          await prisma.$transaction([
            prisma.subscription.update({
              where: { stripeSubId: sub.id } as any,
              data: {
                plan,
                status: sub.status,
                currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
              },
            }),
            prisma.user.update({
              where: { id: existing.userId },
              data: { plan },
            }),
          ]);
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          const existing = await prisma.subscription.findFirst({ where: { stripeSubId: sub.id } });
          if (!existing) break;

          await prisma.$transaction([
            prisma.subscription.update({
              where: { stripeSubId: sub.id } as any,
              data: { status: 'canceled' },
            }),
            prisma.user.update({
              where: { id: existing.userId },
              data: { plan: 'free' },
            }),
          ]);
          break;
        }
      }
    } catch (err) {
      console.error('Webhook handler error:', err);
    }

    res.json({ received: true });
  }
);

// All routes below require auth
router.use(authMiddleware);

// POST /api/billing/checkout - Create Stripe checkout session
router.post('/checkout', async (req: Request, res: Response) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Billing not configured' });
  }

  const { plan } = req.body;
  const priceId = PRICE_IDS[plan];

  if (!priceId) {
    return res.status(400).json({ error: `No price configured for plan: ${plan}` });
  }

  try {
    const userId = (req as any).userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true, email: true },
    });

    const session = await stripe.checkout.sessions.create({
      customer: user?.stripeCustomerId || undefined,
      customer_email: user?.stripeCustomerId ? undefined : user?.email,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/dashboard/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard/billing`,
      metadata: { userId },
      allow_promotion_codes: true,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
});

// GET /api/billing/portal - Customer billing portal
router.get('/portal', async (req: Request, res: Response) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Billing not configured' });
  }

  try {
    const userId = (req as any).userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard/billing`,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error('Portal error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/billing/subscription - Current subscription info
router.get('/subscription', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    res.json(subscription);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
