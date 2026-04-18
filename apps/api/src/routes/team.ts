import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
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

router.use(authMiddleware);

// GET /api/team/members - List team members for the owner's team
router.get('/members', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const team = await prisma.team.findFirst({
      where: { ownerId: userId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    res.json(team?.members ?? []);
  } catch { res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/team/members - Invite a member by email
router.post('/members', async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email(),
    role: z.enum(['admin', 'manager', 'viewer']).default('viewer'),
  });

  try {
    const { email, role } = schema.parse(req.body);
    const ownerId = (req as any).userId;

    // Check plan — only Business and Enterprise can have teams
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      include: { subscription: true },
    });

    const plan = owner?.subscription?.plan || owner?.plan || 'free';
    if (!['business', 'enterprise'].includes(plan)) {
      return res.status(403).json({ error: 'Team management requires Business plan or higher' });
    }

    // Get or create the team
    let team = await prisma.team.findFirst({ where: { ownerId } });
    if (!team) {
      team = await prisma.team.create({
        data: { ownerId, name: `${owner?.name ?? 'My'}'s Team` },
      });
    }

    // Find or create the invited user
    let invitee = await prisma.user.findUnique({ where: { email } });
    if (!invitee) {
      // Create a placeholder account — they'll reset password on first login
      const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      invitee = await prisma.user.create({
        data: {
          email,
          name: email.split('@')[0],
          password: await bcrypt.hash(tempPassword, 12),
          plan: 'free',
        },
      });
    }

    // Add to team (upsert to avoid duplicates)
    const member = await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: invitee.id } },
      create: { teamId: team.id, userId: invitee.id, role },
      update: { role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    res.status(201).json(member);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error('Invite member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/team/members/:memberId - Update member role
router.put('/members/:memberId', async (req: Request, res: Response) => {
  const schema = z.object({ role: z.enum(['admin', 'manager', 'viewer']) });
  try {
    const { role } = schema.parse(req.body);
    const ownerId = (req as any).userId;

    const team = await prisma.team.findFirst({ where: { ownerId } });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const member = await prisma.teamMember.updateMany({
      where: { id: req.params.memberId, teamId: team.id },
      data: { role },
    });

    if (member.count === 0) return res.status(404).json({ error: 'Member not found' });
    res.json({ message: 'Role updated' });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/team/members/:memberId - Remove a member
router.delete('/members/:memberId', async (req: Request, res: Response) => {
  try {
    const ownerId = (req as any).userId;
    const team = await prisma.team.findFirst({ where: { ownerId } });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    await prisma.teamMember.deleteMany({
      where: { id: req.params.memberId, teamId: team.id },
    });
    res.json({ message: 'Member removed' });
  } catch { res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
