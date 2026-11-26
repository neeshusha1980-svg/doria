import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chatMessages, gamePlayers } from '../db/schema.js';
import {
  canAccessGameRoom,
  ensureSafetyProfile,
  getParentalSettingsForChild,
  isBlockedEitherWay,
  requireAuth,
  requireGuardianPermission,
  requireMultiplayerSafety,
  requireSafety,
  safeId,
} from '../auth/guards.js';
import { resolveSessionUser } from '../auth/better-auth.js';
import { getOrCreateProfile } from '../services/profiles.js';
import { realtimeHub } from '../realtime/hub.js';
import { env } from '../config/env.js';

export async function registerMultiplayerRoutes(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, async (socket, request) => {
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin.trim() : '';
    if (origin && env.NODE_ENV !== 'test' && !env.CORS_ORIGINS.includes(origin)) {
      socket.close(4403, 'Origin not allowed');
      return;
    }

    const user = await resolveSessionUser(request.headers);
    if (!user) {
      socket.close(4401, 'Sign in required');
      return;
    }

    const safety = await ensureSafetyProfile(user.userId);
    if (!['standard', 'active'].includes(safety.status)) {
      socket.close(4403, 'Account safety profile restricted');
      return;
    }

    realtimeHub.registerConnection(user.userId, socket);
  });

  app.post(
    '/api/subscriptions',
    { preHandler: [requireAuth, requireSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const { entity_type, entity_id, connection_id } = (request.body || {}) as Record<
        string,
        string
      >;

      if (
        !['chat', 'game'].includes(entity_type) ||
        typeof entity_id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,120}$/.test(entity_id) ||
        typeof connection_id !== 'string' ||
        !/^[a-zA-Z0-9_-]{8,200}$/.test(connection_id)
      ) {
        return reply.code(400).send({ error: 'A valid game room and connection are required.' });
      }

      if (entity_type === 'game') {
        const safety = request.doriaSafety || (await ensureSafetyProfile(user.userId));
        const parental =
          request.doriaParental !== undefined
            ? request.doriaParental
            : await getParentalSettingsForChild(user.userId);
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
      } else if (entity_type === 'chat') {
        const parental =
          request.doriaParental !== undefined
            ? request.doriaParental
            : await getParentalSettingsForChild(user.userId);
        if (parental?.allowChat !== true) {
          return reply.code(403).send({ error: 'Game chat is disabled by your guardian.' });
        }
      }

      if (!(await canAccessGameRoom(entity_id, user.userId))) {
        return reply.code(403).send({ error: 'You do not have access to this game room.' });
      }

      const added = realtimeHub.subscribe(
        entity_type as 'chat' | 'game',
        entity_id,
        connection_id,
        user.userId
      );
      if (!added) {
        return reply.code(409).send({
          error: 'This realtime connection is already registered to another account or is closed.',
        });
      }

      return reply.send({ ok: true });
    }
  );

  app.post(
    '/api/subscriptions/remove',
    { preHandler: [requireAuth, requireSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const { entity_type, entity_id, connection_id } = (request.body || {}) as Record<
        string,
        string
      >;

      if (
        !['chat', 'game'].includes(entity_type) ||
        typeof entity_id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,120}$/.test(entity_id) ||
        typeof connection_id !== 'string' ||
        !/^[a-zA-Z0-9_-]{8,200}$/.test(connection_id)
      ) {
        return reply.code(400).send({ error: 'A valid game room and connection are required.' });
      }

      realtimeHub.unsubscribe(
        entity_type as 'chat' | 'game',
        entity_id,
        connection_id,
        user.userId
      );
      return reply.send({ ok: true });
    }
  );

  app.get(
    '/api/multiplayer/:gameId',
    { preHandler: [requireAuth, requireMultiplayerSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { gameId?: string };
      const gameId = String(params.gameId || '');

      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) {
        return reply.code(400).send({ error: 'A valid game room is required.' });
      }
      if (!(await canAccessGameRoom(gameId, user.userId))) {
        return reply.code(403).send({ error: 'You do not have access to this game room.' });
      }

      const cutoff = new Date(Date.now() - 20000);
      const rows = await db
        .select()
        .from(gamePlayers)
        .where(
          and(
            eq(gamePlayers.gameId, gameId),
            ne(gamePlayers.status, 'offline'),
            gte(gamePlayers.updatedAt, cutoff)
          )
        )
        .limit(500);

      const players = [];
      for (const row of rows) {
        if (!(await isBlockedEitherWay(user.userId, row.userId))) {
          players.push({
            userId: row.userId,
            username: row.username.slice(0, 24),
            lane: Number(row.lane || 0),
            distance: Number(row.distance || 0),
            jump: Number(row.jump || 0),
            score: Number(row.score || 0),
            status: row.status || 'lobby',
            updatedAt: row.updatedAt.toISOString(),
            isSelf: row.userId === user.userId,
          });
        }
      }

      return reply.send({ gameId, players });
    }
  );

  app.post(
    '/api/multiplayer/:gameId/join',
    { preHandler: [requireAuth, requireMultiplayerSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { gameId?: string };
      const gameId = String(params.gameId || '');

      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) {
        return reply.code(400).send({ error: 'A valid game room is required.' });
      }
      if (!(await canAccessGameRoom(gameId, user.userId))) {
        return reply.code(403).send({ error: 'You do not have access to this game room.' });
      }

      const profile = await getOrCreateProfile(user.userId, user.name);
      const id = safeId(`mp_${gameId}_${user.userId}`);
      const username = String(profile.username || profile.displayName || 'Player').slice(0, 24);
      const now = new Date();

      await db
        .insert(gamePlayers)
        .values({
          id,
          gameId,
          userId: user.userId,
          username,
          lane: 0,
          distance: 0,
          jump: 0,
          score: 0,
          status: 'lobby',
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: gamePlayers.id,
          set: {
            username,
            lane: 0,
            distance: 0,
            jump: 0,
            score: 0,
            status: 'lobby',
            updatedAt: now,
          },
        });

      const publicPlayer = {
        userId: user.userId,
        username,
        lane: 0,
        distance: 0,
        jump: 0,
        score: 0,
        status: 'lobby',
        updatedAt: now.toISOString(),
      };

      await realtimeHub.notifySubscribers('game', gameId, {
        type: 'player.state',
        player: publicPlayer,
      });

      return reply.code(201).send({ joined: true, player: publicPlayer });
    }
  );

  app.post(
    '/api/multiplayer/:gameId/state',
    { preHandler: [requireAuth, requireMultiplayerSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { gameId?: string };
      const gameId = String(params.gameId || '');

      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) {
        return reply.code(400).send({ error: 'A valid game room is required.' });
      }
      if (!(await canAccessGameRoom(gameId, user.userId))) {
        return reply.code(403).send({ error: 'You do not have access to this game room.' });
      }

      const input = (request.body || {}) as {
        lane?: unknown;
        distance?: unknown;
        jump?: unknown;
        score?: unknown;
        status?: unknown;
      };
      const lane = Number(input.lane);
      const distance = Number(input.distance);
      const jump = Number(input.jump);
      const score = Number(input.score);
      const status = String(input.status || '');

      if (
        ![lane, distance, jump, score].every(Number.isFinite) ||
        lane < -1 ||
        lane > 1 ||
        distance < 0 ||
        distance > 1000000 ||
        jump < 0 ||
        jump > 4 ||
        score < 0 ||
        score > 10 ||
        !['lobby', 'playing', 'finished'].includes(status)
      ) {
        return reply.code(400).send({ error: 'Invalid multiplayer player state.' });
      }

      const id = safeId(`mp_${gameId}_${user.userId}`);
      const [previous] = await db
        .select()
        .from(gamePlayers)
        .where(eq(gamePlayers.id, id))
        .limit(1);

      if (!previous) {
        return reply.code(409).send({ error: 'Join this game room before sending player updates.' });
      }

      if (
        distance < Number(previous.distance || 0) ||
        distance - Number(previous.distance || 0) > 100 ||
        score < Number(previous.score || 0) ||
        score - Number(previous.score || 0) > 2
      ) {
        return reply.code(400).send({
          error: 'Player state changed too quickly. Please retry with a valid game update.',
        });
      }

      const now = new Date();
      const [updated] = await db
        .update(gamePlayers)
        .set({
          lane,
          distance,
          jump,
          score: Math.round(score),
          status,
          updatedAt: now,
        })
        .where(
          and(
            eq(gamePlayers.id, id),
            eq(gamePlayers.userId, user.userId),
            eq(gamePlayers.gameId, gameId)
          )
        )
        .returning();

      if (!updated) {
        return reply.code(409).send({ error: 'Join this game room before sending player updates.' });
      }

      const publicPlayer = {
        userId: user.userId,
        username: String(updated.username || 'Player').slice(0, 24),
        lane,
        distance,
        jump,
        score: Math.round(score),
        status,
        updatedAt: now.toISOString(),
      };

      await realtimeHub.notifySubscribers('game', gameId, {
        type: 'player.state',
        player: publicPlayer,
      });

      return reply.send({ updated: true, player: publicPlayer });
    }
  );

  app.post(
    '/api/multiplayer/:gameId/leave',
    { preHandler: [requireAuth, requireMultiplayerSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { gameId?: string };
      const gameId = String(params.gameId || '');

      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) {
        return reply.code(400).send({ error: 'A valid game room is required.' });
      }

      const id = safeId(`mp_${gameId}_${user.userId}`);
      const now = new Date();
      const updated = await db
        .update(gamePlayers)
        .set({ status: 'offline', updatedAt: now })
        .where(
          and(
            eq(gamePlayers.id, id),
            eq(gamePlayers.userId, user.userId),
            eq(gamePlayers.gameId, gameId)
          )
        )
        .returning();

      if (updated.length > 0) {
        await realtimeHub.notifySubscribers('game', gameId, {
          type: 'player.left',
          userId: user.userId,
          updatedAt: now.toISOString(),
        });
      }

      return reply.send({ left: true });
    }
  );

  app.get(
    '/api/chat',
    {
      preHandler: [
        requireAuth,
        requireSafety,
        requireGuardianPermission('allowChat', 'Game chat is disabled by your guardian.'),
      ],
    },
    async (request, reply) => {
      const user = request.doriaUser!;
      const query = (request.query || {}) as { gameId?: unknown };
      const gameId = typeof query.gameId === 'string' ? query.gameId : '';
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) {
        return reply.code(404).send({ error: 'A valid game room is required.' });
      }
      if (!(await canAccessGameRoom(gameId, user.userId))) {
        return reply.code(403).send({ error: 'You do not have access to this game chat.' });
      }

      const rows = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.gameId, gameId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(120);

      const visible = [];
      for (const row of rows.reverse()) {
        if (!(await isBlockedEitherWay(user.userId, row.ownerId))) {
          visible.push({
            id: row.id,
            gameId: row.gameId,
            ownerId: row.ownerId,
            username: row.username,
            text: row.text,
            createdAt: row.createdAt.toISOString(),
          });
        }
      }

      return reply.send({ messages: visible.slice(-60) });
    }
  );

  app.post(
    '/api/chat',
    {
      preHandler: [
        requireAuth,
        requireSafety,
        requireGuardianPermission('allowChat', 'Game chat is disabled by your guardian.'),
      ],
    },
    async (request, reply) => {
      const user = request.doriaUser!;
      const input = (request.body || {}) as { gameId?: unknown; text?: unknown };
      const gameId = typeof input.gameId === 'string' ? input.gameId : '';
      const text = typeof input.text === 'string' ? input.text.trim() : '';

      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) {
        return reply.code(404).send({ error: 'A valid game room is required.' });
      }
      if (!(await canAccessGameRoom(gameId, user.userId))) {
        return reply.code(403).send({ error: 'You do not have access to this game chat.' });
      }
      if (text.length < 1 || text.length > 240) {
        return reply.code(400).send({ error: 'Chat message must be 1–240 characters.' });
      }

      const profile = await getOrCreateProfile(user.userId, user.name);
      const id = `chat_${randomUUID().replace(/-/g, '')}`;
      const username = profile.username || profile.displayName;

      const [created] = await db
        .insert(chatMessages)
        .values({
          id,
          gameId,
          ownerId: user.userId,
          username,
          text,
        })
        .returning();

      if (!created) {
        return reply.code(503).send({ error: 'Message could not be sent.' });
      }

      const saved = {
        id: created.id,
        gameId: created.gameId,
        ownerId: created.ownerId,
        username: created.username,
        text: created.text,
        createdAt: created.createdAt.toISOString(),
      };

      await realtimeHub.notifySubscribers('chat', gameId, saved);
      return reply.code(201).send({ message: saved });
    }
  );
}
