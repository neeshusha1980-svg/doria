import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { auth } from './auth/better-auth.js';
import { env } from './config/env.js';
import { createDefaultNeoAdapter, type NeoProviderAdapter } from './ai/neo-adapter.js';
import { s3Storage, type StorageAdapter } from './storage/s3.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerGameRoutes } from './routes/games.js';
import { registerAiRoutes } from './routes/ai.js';
import { registerEconomyRoutes } from './routes/economy.js';
import { registerSocialRoutes } from './routes/social.js';
import { registerMultiplayerRoutes } from './routes/multiplayer.js';
import { registerParentalRoutes } from './routes/parental.js';
import { registerSafetyAdminRoutes } from './routes/safety-admin.js';

export type BuildAppOptions = {
  neoAdapter?: NeoProviderAdapter;
  storage?: StorageAdapter;
  enableRateLimit?: boolean;
};

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function extractOriginFromReferer(referer: string): string {
  try {
    return new URL(referer).origin;
  } catch {
    return '';
  }
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
    bodyLimit: 12 * 1024 * 1024, // 12 MB for base64 video Moments (7 MB raw)
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cookie);

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || env.CORS_ORIGINS.includes(origin) || env.NODE_ENV === 'test') {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Explicit CSRF / Origin protection for cookie-authenticated state-changing requests
  app.addHook('onRequest', async (request, reply) => {
    if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) return;

    const originHeader =
      typeof request.headers.origin === 'string' ? request.headers.origin.trim() : '';
    const refererHeader =
      typeof request.headers.referer === 'string' ? request.headers.referer.trim() : '';
    const requestOrigin = originHeader || (refererHeader ? extractOriginFromReferer(refererHeader) : '');

    if (requestOrigin) {
      const allowed = new Set([...env.CORS_ORIGINS, new URL(env.BETTER_AUTH_URL).origin]);
      if (!allowed.has(requestOrigin)) {
        return reply.code(403).send({ error: 'Cross-site request blocked.' });
      }
      return;
    }

    if (
      env.NODE_ENV === 'production' &&
      typeof request.headers.cookie === 'string' &&
      request.headers.cookie.length > 0 &&
      !request.headers.authorization
    ) {
      return reply.code(403).send({ error: 'Missing Origin header for authenticated request.' });
    }
  });

  const rateLimitEnabled = options.enableRateLimit !== false && env.NODE_ENV !== 'test';
  if (rateLimitEnabled) {
    await app.register(rateLimit, {
      max: 120,
      timeWindow: '1 minute',
    });
  }

  await app.register(websocket);

  app.all(
    '/api/auth/*',
    {
      config: rateLimitEnabled
        ? {
            rateLimit: {
              max: 20,
              timeWindow: '1 minute',
            },
          }
        : undefined,
    },
    async (request, reply) => {
      const protocol =
        (request.headers['x-forwarded-proto'] as string) || request.protocol || 'http';
      const host =
        (request.headers['x-forwarded-host'] as string) || request.headers.host || 'localhost';
      const url = new URL(request.url, `${protocol}://${host}`);

      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) {
          value.forEach(item => headers.append(key, item));
        } else if (typeof value === 'string') {
          headers.set(key, value);
        }
      }

      const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
      const body =
        hasBody && request.body !== undefined
          ? typeof request.body === 'string'
            ? request.body
            : JSON.stringify(request.body)
          : undefined;

      const webRequest = new Request(url.toString(), {
        method: request.method,
        headers,
        body,
      });

      const webResponse = await auth.handler(webRequest);
      reply.status(webResponse.status);

      webResponse.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') return;
        reply.header(key, value);
      });

      const setCookies =
        typeof (webResponse.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie ===
        'function'
          ? (webResponse.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
          : [];
      if (setCookies.length > 0) {
        reply.header('set-cookie', setCookies);
      } else {
        const singleCookie = webResponse.headers.get('set-cookie');
        if (singleCookie) reply.header('set-cookie', singleCookie);
      }

      const responseBuffer = Buffer.from(await webResponse.arrayBuffer());
      return reply.send(responseBuffer);
    }
  );

  const neoAdapter = options.neoAdapter || createDefaultNeoAdapter();
  const storage = options.storage || s3Storage;

  await registerSystemRoutes(app);
  await registerProfileRoutes(app);
  await registerGameRoutes(app);
  await registerAiRoutes(app, neoAdapter, rateLimitEnabled);
  await registerEconomyRoutes(app, storage, rateLimitEnabled);
  await registerSocialRoutes(app, storage, rateLimitEnabled);
  await registerMultiplayerRoutes(app);
  await registerParentalRoutes(app, rateLimitEnabled);
  await registerSafetyAdminRoutes(app, storage, rateLimitEnabled);

  return app;
}
