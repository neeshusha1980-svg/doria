import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

export type StorageAdapter = {
  uploadBase64(params: { key: string; base64Content: string; contentType: string }): Promise<boolean>;
  getSignedReadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  getSignedReadUrls(keys: string[], expiresInSeconds?: number): Promise<Map<string, string>>;
  deleteKeys(keys: string[]): Promise<void>;
};

const internalS3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

const signerS3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_PUBLIC_URL || env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

export const s3Storage: StorageAdapter = {
  async uploadBase64({ key, base64Content, contentType }) {
    try {
      const body = Buffer.from(base64Content, 'base64');
      await internalS3.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      );
      return true;
    } catch (err) {
      console.error('[storage] Upload failed:', err);
      return false;
    }
  },

  async getSignedReadUrl(key, expiresInSeconds = 3600) {
    if (!key) return '';
    try {
      return await getSignedUrl(
        signerS3,
        new GetObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
        }),
        { expiresIn: expiresInSeconds }
      );
    } catch (err) {
      console.error('[storage] Presign failed:', err);
      return '';
    }
  },

  async getSignedReadUrls(keys, expiresInSeconds = 3600) {
    const result = new Map<string, string>();
    const unique = Array.from(new Set(keys.filter(Boolean)));
    await Promise.all(
      unique.map(async key => {
        const url = await this.getSignedReadUrl(key, expiresInSeconds);
        if (url) result.set(key, url);
      })
    );
    return result;
  },

  async deleteKeys(keys) {
    const valid = keys.filter(Boolean);
    if (valid.length === 0) return;
    try {
      await internalS3.send(
        new DeleteObjectsCommand({
          Bucket: env.S3_BUCKET,
          Delete: {
            Objects: valid.map(Key => ({ Key })),
          },
        })
      );
    } catch (err) {
      console.error('[storage] Delete failed:', err);
    }
  },
};
