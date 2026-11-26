import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq, or, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { games, parentalSettings, safetyProfiles, userBlocks } from '../db/schema.js';
import { resolveSessionUser, type AuthenticatedUser } from './better-auth.js';
import { env } from '../config/env.js';

export type SafetyProfileRecord = typeof safetyProfiles.$inferSelect;
export type ParentalSettingsRecord = typeof parentalSettings.$inferSelect;

declare module 'fastify' {
  interface FastifyRequest {
    doriaUser?: AuthenticatedUser;
    doriaSafety?: SafetyProfileRecord;
    doriaParental?: ParentalSettingsRecord | null;
  }
}

export function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

export async function ensureSafetyProfile(userId: string): Promise<SafetyProfileRecord> {
  const [existing] = await db
    .select()
    .from(safetyProfiles)
    .where(eq(safetyProfiles.userId, userId))
    .limit(1);
  if (existing) return existing;

  await db
    .insert(safetyProfiles)
    .values({
      userId,
      status: 'standard',
      supervisedAccess: false,
    })
    .onConflictDoNothing();

  const [created] = await db
    .select()
    .from(safetyProfiles)
    .where(eq(safetyProfiles.userId, userId))
    .limit(1);

  if (!created) {
    throw new Error('Safety profile could not be initialized.');
  }
  return created;
}

export async function getParentalSettingsForChild(
  userId: string
): Promise<ParentalSettingsRecord | null> {
  const [settings] = await db
    .select()
    .from(parentalSettings)
    .where(eq(parentalSettings.childUserId, userId))
    .limit(1);
  return settings || null;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = await resolveSessionUser(request.headers);
  if (!user) {
    return reply.code(401).send({ error: 'Sign in required.' });
  }
  request.doriaUser = user;
}

export async function requireSafety(request: FastifyRequest, reply: FastifyReply) {
  if (!request.doriaUser) {
    return reply.code(401).send({ error: 'Sign in required.' });
  }

  let safety: SafetyProfileRecord;
  try {
    safety = await ensureSafetyProfile(request.doriaUser.userId);
  } catch {
    return reply.code(503).send({ error: 'Safety verification is temporarily unavailable.' });
  }

  if (!['standard', 'active'].includes(safety.status)) {
    return reply.code(403).send({
      error:
        safety.status === 'suspended'
          ? 'This account is currently restricted by platform safety enforcement.'
          : 'This action is disabled by your account safety profile.',
    });
  }

  const parental = await getParentalSettingsForChild(request.doriaUser.userId);
  request.doriaSafety = safety;
  request.doriaParental = parental;
}

export function requireGuardianPermission(
  permission: 'allowFriendRequests' | 'allowMoments' | 'allowChat' | 'allowAi',
  errorMessage: string
) {
  return async function checkGuardianPermission(request: FastifyRequest, reply: FastifyReply) {
    if (!request.doriaUser) {
      return reply.code(401).send({ error: 'Sign in required.' });
    }
    const parental =
      request.doriaParental !== undefined
        ? request.doriaParental
        : await getParentalSettingsForChild(request.doriaUser.userId);

    if (permission === 'allowChat') {
      if (parental?.allowChat !== true) {
        return reply.code(403).send({ error: errorMessage });
      }
      return;
    }

    if (parental && parental[permission] === false) {
      return reply.code(403).send({ error: errorMessage });
    }
  };
}

export async function requireMultiplayerSafety(request: FastifyRequest, reply: FastifyReply) {
  if (!request.doriaUser) {
    return reply.code(401).send({ error: 'Sign in required.' });
  }

  const safety =
    request.doriaSafety || (await ensureSafetyProfile(request.doriaUser.userId));
  const parental =
    request.doriaParental !== undefined
      ? request.doriaParental
      : await getParentalSettingsForChild(request.doriaUser.userId);

  if (
    safety.status !== 'active' ||
    safety.supervisedAccess !== true ||
    !parental?.guardianUserId
  ) {
    return reply.code(403).send({
      error:
        'Multiplayer is locked until a linked guardian enables supervised access. No external identity check is used.',
    });
  }

  request.doriaSafety = safety;
  request.doriaParental = parental;
}

export async function requireDoriaAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = request.doriaUser;
  if (!user) {
    return reply.code(401).send({ error: 'Sign in required.' });
  }
  if (user.emailVerified !== true) {
    return reply.code(403).send({ error: 'Verified administrator email address required.' });
  }
  const email = String(user.email || '').trim().toLowerCase();
  if (!email || env.ADMIN_EMAIL_LIST.length === 0 || !env.ADMIN_EMAIL_LIST.includes(email)) {
    return reply.code(403).send({ error: 'Administrator access required.' });
  }
}

export async function isBlockedEitherWay(userA: string, userB: string): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false;
  const rows = await db
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, userA), eq(userBlocks.blockedId, userB)),
        and(eq(userBlocks.blockerId, userB), eq(userBlocks.blockedId, userA))
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function canAccessGameRoom(gameId: string, userId: string): Promise<boolean> {
  const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (!game) return false;

  const status = String(game.status || 'published').toLowerCase();
  if (!['approved', 'published'].includes(status)) return false;

  const isPrivate =
    game.isPrivate === true || String(game.visibility || '').toLowerCase() === 'private';
  if (!isPrivate) return true;

  if (game.ownerId === userId) return true;
  return Array.isArray(game.memberIds) && game.memberIds.includes(userId);
}
