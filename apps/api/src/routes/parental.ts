import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { parentalInvites, parentalSettings, safetyProfiles } from '../db/schema.js';
import { requireAuth, requireSafety } from '../auth/guards.js';

export async function registerParentalRoutes(
  app: FastifyInstance,
  rateLimitEnabled = false
) {
  app.post(
    '/api/parental/invitations',
    {
      preHandler: [requireAuth, requireSafety],
      config: rateLimitEnabled ? { rateLimit: { max: 10, timeWindow: '1 minute' } } : undefined,
    },
    async (request, reply) => {
      const user = request.doriaUser!;
      const email =
        typeof (request.body as { email?: unknown } | null)?.email === 'string'
          ? String((request.body as { email: string }).email)
              .trim()
              .toLowerCase()
          : '';

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return reply.code(400).send({ error: 'Enter a valid guardian email address.' });
      }
      if (email === String(user.email || '').trim().toLowerCase()) {
        return reply
          .code(400)
          .send({ error: 'A player cannot invite their own account as guardian.' });
      }

      const tokenId = randomBytes(16).toString('hex');
      const token = `${tokenId}.${randomBytes(32).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const tokenHash = createHash('sha256').update(token).digest('hex');

      const [created] = await db
        .insert(parentalInvites)
        .values({
          id: tokenId,
          childUserId: user.userId,
          guardianEmail: email,
          tokenHash,
          status: 'pending',
          expiresAt,
        })
        .returning();

      if (!created) {
        return reply
          .code(503)
          .send({ error: 'Could not create the guardian invitation. Please try again.' });
      }

      return reply.code(201).send({
        token,
        guardianEmail: email,
        expiresAt: expiresAt.toISOString(),
      });
    }
  );

  app.post(
    '/api/parental/invitations/accept',
    {
      preHandler: [requireAuth, requireSafety],
      config: rateLimitEnabled ? { rateLimit: { max: 10, timeWindow: '1 minute' } } : undefined,
    },
    async (request, reply) => {
      const user = request.doriaUser!;
      const token =
        typeof (request.body as { token?: unknown } | null)?.token === 'string'
          ? String((request.body as { token: string }).token)
          : '';
      const [tokenId, secret] = token.split('.');

      if (!/^[a-f0-9]{32}$/.test(tokenId || '') || !/^[a-f0-9]{64}$/.test(secret || '')) {
        return reply.code(400).send({ error: 'This guardian invitation link is invalid.' });
      }

      const [invite] = await db
        .select()
        .from(parentalInvites)
        .where(eq(parentalInvites.id, tokenId))
        .limit(1);

      if (!invite || invite.status !== 'pending' || invite.expiresAt.getTime() < Date.now()) {
        return reply
          .code(410)
          .send({ error: 'This guardian invitation has expired or was already used.' });
      }

      const email = String(user.email || '').trim().toLowerCase();
      if (!email || email !== String(invite.guardianEmail).toLowerCase()) {
        return reply.code(403).send({
          error: 'Sign in with the exact email address this invitation was sent to.',
        });
      }

      const computedHash = createHash('sha256').update(token).digest('hex');
      if (computedHash !== invite.tokenHash) {
        return reply.code(400).send({ error: 'This guardian invitation link is invalid.' });
      }

      const childUserId = invite.childUserId;
      if (!childUserId || childUserId === user.userId) {
        return reply.code(400).send({ error: 'This guardian relationship cannot be created.' });
      }

      const [existingSettings] = await db
        .select()
        .from(parentalSettings)
        .where(eq(parentalSettings.childUserId, childUserId))
        .limit(1);

      if (existingSettings?.guardianUserId && existingSettings.guardianUserId !== user.userId) {
        return reply.code(409).send({
          error:
            'This player already has a linked guardian. Contact Doria support if this is incorrect.',
        });
      }

      try {
        await db.transaction(async tx => {
          const updatedInvite = await tx
            .update(parentalInvites)
            .set({
              status: 'accepted',
              acceptedAt: new Date(),
              guardianUserId: user.userId,
            })
            .where(
              and(
                eq(parentalInvites.id, tokenId),
                eq(parentalInvites.status, 'pending'),
                eq(parentalInvites.tokenHash, invite.tokenHash)
              )
            )
            .returning();

          if (updatedInvite.length === 0) {
            throw Object.assign(new Error('INVITE_CONFLICT'), { code: 'INVITE_CONFLICT' });
          }

          if (existingSettings) {
            await tx
              .update(parentalSettings)
              .set({ guardianUserId: user.userId, updatedAt: new Date() })
              .where(eq(parentalSettings.childUserId, childUserId));
          } else {
            await tx.insert(parentalSettings).values({
              childUserId,
              guardianUserId: user.userId,
              allowFriendRequests: true,
              allowMoments: true,
              allowChat: false,
              allowAi: true,
              dailyLimit: 90,
            });
          }
        });
      } catch {
        return reply.code(409).send({
          error:
            'The invitation was already used or the guardian link changed. Refresh and try again.',
        });
      }

      return reply.send({ accepted: true, childUserId });
    }
  );

  app.get('/api/parental/status', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = request.doriaUser!;
    const [settings] = await db
      .select()
      .from(parentalSettings)
      .where(eq(parentalSettings.childUserId, user.userId))
      .limit(1);

    return reply.send({
      linked: Boolean(settings?.guardianUserId),
      settings: {
        allowFriendRequests: settings?.allowFriendRequests !== false,
        allowMoments: settings?.allowMoments !== false,
        allowChat: settings?.allowChat === true,
        allowAi: settings?.allowAi !== false,
        dailyLimit: Number(settings?.dailyLimit || 90),
      },
    });
  });

  app.get(
    '/api/parental/guardian/children',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const linked = await db
        .select()
        .from(parentalSettings)
        .where(eq(parentalSettings.guardianUserId, user.userId))
        .limit(100);

      const children = await Promise.all(
        linked.map(async item => {
          const [safety] = await db
            .select()
            .from(safetyProfiles)
            .where(eq(safetyProfiles.userId, item.childUserId))
            .limit(1);

          return {
            childUserId: item.childUserId,
            allowFriendRequests: item.allowFriendRequests !== false,
            allowMoments: item.allowMoments !== false,
            allowChat: item.allowChat === true,
            allowAi: item.allowAi !== false,
            dailyLimit: Number(item.dailyLimit || 90),
            multiplayerEnabled: safety?.status === 'active' && safety.supervisedAccess === true,
            updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
          };
        })
      );

      return reply.send({ children });
    }
  );

  app.put(
    '/api/parental/children/:childId/multiplayer',
    { preHandler: [requireAuth, requireSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { childId?: string };
      const childId = String(params.childId || '');
      const enabled = (request.body as { enabled?: unknown } | null)?.enabled;

      if (typeof enabled !== 'boolean') {
        return reply.code(400).send({ error: 'Choose whether supervised multiplayer is enabled.' });
      }

      const [settings] = await db
        .select()
        .from(parentalSettings)
        .where(eq(parentalSettings.childUserId, childId))
        .limit(1);

      if (!settings || settings.guardianUserId !== user.userId) {
        return reply
          .code(403)
          .send({ error: 'Only the linked guardian can change this multiplayer setting.' });
      }

      const status = enabled ? 'active' : 'standard';
      const now = new Date();
      await db
        .insert(safetyProfiles)
        .values({
          userId: childId,
          status,
          supervisedAccess: enabled,
          approvedByGuardian: enabled ? user.userId : null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: safetyProfiles.userId,
          set: {
            status,
            supervisedAccess: enabled,
            approvedByGuardian: enabled ? user.userId : null,
            updatedAt: now,
          },
        });

      return reply.send({ enabled, supervisedAccess: enabled });
    }
  );

  app.put(
    '/api/parental/children/:childId/settings',
    { preHandler: [requireAuth, requireSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { childId?: string };
      const childId = String(params.childId || '');

      const [settings] = await db
        .select()
        .from(parentalSettings)
        .where(eq(parentalSettings.childUserId, childId))
        .limit(1);

      if (!settings || settings.guardianUserId !== user.userId) {
        return reply
          .code(403)
          .send({ error: 'Only the linked guardian can change these controls.' });
      }

      const input = (request.body || {}) as {
        allowFriendRequests?: unknown;
        allowMoments?: unknown;
        allowChat?: unknown;
        allowAi?: unknown;
        dailyLimit?: unknown;
      };

      const patch: Partial<typeof parentalSettings.$inferInsert> = {
        updatedAt: new Date(),
      };

      for (const key of ['allowFriendRequests', 'allowMoments', 'allowChat', 'allowAi'] as const) {
        if (input[key] !== undefined) {
          if (typeof input[key] !== 'boolean') {
            return reply.code(400).send({ error: 'Safety switches must be true or false.' });
          }
          patch[key] = input[key];
        }
      }

      if (input.dailyLimit !== undefined) {
        if (![30, 60, 90, 120].includes(Number(input.dailyLimit))) {
          return reply.code(400).send({ error: 'Choose a supported daily reminder limit.' });
        }
        patch.dailyLimit = Number(input.dailyLimit);
      }

      const [updated] = await db
        .update(parentalSettings)
        .set(patch)
        .where(eq(parentalSettings.childUserId, childId))
        .returning();

      if (!updated) {
        return reply
          .code(503)
          .send({ error: 'Could not save parental settings. Refresh and retry.' });
      }

      return reply.send({
        saved: true,
        settings: {
          ...updated,
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    }
  );
}
