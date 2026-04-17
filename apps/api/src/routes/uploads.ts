import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

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

// POST /api/uploads/presigned-url - Generate S3 presigned URL for upload
router.post('/presigned-url', async (req: Request, res: Response) => {
  try {
    const { filename, contentType } = req.body;
    // In production, use AWS SDK to generate presigned URL
    const presignedUrl = `https://${process.env.S3_BUCKET}.s3.amazonaws.com/uploads/${(req as any).userId}/${Date.now()}-${filename}`;
    res.json({ url: presignedUrl, key: `uploads/${(req as any).userId}/${Date.now()}-${filename}` });
  } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
