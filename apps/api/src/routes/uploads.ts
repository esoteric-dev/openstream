import { Router, Request, Response } from 'express';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { s3, S3_BUCKET, getObjectUrl, isStorageConfigured } from '../services/s3.js';

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

const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/mpeg'];

const presignedSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().refine(t => ALLOWED_TYPES.includes(t), {
    message: 'Unsupported file type. Allowed: mp4, mov, webm, avi, mpeg',
  }),
});

// POST /api/uploads/presigned-url
// Returns a presigned PUT URL so the client uploads directly to MinIO/S3.
router.post('/presigned-url', async (req: Request, res: Response) => {
  if (!isStorageConfigured()) {
    return res.status(503).json({ error: 'Storage not configured' });
  }

  try {
    const { filename, contentType } = presignedSchema.parse(req.body);
    const userId = (req as any).userId;
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `uploads/${userId}/${Date.now()}-${safeFilename}`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    let url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    // In Docker the S3 client uses the internal endpoint (e.g. http://minio:9000).
    // Replace it with the public URL so browsers can reach it.
    const internalEndpoint = process.env.MINIO_ENDPOINT;
    const publicEndpoint = process.env.MINIO_PUBLIC_URL;
    if (internalEndpoint && publicEndpoint && url.startsWith(internalEndpoint)) {
      url = publicEndpoint + url.slice(internalEndpoint.length);
    }

    res.json({ url, key, publicUrl: getObjectUrl(key) });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0].message });
    console.error('Presigned URL error:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// DELETE /api/uploads/:key - Remove an uploaded file
router.delete('/:key(*)', async (req: Request, res: Response) => {
  if (!isStorageConfigured()) return res.status(503).json({ error: 'Storage not configured' });

  const userId = (req as any).userId;
  const key = req.params.key;

  if (!key.startsWith(`uploads/${userId}/`)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    res.json({ message: 'File deleted' });
  } catch (error) {
    console.error('Delete object error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
