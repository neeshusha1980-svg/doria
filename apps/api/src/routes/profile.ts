import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { profiles, safetyProfiles, usernames, type AvatarLookJson } from '../db/schema.js';
import { requireAuth, requireSafety } from '../auth/guards.js';
import {
  AVATAR_ACCENT_COLORS,
  AVATAR_BODY_COLORS,
  DEFAULT_AVATAR_LOOK,
  getOrCreateProfile,
  syncEarnedTrophies,
} from '../services/profiles.js';

function usernameFrom(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/^@/, '') : '';
}

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get('/api/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = request.doriaUser!;
    const [safety] = await db
      .select()
      .from(safetyProfiles)
      .where(eq(safetyProfiles.userId, user.userId))
      .limit(1);

    const profile = await getOrCreateProfile(user.userId, user.name);
    const synced = await syncEarnedTrophies(user.userId, profile);
    return reply.send({
      profile: synced,
      safety: safety
        ? {
            userId: safety.userId,
            status: safety.status,
            supervisedAccess: safety.supervisedAccess,
            approvedByGuardian: safety.approvedByGuardian,
            updatedAt: safety.updatedAt.toISOString(),
          }
        : null,
    });
  });

  app.get('/api/avatar-look', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = request.doriaUser!;
    const profile = await getOrCreateProfile(user.userId, user.name);
    return reply.send({ avatarLook: profile.avatarLook || DEFAULT_AVATAR_LOOK });
  });

  app.put('/api/avatar-look', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const input = (request.body || {}) as { body?: unknown; accent?: unknown; style?: unknown };
    const avatarBody = typeof input.body === 'string' ? input.body.toLowerCase() : '';
    const accent = typeof input.accent === 'string' ? input.accent.toLowerCase() : '';
    const style = typeof input.style === 'string' ? input.style : '';

    if (
      !AVATAR_BODY_COLORS.has(avatarBody) ||
      !AVATAR_ACCENT_COLORS.has(accent) ||
      !['classic', 'halo', 'crown'].includes(style)
    ) {
      return reply.code(400).send({ error: 'Choose a supported avatar colour and accessory.' });
    }

    await getOrCreateProfile(user.userId, user.name);
    const avatarLook: AvatarLookJson = {
      body: avatarBody,
      accent,
      style: style as AvatarLookJson['style'],
    };

    const updated = await db
      .update(profiles)
      .set({ avatarLook, updatedAt: new Date() })
      .where(eq(profiles.userId, user.userId))
      .returning();

    if (updated.length === 0) {
      return reply.code(503).send({ error: 'Avatar could not be saved. Please retry.' });
    }
    return reply.send({ saved: true, avatarLook });
  });

  app.put('/api/profile', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = request.doriaUser!;
    const input = (request.body || {}) as { displayName?: unknown; bio?: unknown };
    const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
    const bio = typeof input.bio === 'string' ? input.bio.trim() : '';

    if (displayName.length < 2 || displayName.length > 40) {
      return reply.code(400).send({ error: 'Display name must be 2–40 characters.' });
    }
    if (bio.length > 220) {
      return reply.code(400).send({ error: 'Bio must be 220 characters or fewer.' });
    }

    await getOrCreateProfile(user.userId, user.name);
    const [updated] = await db
      .update(profiles)
      .set({ displayName, bio, updatedAt: new Date() })
      .where(eq(profiles.userId, user.userId))
      .returning();

    if (!updated) {
      return reply.code(503).send({ error: 'Profile could not be saved. Please retry.' });
    }

    const synced = await syncEarnedTrophies(user.userId);
    return reply.send({ profile: synced });
  });

  app.post('/api/setup-username', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const username = usernameFrom((request.body as { username?: unknown } | null)?.username);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return reply.code(400).send({
        error: 'Username must be 3–20 characters using letters, numbers or underscores.',
      });
    }

    const existing = await getOrCreateProfile(user.userId, user.name);
    if (existing.username) {
      return reply.code(409).send({ error: 'Your account already has a username.' });
    }

    const normalized = username.toLowerCase();
    try {
      await db.transaction(async tx => {
        const [claimed] = await tx
          .select()
          .from(usernames)
          .where(eq(usernames.normalizedUsername, normalized))
          .limit(1);

        if (claimed && claimed.userId !== user.userId) {
          throw Object.assign(new Error('USERNAME_TAKEN'), { code: 'USERNAME_TAKEN' });
        }

        await tx
          .insert(usernames)
          .values({
            normalizedUsername: normalized,
            userId: user.userId,
            username,
          })
          .onConflictDoNothing();

        const [winner] = await tx
          .select()
          .from(usernames)
          .where(eq(usernames.normalizedUsername, normalized))
          .limit(1);

        if (!winner || winner.userId !== user.userId) {
          throw Object.assign(new Error('USERNAME_TAKEN'), { code: 'USERNAME_TAKEN' });
        }

        await tx
          .update(profiles)
          .set({ username, displayName: username, updatedAt: new Date() })
          .where(eq(profiles.userId, user.userId));
      });
    } catch (err) {
      const failure = err as { code?: string };
      if (failure?.code === 'USERNAME_TAKEN' || failure?.code === '23505') {
        return reply.code(409).send({ error: 'That username is already taken. Try another one.' });
      }
      throw err;
    }

    const updatedProfile = await syncEarnedTrophies(user.userId);
    return reply.code(201).send({ profile: updatedProfile });
  });

  app.get('/api/users/search', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const query = (request.query || {}) as { username?: unknown };
    const username = usernameFrom(query.username);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return reply.code(400).send({ error: 'Enter a valid username.' });
    }

    const [entry] = await db
      .select()
      .from(usernames)
      .where(eq(usernames.normalizedUsername, username.toLowerCase()))
      .limit(1);

    if (!entry) {
      return reply.send({ found: false, message: 'User not found' });
    }

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, entry.userId))
      .limit(1);

    if (!profile) {
      return reply.send({ found: false, message: 'User not found' });
    }

    return reply.send({
      found: true,
      user: {
        userId: profile.userId,
        username: profile.username,
        displayName: profile.displayName,
      },
    });
  });
}
