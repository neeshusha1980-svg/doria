import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  badgeDefinitions,
  earnedBadges,
  gameCompletionReceipts,
  gameLikes,
  gamePlayReceipts,
  gamePlaySessions,
  games,
  type SceneItemJson,
} from '../db/schema.js';
import { canAccessGameRoom, requireAuth, requireSafety, safeId } from '../auth/guards.js';
import { ALLOWED_GENRES, getOrCreateProfile, syncEarnedTrophies } from '../services/profiles.js';

type GameInput = {
  name?: unknown;
  genre?: unknown;
  description?: unknown;
  creationMode?: unknown;
  htmlCode?: unknown;
  neoPrompt?: unknown;
  sceneData?: unknown;
};

function encodeOffset(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf-8').toString('base64url');
}

function decodeOffset(token: unknown): number {
  if (typeof token !== 'string' || !token) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8')) as {
      offset?: number;
    };
    const offset = Number(parsed.offset || 0);
    return Number.isInteger(offset) && offset >= 0 ? offset : 0;
  } catch {
    return 0;
  }
}

async function getLikeCountsForGames(gameIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (gameIds.length === 0) return map;
  const rows = await db
    .select({
      gameId: gameLikes.gameId,
      count: sql<number>`count(*)::int`,
    })
    .from(gameLikes)
    .where(inArray(gameLikes.gameId, gameIds))
    .groupBy(gameLikes.gameId);

  for (const row of rows) {
    map.set(row.gameId, Number(row.count || 0));
  }
  return map;
}

function formatGameRow(row: typeof games.$inferSelect, likesCount: number) {
  return {
    id: row.id,
    name: row.name,
    genre: row.genre,
    description: row.description,
    creationMode: row.creationMode,
    htmlCode: row.htmlCode,
    neoPrompt: row.neoPrompt,
    sceneData: row.sceneData,
    creatorName: row.creatorName,
    ownerId: row.ownerId,
    status: row.status || 'published',
    visibility: row.visibility,
    isPrivate: row.isPrivate,
    plays: row.plays,
    likes: likesCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function registerGameRoutes(app: FastifyInstance) {
  app.get('/api/my/games', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = request.doriaUser!;
    const query = (request.query || {}) as { limit?: unknown; nextToken?: unknown };
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 30));
    const offset = decodeOffset(query.nextToken);

    const rows = await db
      .select()
      .from(games)
      .where(eq(games.ownerId, user.userId))
      .orderBy(desc(games.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const likeCounts = await getLikeCountsForGames(pageRows.map(g => g.id));

    return reply.send({
      games: pageRows.map(row => formatGameRow(row, likeCounts.get(row.id) || 0)),
      nextToken: hasMore ? encodeOffset(offset + limit) : null,
    });
  });

  app.get('/api/games', async (request, reply) => {
    const query = (request.query || {}) as { limit?: unknown; nextToken?: unknown };
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 30));
    const offset = decodeOffset(query.nextToken);

    const rows = await db
      .select()
      .from(games)
      .where(
        and(
          inArray(games.status, ['published', 'approved']),
          eq(games.isPrivate, false),
          sql`lower(${games.visibility}) <> 'private'`
        )
      )
      .orderBy(desc(games.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const likeCounts = await getLikeCountsForGames(pageRows.map(g => g.id));

    return reply.send({
      games: pageRows.map(row => formatGameRow(row, likeCounts.get(row.id) || 0)),
      nextToken: hasMore ? encodeOffset(offset + limit) : null,
    });
  });

  app.post('/api/games', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const input = (request.body || {}) as GameInput;
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const genre = typeof input.genre === 'string' ? input.genre : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    const creationMode = ['html', 'neo', 'baseplate'].includes(String(input.creationMode))
      ? String(input.creationMode)
      : 'baseplate';
    const htmlCode = typeof input.htmlCode === 'string' ? input.htmlCode : '';
    const neoPrompt =
      typeof input.neoPrompt === 'string' ? input.neoPrompt.trim().slice(0, 500) : '';

    if (name.length < 3 || name.length > 42) {
      return reply.code(400).send({ error: 'Game name must be between 3 and 42 characters.' });
    }
    if (!ALLOWED_GENRES.has(genre)) {
      return reply.code(400).send({ error: 'Choose a supported game genre.' });
    }
    if (description.length > 180) {
      return reply.code(400).send({ error: 'Description must be 180 characters or fewer.' });
    }
    if (
      creationMode !== 'baseplate' &&
      (!htmlCode.trim() || htmlCode.length > (creationMode === 'neo' ? 60000 : 100000))
    ) {
      return reply
        .code(400)
        .send({ error: 'Add game HTML within the supported size limit before publishing.' });
    }
    if (creationMode === 'neo' && !/<body\b/i.test(htmlCode)) {
      return reply
        .code(400)
        .send({ error: 'Neo game output is incomplete. Generate it again before publishing.' });
    }

    const profile = await getOrCreateProfile(user.userId, user.name);
    const allowedSceneKinds = new Set([
      'block',
      'tree',
      'crystal',
      'platform',
      'rock',
      'lamp',
      'door',
      'flower',
      'cloud',
      'flag',
    ]);
    const sceneData: SceneItemJson[] = Array.isArray(input.sceneData)
      ? input.sceneData.slice(0, 500).flatMap((item: unknown) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
          const candidate = item as Record<string, unknown>;
          const kind = typeof candidate.kind === 'string' ? candidate.kind : '';
          const x = Number(candidate.x);
          const z = Number(candidate.z);
          const color = typeof candidate.color === 'string' ? candidate.color : '';
          if (
            !allowedSceneKinds.has(kind) ||
            !Number.isFinite(x) ||
            !Number.isFinite(z) ||
            Math.abs(x) > 11 ||
            Math.abs(z) > 11 ||
            !/^#[0-9a-fA-F]{6}$/.test(color)
          ) {
            return [];
          }
          return [{ kind, x, z, color }];
        })
      : [];

    if (creationMode === 'baseplate' && sceneData.length === 0) {
      return reply
        .code(400)
        .send({ error: 'Place at least one valid object before publishing a baseplate world.' });
    }

    const id = `game_${randomUUID().replace(/-/g, '')}`;
    const creatorName = profile.username || profile.displayName || user.name || 'Creator';
    const [created] = await db
      .insert(games)
      .values({
        id,
        name,
        genre,
        description,
        creationMode,
        htmlCode,
        neoPrompt,
        sceneData,
        creatorName,
        ownerId: user.userId,
        status: 'published',
        visibility: 'public',
        isPrivate: false,
        plays: 0,
      })
      .returning();

    if (!created) {
      return reply.code(503).send({ error: 'Could not save the game listing. Please try again.' });
    }

    const updatedProfile = await syncEarnedTrophies(user.userId, profile);
    return reply.code(201).send({
      game: formatGameRow(created, 0),
      profile: updatedProfile,
    });
  });

  app.post(
    '/api/games/:id/like',
    { preHandler: [requireAuth, requireSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { id?: string };
      const gameId = String(params.id || '').slice(0, 120);
      if (!gameId) return reply.code(400).send({ error: 'Game id required.' });

      if (!(await canAccessGameRoom(gameId, user.userId))) {
        return reply.code(404).send({ error: 'Game not found.' });
      }

      const likeId = safeId(`like_${gameId}_${user.userId}`);
      const [existing] = await db
        .select()
        .from(gameLikes)
        .where(eq(gameLikes.id, likeId))
        .limit(1);

      let liked = false;
      if (existing) {
        await db.delete(gameLikes).where(eq(gameLikes.id, likeId));
        liked = false;
      } else {
        await db
          .insert(gameLikes)
          .values({ id: likeId, gameId, userId: user.userId })
          .onConflictDoNothing();
        liked = true;
      }

      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(gameLikes)
        .where(eq(gameLikes.gameId, gameId));

      return reply.send({ liked, likes: Number(countRow?.count || 0) });
    }
  );

  app.post('/api/games/:gameId/play', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = request.doriaUser!;
    const params = request.params as { gameId?: string };
    const gameId = String(params.gameId || '');
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) {
      return reply.code(400).send({ error: 'A valid game is required.' });
    }
    if (!(await canAccessGameRoom(gameId, user.userId))) {
      return reply.code(404).send({ error: 'Published game not found.' });
    }

    const day = new Date().toISOString().slice(0, 10);
    const dailyPlayId = safeId(`daily_play_${user.userId}_${gameId}_${day}`);
    const sessionId = randomBytes(16).toString('hex');

    const result = await db.transaction(async tx => {
      const insertedReceipt = await tx
        .insert(gamePlayReceipts)
        .values({
          id: dailyPlayId,
          userId: user.userId,
          gameId,
          day,
        })
        .onConflictDoNothing()
        .returning();

      let counted = false;
      if (insertedReceipt.length > 0) {
        await tx
          .update(games)
          .set({ plays: sql`${games.plays} + 1` })
          .where(eq(games.id, gameId));
        counted = true;
      }

      await tx.insert(gamePlaySessions).values({
        id: sessionId,
        userId: user.userId,
        gameId,
        status: 'active',
      });

      const [updatedGame] = await tx
        .select({ plays: games.plays })
        .from(games)
        .where(eq(games.id, gameId))
        .limit(1);

      return { counted, plays: Number(updatedGame?.plays || 0) };
    });

    return reply.code(201).send({
      sessionId,
      counted: result.counted,
      plays: result.plays,
    });
  });

  app.post(
    '/api/games/:gameId/complete',
    { preHandler: [requireAuth, requireSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { gameId?: string };
      const gameId = String(params.gameId || '');
      const input = (request.body || {}) as { score?: unknown; sessionId?: unknown };
      const score = Number(input.score || 0);
      const sessionId = typeof input.sessionId === 'string' ? input.sessionId : '';

      if (
        !/^[a-zA-Z0-9_-]{1,120}$/.test(gameId) ||
        !/^[a-f0-9]{32}$/.test(sessionId) ||
        !Number.isFinite(score) ||
        score < 10 ||
        score > 100000
      ) {
        return reply
          .code(400)
          .send({ error: 'A valid game session and completed score are required.' });
      }

      if (!(await canAccessGameRoom(gameId, user.userId))) {
        return reply.code(404).send({ error: 'Published game not found.' });
      }

      const [sessionRow] = await db
        .select()
        .from(gamePlaySessions)
        .where(eq(gamePlaySessions.id, sessionId))
        .limit(1);

      if (!sessionRow || sessionRow.userId !== user.userId || sessionRow.gameId !== gameId) {
        return reply.code(403).send({ error: 'This game session does not belong to your account.' });
      }

      const elapsed = Date.now() - sessionRow.startedAt.getTime();
      if (!Number.isFinite(elapsed) || elapsed < 5000 || elapsed > 4 * 60 * 60 * 1000) {
        return reply.code(400).send({ error: 'Play this world before submitting a completion.' });
      }

      if (sessionRow.status !== 'active') {
        return reply.code(409).send({ error: 'This play session has already been completed.' });
      }

      const completionId = safeId(`complete_${user.userId}_${gameId}`);
      const [existingCompletion] = await db
        .select()
        .from(gameCompletionReceipts)
        .where(eq(gameCompletionReceipts.id, completionId))
        .limit(1);

      if (existingCompletion) {
        return reply.send({ completed: true, alreadyCompleted: true, earned: [] });
      }

      const definitions = await db
        .select()
        .from(badgeDefinitions)
        .where(and(eq(badgeDefinitions.status, 'published'), eq(badgeDefinitions.gameId, gameId)));

      const existingEarned = await db
        .select({ badgeId: earnedBadges.badgeId })
        .from(earnedBadges)
        .where(eq(earnedBadges.ownerId, user.userId));
      const alreadyEarnedIds = new Set(existingEarned.map(item => item.badgeId));
      const earnedNow = definitions.filter(def => !alreadyEarnedIds.has(def.id));

      await db.transaction(async tx => {
        const now = new Date();
        await tx
          .update(gamePlaySessions)
          .set({ status: 'completed', completedAt: now })
          .where(
            and(
              eq(gamePlaySessions.id, sessionId),
              eq(gamePlaySessions.userId, user.userId),
              eq(gamePlaySessions.status, 'active')
            )
          );

        await tx
          .insert(gameCompletionReceipts)
          .values({
            id: completionId,
            userId: user.userId,
            gameId,
            score: Math.round(score),
            completedAt: now,
          })
          .onConflictDoNothing();

        for (const badge of earnedNow) {
          await tx
            .insert(earnedBadges)
            .values({
              id: safeId(`earned_${user.userId}_${badge.id}`),
              ownerId: user.userId,
              badgeId: badge.id,
              gameId,
              earnedAt: now,
            })
            .onConflictDoNothing();
        }
      });

      return reply.send({
        completed: true,
        earned: earnedNow.map(item => ({ id: item.id, name: item.name })),
      });
    }
  );
}
