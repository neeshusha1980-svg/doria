import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  adminAuditLogs,
  chatMessages,
  contentReports,
  games,
  moments,
  newsPosts,
  privacyRequests,
  profiles,
  safetyProfiles,
} from '../db/schema.js';
import {
  requireAuth,
  requireDoriaAdmin,
  requireSafety,
  safeId,
} from '../auth/guards.js';
import { ALLOWED_GENRES } from '../services/profiles.js';
import type { StorageAdapter } from '../storage/s3.js';

async function recordAdminAudit(params: {
  adminUserId: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}) {
  await db.insert(adminAuditLogs).values({
    id: `audit_${randomUUID().replace(/-/g, '')}`,
    adminUserId: params.adminUserId,
    adminEmail: params.adminEmail,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    details: params.details || {},
  });
}

export async function registerSafetyAdminRoutes(
  app: FastifyInstance,
  storage: StorageAdapter,
  rateLimitEnabled = false
) {
  app.post(
    '/api/reports',
    {
      preHandler: [requireAuth, requireSafety],
      config: rateLimitEnabled ? { rateLimit: { max: 15, timeWindow: '1 minute' } } : undefined,
    },
    async (request, reply) => {
      const user = request.doriaUser!;
      const input = (request.body || {}) as {
        targetType?: unknown;
        targetId?: unknown;
        reason?: unknown;
        details?: unknown;
      };
      const targetType = String(input.targetType || '');
      const targetId = typeof input.targetId === 'string' ? input.targetId.trim() : '';
      const reason = String(input.reason || '');
      const details = typeof input.details === 'string' ? input.details.trim().slice(0, 500) : '';

      if (
        !['game', 'user', 'moment', 'news', 'chat'].includes(targetType) ||
        !/^[a-zA-Z0-9_-]{1,120}$/.test(targetId) ||
        !['bullying', 'inappropriate', 'spam', 'privacy', 'other'].includes(reason)
      ) {
        return reply.code(400).send({ error: 'Choose a valid item and report reason.' });
      }

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentOpen = await db
        .select()
        .from(contentReports)
        .where(
          and(
            eq(contentReports.reporterId, user.userId),
            eq(contentReports.status, 'open'),
            gte(contentReports.createdAt, since)
          )
        );

      if (recentOpen.length >= 10) {
        return reply
          .code(429)
          .send({ error: 'You have reached the daily report limit. Try again later.' });
      }

      const duplicate = await db
        .select({ id: contentReports.id })
        .from(contentReports)
        .where(
          and(
            eq(contentReports.reporterId, user.userId),
            eq(contentReports.targetType, targetType),
            eq(contentReports.targetId, targetId),
            eq(contentReports.status, 'open')
          )
        )
        .limit(1);

      if (duplicate.length > 0) {
        return reply.code(409).send({ error: 'You already have an open report for this item.' });
      }

      const id = `report_${randomUUID().replace(/-/g, '')}`;
      const [created] = await db
        .insert(contentReports)
        .values({
          id,
          reporterId: user.userId,
          targetType,
          targetId,
          reason,
          details,
          status: 'open',
        })
        .returning();

      if (!created) {
        return reply.code(503).send({ error: 'Report could not be submitted.' });
      }

      return reply.code(201).send({ submitted: true, reportId: id });
    }
  );

  app.post(
    '/api/privacy/deletion-requests',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const id = safeId(`privacy_delete_${user.userId}`);
      const [existing] = await db
        .select()
        .from(privacyRequests)
        .where(eq(privacyRequests.id, id))
        .limit(1);

      if (existing) {
        return reply.send({
          requested: true,
          alreadyPending: true,
          message: 'Your account deletion request is already recorded for manual review.',
        });
      }

      const [created] = await db
        .insert(privacyRequests)
        .values({
          id,
          userId: user.userId,
          requestType: 'account_deletion',
          status: 'open',
        })
        .returning();

      if (!created) {
        return reply.code(503).send({
          error:
            'Your request could not be recorded. Please contact the privacy address in the policy.',
        });
      }

      return reply.code(201).send({
        requested: true,
        message:
          'Your account deletion request was recorded for manual review. Your account has not been deleted yet.',
      });
    }
  );

  app.get(
    '/api/admin/overview',
    { preHandler: [requireAuth, requireDoriaAdmin] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const [usersCount, gamesCount, reportsCount, recentReports] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(profiles),
        db.select({ count: sql<number>`count(*)::int` }).from(games),
        db.select({ count: sql<number>`count(*)::int` }).from(contentReports),
        db
          .select()
          .from(contentReports)
          .orderBy(desc(contentReports.createdAt))
          .limit(8),
      ]);

      return reply.send({
        counts: {
          users: Number(usersCount[0]?.count || 0),
          games: Number(gamesCount[0]?.count || 0),
          reports: Number(reportsCount[0]?.count || 0),
        },
        recentReports: recentReports.map(r => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
        })),
        adminVerified: true,
        adminEmail: user.email || '',
      });
    }
  );

  app.get(
    '/api/admin/audit-logs',
    { preHandler: [requireAuth, requireDoriaAdmin] },
    async (_request, reply) => {
      const rows = await db
        .select()
        .from(adminAuditLogs)
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(100);

      return reply.send({
        logs: rows.map(row => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
      });
    }
  );

  app.get(
    '/api/admin/games',
    { preHandler: [requireAuth, requireDoriaAdmin] },
    async (_request, reply) => {
      const rows = await db
        .select()
        .from(games)
        .orderBy(desc(games.createdAt))
        .limit(100);

      return reply.send({
        games: rows.map(game => ({
          id: game.id,
          name: game.name,
          description: game.description || '',
          genre: game.genre || '',
          creatorName: game.creatorName || '',
          plays: game.plays || 0,
          status: game.status || 'published',
        })),
      });
    }
  );

  app.put(
    '/api/admin/games/:id',
    { preHandler: [requireAuth, requireDoriaAdmin] },
    async (request, reply) => {
      const admin = request.doriaUser!;
      const params = request.params as { id?: string };
      const id = String(params.id || '');
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) {
        return reply.code(400).send({ error: 'Invalid game id.' });
      }

      const input = (request.body || {}) as {
        name?: unknown;
        description?: unknown;
        genre?: unknown;
      };
      const patch: Partial<typeof games.$inferInsert> = { updatedAt: new Date() };

      if (input.name !== undefined) {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (name.length < 3 || name.length > 42) {
          return reply.code(400).send({ error: 'Game name must be 3–42 characters.' });
        }
        patch.name = name;
      }
      if (input.description !== undefined) {
        const description = typeof input.description === 'string' ? input.description.trim() : '';
        if (description.length > 180) {
          return reply.code(400).send({ error: 'Game description must be 180 characters or fewer.' });
        }
        patch.description = description;
      }
      if (input.genre !== undefined) {
        const genre = String(input.genre || '');
        if (!ALLOWED_GENRES.has(genre)) {
          return reply.code(400).send({ error: 'Choose a supported game genre.' });
        }
        patch.genre = genre;
      }

      const [updated] = await db
        .update(games)
        .set(patch)
        .where(eq(games.id, id))
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: 'Game not found or could not be updated.' });
      }

      await recordAdminAudit({
        adminUserId: admin.userId,
        adminEmail: admin.email || '',
        action: 'game.update',
        targetType: 'game',
        targetId: id,
        details: { updatedFields: Object.keys(patch).filter(k => k !== 'updatedAt') },
      });

      return reply.send({
        game: {
          ...updated,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    }
  );

  app.get(
    '/api/admin/users',
    { preHandler: [requireAuth, requireDoriaAdmin] },
    async (_request, reply) => {
      const rows = await db
        .select()
        .from(profiles)
        .orderBy(desc(profiles.createdAt))
        .limit(100);

      return reply.send({
        users: rows.map(profile => ({
          userId: profile.userId,
          username: profile.username || null,
          displayName: profile.displayName || 'Doria user',
          plusActive: profile.plusActive === true,
          createdAt: profile.createdAt ? profile.createdAt.toISOString() : null,
        })),
      });
    }
  );

  app.put(
    '/api/admin/users/:id/plus',
    { preHandler: [requireAuth, requireDoriaAdmin] },
    async (request, reply) => {
      const admin = request.doriaUser!;
      const params = request.params as { id?: string };
      const id = String(params.id || '');
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) {
        return reply.code(400).send({ error: 'Invalid user id.' });
      }

      const active = (request.body as { active?: unknown } | null)?.active;
      if (typeof active !== 'boolean') {
        return reply.code(400).send({ error: 'Choose whether Doria Plus is active.' });
      }

      const now = new Date();
      const [updated] = await db
        .update(profiles)
        .set({ plusActive: active, planUpdatedAt: now, updatedAt: now })
        .where(eq(profiles.userId, id))
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: 'User profile not found.' });
      }

      await recordAdminAudit({
        adminUserId: admin.userId,
        adminEmail: admin.email || '',
        action: 'user.plus.update',
        targetType: 'user',
        targetId: id,
        details: { plusActive: active },
      });

      return reply.send({ userId: id, plusActive: active });
    }
  );

  app.put(
    '/api/admin/users/:id/safety',
    { preHandler: [requireAuth, requireDoriaAdmin] },
    async (request, reply) => {
      const admin = request.doriaUser!;
      const params = request.params as { id?: string };
      const id = String(params.id || '');
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) {
        return reply.code(400).send({ error: 'Invalid user id.' });
      }

      const status = String((request.body as { status?: unknown } | null)?.status || '');
      if (!['standard', 'suspended'].includes(status)) {
        return reply.code(400).send({ error: 'Safety status must be standard or suspended.' });
      }

      const [targetProfile] = await db
        .select({ userId: profiles.userId })
        .from(profiles)
        .where(eq(profiles.userId, id))
        .limit(1);
      if (!targetProfile) {
        return reply.code(404).send({ error: 'User profile not found.' });
      }

      const now = new Date();
      await db
        .insert(safetyProfiles)
        .values({
          userId: id,
          status,
          supervisedAccess: false,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: safetyProfiles.userId,
          set: {
            status,
            ...(status === 'suspended' ? { supervisedAccess: false } : {}),
            updatedAt: now,
          },
        });

      await recordAdminAudit({
        adminUserId: admin.userId,
        adminEmail: admin.email || '',
        action: 'user.safety.update',
        targetType: 'user',
        targetId: id,
        details: { status },
      });

      return reply.send({ userId: id, status });
    }
  );

  app.get(
    '/api/admin/reports',
    { preHandler: [requireAuth, requireDoriaAdmin] },
    async (_request, reply) => {
      const rows = await db
        .select()
        .from(contentReports)
        .orderBy(desc(contentReports.createdAt))
        .limit(100);

      return reply.send({
        reports: rows.map(r => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
        })),
      });
    }
  );

  app.put(
    '/api/admin/reports/:id',
    { preHandler: [requireAuth, requireDoriaAdmin] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { id?: string };
      const id = String(params.id || '');
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) {
        return reply.code(400).send({ error: 'Invalid report id.' });
      }

      const status = (request.body as { status?: unknown } | null)?.status;
      if (!['reviewing', 'resolved', 'dismissed'].includes(String(status))) {
        return reply.code(400).send({ error: 'Choose a valid report status.' });
      }

      const [updated] = await db
        .update(contentReports)
        .set({
          status: String(status),
          reviewedAt: new Date(),
          reviewedBy: user.userId,
        })
        .where(eq(contentReports.id, id))
        .returning();

      if (!updated) {
        return reply
          .code(404)
          .send({ error: 'Report not found or already changed. Refresh and try again.' });
      }

      await recordAdminAudit({
        adminUserId: user.userId,
        adminEmail: user.email || '',
        action: 'report.status.update',
        targetType: 'report',
        targetId: id,
        details: { status: String(status) },
      });

      return reply.send({
        report: {
          ...updated,
          createdAt: updated.createdAt.toISOString(),
          reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
        },
      });
    }
  );

  app.get(
    '/api/admin/privacy-requests',
    { preHandler: [requireAuth, requireDoriaAdmin] },
    async (_request, reply) => {
      const rows = await db
        .select()
        .from(privacyRequests)
        .orderBy(desc(privacyRequests.createdAt))
        .limit(100);

      return reply.send({
        requests: rows.map(r => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
        })),
      });
    }
  );

  app.put(
    '/api/admin/privacy-requests/:id',
    { preHandler: [requireAuth, requireDoriaAdmin] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { id?: string };
      const id = String(params.id || '');
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) {
        return reply.code(400).send({ error: 'Invalid privacy request id.' });
      }

      const status = (request.body as { status?: unknown } | null)?.status;
      if (!['reviewing', 'contacted'].includes(String(status))) {
        return reply.code(400).send({ error: 'Choose a valid privacy request status.' });
      }

      const [updated] = await db
        .update(privacyRequests)
        .set({
          status: String(status),
          reviewedAt: new Date(),
          reviewedBy: user.userId,
        })
        .where(eq(privacyRequests.id, id))
        .returning();

      if (!updated) {
        return reply
          .code(404)
          .send({ error: 'Privacy request not found. Refresh and try again.' });
      }

      await recordAdminAudit({
        adminUserId: user.userId,
        adminEmail: user.email || '',
        action: 'privacy_request.status.update',
        targetType: 'privacy_request',
        targetId: id,
        details: { status: String(status) },
      });

      return reply.send({
        request: {
          ...updated,
          createdAt: updated.createdAt.toISOString(),
          reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
        },
      });
    }
  );

  app.delete(
    '/api/admin/content/:type/:id',
    { preHandler: [requireAuth, requireDoriaAdmin] },
    async (request, reply) => {
      const admin = request.doriaUser!;
      const params = request.params as { type?: string; id?: string };
      const type = String(params.type || '');
      const id = String(params.id || '');

      if (
        !['game', 'moment', 'news', 'chat'].includes(type) ||
        !/^[a-zA-Z0-9_-]{1,120}$/.test(id)
      ) {
        return reply.code(400).send({ error: 'Invalid content item.' });
      }

      let removedCount = 0;
      if (type === 'game') {
        const removed = await db.delete(games).where(eq(games.id, id)).returning({ id: games.id });
        removedCount = removed.length;
      } else if (type === 'moment') {
        const removed = await db
          .delete(moments)
          .where(eq(moments.id, id))
          .returning({ id: moments.id, videoPath: moments.videoPath });
        removedCount = removed.length;
        if (removed[0]?.videoPath) {
          await storage.deleteKeys([removed[0].videoPath]);
        }
      } else if (type === 'news') {
        const removed = await db
          .delete(newsPosts)
          .where(eq(newsPosts.id, id))
          .returning({ id: newsPosts.id });
        removedCount = removed.length;
      } else if (type === 'chat') {
        const removed = await db
          .delete(chatMessages)
          .where(eq(chatMessages.id, id))
          .returning({ id: chatMessages.id });
        removedCount = removed.length;
      }

      if (removedCount === 0) {
        return reply.code(404).send({ error: 'Content item not found or already removed.' });
      }

      await recordAdminAudit({
        adminUserId: admin.userId,
        adminEmail: admin.email || '',
        action: 'content.delete',
        targetType: type,
        targetId: id,
      });

      return reply.send({ removed: true, type, id });
    }
  );
}
