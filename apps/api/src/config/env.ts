import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const PLACEHOLDER_PATTERNS = [
  'change_me',
  'replace_with',
  'doria_dev_secret',
];

function isPlaceholderSecret(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return PLACEHOLDER_PATTERNS.some(pattern => lower.includes(pattern));
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL must be configured.'),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters long.'),
    BETTER_AUTH_URL: z.string().url().default('http://localhost:4000'),
    CORS_ORIGIN: z.string().default('http://localhost:8080,http://localhost:5173'),
    GOOGLE_CLIENT_ID: z.string().optional().default(''),
    GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
    ADMIN_EMAILS: z.string().optional().default(''),
    S3_ENDPOINT: z.string().default('http://localhost:9000'),
    S3_PUBLIC_URL: z.string().default('http://localhost:9000'),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().default('doria-media'),
    S3_ACCESS_KEY_ID: z.string().optional().default(''),
    S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
    S3_FORCE_PATH_STYLE: z
      .string()
      .default('true')
      .transform(v => v.toLowerCase() === 'true'),
    NEO_AI_PROVIDER: z.enum(['openai', 'anthropic', 'gemini', 'openai-compatible']).default('openai'),
    NEO_AI_API_KEY: z.string().optional().default(''),
    NEO_AI_MODEL: z.string().default('gpt-4o-mini'),
    NEO_AI_BASE_URL: z.string().optional().default(''),
    NEO_AI_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
    REDIS_URL: z.string().optional().default(''),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== 'test') {
      if (isPlaceholderSecret(data.BETTER_AUTH_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['BETTER_AUTH_SECRET'],
          message: 'BETTER_AUTH_SECRET cannot use an example placeholder value.',
        });
      }
      if (isPlaceholderSecret(data.DATABASE_URL)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'DATABASE_URL cannot use an example placeholder password.',
        });
      }
      if (!data.S3_ACCESS_KEY_ID || !data.S3_SECRET_ACCESS_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['S3_ACCESS_KEY_ID'],
          message: 'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured.',
        });
      } else if (
        isPlaceholderSecret(data.S3_ACCESS_KEY_ID) ||
        isPlaceholderSecret(data.S3_SECRET_ACCESS_KEY)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['S3_SECRET_ACCESS_KEY'],
          message: 'S3 credentials cannot use example placeholder values.',
        });
      }
    }
  });

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  CORS_ORIGINS: parsed.CORS_ORIGIN.split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
  ADMIN_EMAIL_LIST: parsed.ADMIN_EMAILS.split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean),
};
