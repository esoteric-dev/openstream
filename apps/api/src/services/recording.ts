import { PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { s3, S3_BUCKET, getObjectUrl, isStorageConfigured } from './s3.js';

// Upload a finished recording file to MinIO / S3 and return its public URL.
// Returns null if storage is not configured or the file doesn't exist.
export async function uploadRecording(streamId: string, filePath: string): Promise<string | null> {
  if (!isStorageConfigured()) {
    console.warn(`Storage not configured — recording for ${streamId} not uploaded`);
    return null;
  }

  if (!fs.existsSync(filePath)) {
    console.warn(`Recording file not found: ${filePath}`);
    return null;
  }

  const key = `recordings/${streamId}/${path.basename(filePath)}`;
  const body = fs.createReadStream(filePath);
  const size = fs.statSync(filePath).size;

  console.log(`Uploading recording ${path.basename(filePath)} (${(size / 1024 / 1024).toFixed(1)} MB) → ${key}`);

  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: 'video/mp4',
    ContentLength: size,
  }));

  // Clean up temp file after successful upload
  fs.unlink(filePath, () => {});

  const url = getObjectUrl(key);
  console.log(`Recording uploaded: ${url}`);
  return url;
}
