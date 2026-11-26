import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db } from '../../src/db/index.js';
import { user } from '../../src/db/schema.js';
import { runMigrations } from '../../src/db/migrate.js';
import type { NeoProviderAdapter } from '../../src/ai/neo-adapter.js';
import type { StorageAdapter } from '../../src/storage/s3.js';

export class MemoryStorageAdapter implements StorageAdapter {
  public objects = new Map<string, { base64Content: string; contentType: string }>();

  async uploadBase64(params: {
    key: string;
    base64Content: string;
    contentType: string;
  }): Promise<boolean> {
    this.objects.set(params.key, {
      base64Content: params.base64Content,
      contentType: params.contentType,
    });
    return true;
  }

  async getSignedReadUrl(key: string): Promise<string> {
    if (!key || !this.objects.has(key)) return '';
    return `https://storage.local.test/${encodeURI(key)}?signed=1`;
  }

  async getSignedReadUrls(keys: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const key of keys) {
      const url = await this.getSignedReadUrl(key);
      if (url) map.set(key, url);
    }
    return map;
  }

  async deleteKeys(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.objects.delete(key);
    }
  }
}

export class StubNeoAdapter implements NeoProviderAdapter {
  public nextResult: { text: string } | Error = {
    text: '<!doctype html><html><head><title>Stub Neo Game</title></head><body><h1>Playable World</h1><button>Start</button></body></html>',
  };

  async generate() {
    if (this.nextResult instanceof Error) {
      throw this.nextResult;
    }
    return {
      text: this.nextResult.text,
      provider: 'stub',
      model: 'neo-test',
    };
  }
}

export async function resetDatabase() {
  await runMigrations();
  await db.execute(sql`
    TRUNCATE TABLE
      "admin_audit_logs",
      "ai_usage",
      "safety_profiles",
      "parental_settings",
      "parental_invites",
      "privacy_requests",
      "content_reports",
      "news_posts",
      "moments",
      "game_players",
      "chat_messages",
      "user_blocks",
      "friend_requests",
      "friends",
      "task_reward_claims",
      "reward_claims",
      "earned_badges",
      "badge_definitions",
      "owned_ugc",
      "ugc_items",
      "owned_gamepasses",
      "gamepasses",
      "game_completion_receipts",
      "game_play_sessions",
      "game_play_receipts",
      "game_likes",
      "games",
      "usernames",
      "profiles",
      "verification",
      "account",
      "session",
      "user"
    CASCADE;
  `);
}

export async function createTestContext() {
  await resetDatabase();
  const storage = new MemoryStorageAdapter();
  const neo = new StubNeoAdapter();
  const app = await buildApp({
    storage,
    neoAdapter: neo,
    enableRateLimit: false,
  });

  return { app, storage, neo };
}

export async function signUpAndGetCookie(
  app: FastifyInstance,
  params: { email: string; password: string; name: string; emailVerified?: boolean }
): Promise<{ cookie: string; userId: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: {
      email: params.email,
      password: params.password,
      name: params.name,
    },
  });

  if (res.statusCode !== 200) {
    throw new Error(`Sign up failed (${res.statusCode}): ${res.body}`);
  }

  const rawCookies = res.headers['set-cookie'];
  const cookieList = Array.isArray(rawCookies)
    ? rawCookies
    : typeof rawCookies === 'string'
      ? [rawCookies]
      : [];
  const cookie = cookieList.map(c => c.split(';')[0]).join('; ');
  const body = res.json() as { user?: { id?: string } };
  const userId = String(body.user?.id || '');

  if (params.emailVerified && userId) {
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));
  }

  return { cookie, userId };
}
