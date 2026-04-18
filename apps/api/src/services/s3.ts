import { S3Client, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';

// MinIO takes priority when MINIO_ENDPOINT is set; falls back to AWS S3.
// Client is created lazily on first use so env vars are always populated.
let _s3: S3Client | null = null;

function buildClient(): S3Client {
  if (process.env.MINIO_ENDPOINT) {
    return new S3Client({
      endpoint: process.env.MINIO_ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
      },
    });
  }

  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY || '',
      secretAccessKey: process.env.AWS_SECRET_KEY || '',
    },
  });
}

export const s3: S3Client = new Proxy({} as S3Client, {
  get(_target, prop) {
    if (!_s3) _s3 = buildClient();
    return (_s3 as any)[prop];
  },
});

export const S3_BUCKET = process.env.S3_BUCKET || 'openstream';

// Build a public URL for a stored object.
// MinIO:  http://localhost:9000/openstream/key
// AWS S3: https://bucket.s3.region.amazonaws.com/key
// Public URL used by browsers — may differ from the internal MINIO_ENDPOINT
// when the API is running inside Docker (set MINIO_PUBLIC_URL to the host-accessible address).
export function getObjectUrl(key: string): string {
  const bucket = process.env.S3_BUCKET || 'openstream';
  const publicEndpoint = process.env.MINIO_PUBLIC_URL || process.env.MINIO_ENDPOINT;
  if (publicEndpoint) {
    return `${publicEndpoint}/${bucket}/${key}`;
  }
  const region = process.env.AWS_REGION || 'us-east-1';
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export function isStorageConfigured(): boolean {
  return !!(process.env.MINIO_ENDPOINT || process.env.AWS_ACCESS_KEY);
}

// Called once at server startup — creates the bucket if it doesn't exist
// and sets a public-read policy so recordings are directly streamable.
export async function ensureBucket(): Promise<void> {
  if (!isStorageConfigured()) return;

  try {
    await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    console.log(`Storage bucket "${S3_BUCKET}" ready`);
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
      console.log(`Storage bucket "${S3_BUCKET}" created`);

      // Allow public GET so recording URLs are directly playable/downloadable
      const publicReadPolicy = JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${S3_BUCKET}/*`],
        }],
      });

      await s3.send(new PutBucketPolicyCommand({
        Bucket: S3_BUCKET,
        Policy: publicReadPolicy,
      }));
      console.log(`Public-read policy applied to "${S3_BUCKET}"`);
    } catch (err: any) {
      console.error('Failed to create storage bucket:', err.message);
    }
  }

  // Configure CORS so browsers can PUT presigned uploads directly to MinIO
  try {
    await s3.send(new PutBucketCorsCommand({
      Bucket: S3_BUCKET,
      CORSConfiguration: {
        CORSRules: [{
          AllowedOrigins: ['*'],
          AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600,
        }],
      },
    }));
    console.log(`CORS configured on "${S3_BUCKET}"`);
  } catch (err: any) {
    console.error('Failed to set bucket CORS:', err.message);
  }
}
