// Headshot storage helpers (private S3 bucket). Uploads use presigned POST with
// a content-length-range condition so size/type limits are enforced by S3.
import { randomUUID } from 'crypto';
import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from './aws-clients';
import { config } from './config';
import { HEADSHOT_MAX_BYTES } from './validation';

/** Lifetime of signed URLs (Req 11.4). */
export const SIGNED_URL_TTL_SECONDS = 15 * 60;

export const headshotKeyPrefix = (speakerId: string): string => `headshots/${speakerId}/`;

export interface HeadshotUpload {
  url: string;
  fields: Record<string, string>;
  key: string;
  expiresInSeconds: number;
}

export async function createHeadshotUpload(
  speakerId: string,
  contentType: string,
): Promise<HeadshotUpload> {
  const key = `${headshotKeyPrefix(speakerId)}${randomUUID()}`;
  const { url, fields } = await createPresignedPost(s3Client, {
    Bucket: config.headshotsBucket,
    Key: key,
    Fields: { 'Content-Type': contentType },
    Conditions: [
      ['content-length-range', 1, HEADSHOT_MAX_BYTES],
      ['eq', '$Content-Type', contentType],
    ],
    Expires: SIGNED_URL_TTL_SECONDS,
  });
  return { url, fields, key, expiresInSeconds: SIGNED_URL_TTL_SECONDS };
}

export async function getHeadshotUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: config.headshotsBucket, Key: key }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}

export async function deleteHeadshot(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: config.headshotsBucket, Key: key }));
}
