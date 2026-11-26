import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { env } from '../config/env.js';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined,
  plugins: [bearer()],
  trustedOrigins: env.CORS_ORIGINS,
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: false,
    },
  },
  rateLimit: {
    enabled: env.NODE_ENV !== 'test',
    window: 60,
    max: 20,
  },
  advanced: {
    cookiePrefix: 'doria',
    useSecureCookies: env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
    },
  },
});

export type AuthenticatedUser = {
  userId: string;
  name?: string;
  email?: string;
  emailVerified: boolean;
};

export async function resolveSessionUser(
  headers: Record<string, string | string[] | undefined>
): Promise<AuthenticatedUser | null> {
  const webHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      value.forEach(item => webHeaders.append(key, item));
    } else if (typeof value === 'string') {
      webHeaders.set(key, value);
    }
  }

  const sessionData = await auth.api.getSession({ headers: webHeaders });
  if (!sessionData?.user?.id) return null;

  return {
    userId: sessionData.user.id,
    name: sessionData.user.name || undefined,
    email: sessionData.user.email || undefined,
    emailVerified: Boolean(sessionData.user.emailVerified),
  };
}
