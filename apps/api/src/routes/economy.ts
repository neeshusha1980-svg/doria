import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  badgeDefinitions,
  earnedBadges,
  gameLikes,
  gamepasses,
  games,
  ownedGamepasses,
  ownedUgc,
  profiles,
  rewardClaims,
  taskRewardClaims,
  ugcItems,
  type UgcPartJson,
} from '../db/schema.js';
import { canAccessGameRoom, requireAuth, requireSafety, safeId } from '../auth/guards.js';
import { getOrCreateProfile, syncEarnedTrophies } from '../services/profiles.js';
import type { StorageAdapter } from '../storage/s3.js';

export async function registerEconomyRoutes(
  app: FastifyInstance,
  storage: StorageAdapter,
  rateLimitEnabled = false
) {
  app.post(
    '/api/rewards/idea-starter',
    { preHandler: [requireAuth, requireSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const profile = await getOrCreateProfile(user.userId, user.name);
      const claimId = `${user.userId}_ideaStarter`;

      const [existingClaim] = await db
        .select()
        .from(rewardClaims)
        .where(eq(rewardClaims.id, claimId))
        .limit(1);

      if (existingClaim) {
        const synced = await syncEarnedTrophies(user.userId, profile);
        return reply.send({ claimed: false, profile: synced });
      }

      let claimed = false;
      await db.transaction(async tx => {
        const inserted = await tx
          .insert(rewardClaims)
          .values({ id: claimId, userId: user.userId, reward: 25 })
          .onConflictDoNothing()
          .returning();

        if (inserted.length > 0) {
          claimed = true;
          const nextTrophies = Array.from(new Set([...(profile.trophies || []), 'idea-starter']));
          await tx
            .update(profiles)
            .set({
              starlits: sql`${profiles.starlits} + 25`,
              trophies: nextTrophies,
              updatedAt: new Date(),
            })
            .where(eq(profiles.userId, user.userId));
        }
      });

      const updatedProfile = await syncEarnedTrophies(user.userId);
      return reply.send({ claimed, profile: updatedProfile });
    }
  );

  app.get('/api/tasks', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const day = new Date().toISOString().slice(0, 10);
    const definitions = [
      {
        id: 'daily-checkin',
        title: 'Daily explorer',
        detail: 'Open your Doria universe and claim today’s check-in reward.',
        reward: 10,
        kind: 'daily',
      },
      {
        id: 'like-a-world',
        title: 'Show a creator some love',
        detail: 'Like at least one community game today.',
        reward: 15,
        kind: 'like',
      },
      {
        id: 'publish-a-world',
        title: 'World maker',
        detail: 'Publish a game or 3D world to Doria.',
        reward: 40,
        kind: 'publish',
      },
      {
        id: 'design-ugc',
        title: 'Wearable designer',
        detail: 'Create an avatar accessory for the marketplace.',
        reward: 30,
        kind: 'ugc',
      },
    ];

    const [claims, userLikes, userGames, userUgc] = await Promise.all([
      db.select().from(taskRewardClaims).where(eq(taskRewardClaims.userId, user.userId)),
      db.select({ id: gameLikes.id }).from(gameLikes).where(eq(gameLikes.userId, user.userId)).limit(1),
      db.select({ id: games.id }).from(games).where(eq(games.ownerId, user.userId)).limit(1),
      db.select({ id: ugcItems.id }).from(ugcItems).where(eq(ugcItems.ownerId, user.userId)).limit(1),
    ]);

    const claimedIds = new Set(claims.map(row => row.id));
    const tasks = definitions.map(task => {
      const claimId = safeId(`task_${user.userId}_${task.id}_${day}`);
      const completed = claimedIds.has(claimId);
      const canClaim =
        task.kind === 'daily' ||
        (task.kind === 'like' && userLikes.length > 0) ||
        (task.kind === 'publish' && userGames.length > 0) ||
        (task.kind === 'ugc' && userUgc.length > 0);
      return {
        id: task.id,
        title: task.title,
        detail: task.detail,
        reward: task.reward,
        completed,
        canClaim: canClaim && !completed,
      };
    });

    return reply.send({ tasks });
  });

  app.post(
    '/api/tasks/:id/claim',
    { preHandler: [requireAuth, requireSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { id?: string };
      const taskId = String(params.id || '');
      const definitions: Record<string, { reward: number; kind: string }> = {
        'daily-checkin': { reward: 10, kind: 'daily' },
        'like-a-world': { reward: 15, kind: 'like' },
        'publish-a-world': { reward: 40, kind: 'publish' },
        'design-ugc': { reward: 30, kind: 'ugc' },
      };

      const task = definitions[taskId];
      if (!task) return reply.code(404).send({ error: 'Quest not found.' });

      const day = new Date().toISOString().slice(0, 10);
      const claimId = safeId(`task_${user.userId}_${taskId}_${day}`);
      const [existing] = await db
        .select()
        .from(taskRewardClaims)
        .where(eq(taskRewardClaims.id, claimId))
        .limit(1);

      if (existing) {
        const profile = await getOrCreateProfile(user.userId, user.name);
        return reply.send({ claimed: false, reward: task.reward, profile });
      }

      let eligible = task.kind === 'daily';
      if (task.kind === 'like') {
        const rows = await db
          .select({ id: gameLikes.id })
          .from(gameLikes)
          .where(eq(gameLikes.userId, user.userId))
          .limit(1);
        eligible = rows.length > 0;
      } else if (task.kind === 'publish') {
        const rows = await db
          .select({ id: games.id })
          .from(games)
          .where(eq(games.ownerId, user.userId))
          .limit(1);
        eligible = rows.length > 0;
      } else if (task.kind === 'ugc') {
        const rows = await db
          .select({ id: ugcItems.id })
          .from(ugcItems)
          .where(eq(ugcItems.ownerId, user.userId))
          .limit(1);
        eligible = rows.length > 0;
      }

      if (!eligible) {
        return reply
          .code(403)
          .send({ error: 'Complete the activity before claiming this reward.' });
      }

      await getOrCreateProfile(user.userId, user.name);
      let claimed = false;
      await db.transaction(async tx => {
        const inserted = await tx
          .insert(taskRewardClaims)
          .values({
            id: claimId,
            userId: user.userId,
            taskId,
            reward: task.reward,
            day,
          })
          .onConflictDoNothing()
          .returning();

        if (inserted.length > 0) {
          claimed = true;
          await tx
            .update(profiles)
            .set({
              starlits: sql`${profiles.starlits} + ${task.reward}`,
              updatedAt: new Date(),
            })
            .where(eq(profiles.userId, user.userId));
        }
      });

      const updatedProfile = await getOrCreateProfile(user.userId, user.name);
      return reply.send({ claimed, reward: task.reward, profile: updatedProfile });
    }
  );

  app.get('/api/ugc', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const [items, ownership, profile] = await Promise.all([
      db
        .select()
        .from(ugcItems)
        .where(ne(ugcItems.status, 'removed'))
        .orderBy(desc(ugcItems.createdAt))
        .limit(500),
      db.select().from(ownedUgc).where(eq(ownedUgc.ownerId, user.userId)),
      getOrCreateProfile(user.userId, user.name),
    ]);

    return reply.send({
      items: items.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        assetType: item.assetType,
        color: item.color,
        price: item.price,
        modelData: item.modelData,
        ownerId: item.ownerId,
        creatorName: item.creatorName,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
      })),
      owned: ownership.map(row => row.itemId),
      equipped: profile.equippedUgcId || null,
    });
  });

  app.post('/api/ugc', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const input = (request.body || {}) as {
      name?: unknown;
      description?: unknown;
      assetType?: unknown;
      color?: unknown;
      price?: unknown;
      modelData?: unknown;
    };

    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    const assetType = String(input.assetType || '');
    const color = String(input.color || '');
    const price = Number(input.price);
    const shapes = new Set(['box', 'sphere', 'cone', 'cylinder', 'torus', 'octahedron']);
    const rawParts = Array.isArray(input.modelData) ? input.modelData : [];

    const modelData: UgcPartJson[] = rawParts.map((raw: unknown) => {
      const part =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      return {
        shape: String(part.shape || ''),
        x: Number(part.x),
        y: Number(part.y),
        z: Number(part.z),
        sx: Number(part.sx),
        sy: Number(part.sy),
        sz: Number(part.sz),
        color: String(part.color || ''),
        ry: Number(part.ry || 0),
      };
    });

    const validModel =
      assetType !== 'model' ||
      (modelData.length >= 1 &&
        modelData.length <= 24 &&
        modelData.every(
          part =>
            shapes.has(part.shape) &&
            [part.x, part.y, part.z, part.sx, part.sy, part.sz, part.ry].every(Number.isFinite) &&
            Math.abs(part.x) <= 3 &&
            Math.abs(part.y) <= 3 &&
            Math.abs(part.z) <= 3 &&
            part.sx >= 0.1 &&
            part.sx <= 3 &&
            part.sy >= 0.1 &&
            part.sy <= 3 &&
            part.sz >= 0.1 &&
            part.sz <= 3 &&
            /^#[0-9a-fA-F]{6}$/.test(part.color)
        ));

    if (
      name.length < 3 ||
      name.length > 36 ||
      description.length > 120 ||
      !['halo', 'crown', 'visor', 'wings', 'model'].includes(assetType) ||
      !/^#[0-9a-fA-F]{6}$/.test(color) ||
      !Number.isInteger(price) ||
      price < 0 ||
      price > 5000 ||
      !validModel
    ) {
      return reply.code(400).send({
        error: 'Check your item details and 3D model parts. Models need 1–24 valid parts.',
      });
    }

    const profile = await getOrCreateProfile(user.userId, user.name);
    const id = `ugc_item_${randomUUID().replace(/-/g, '')}`;
    const creatorName = profile.username || profile.displayName || 'Creator';
    const [created] = await db
      .insert(ugcItems)
      .values({
        id,
        name,
        description,
        assetType,
        color,
        price,
        modelData: assetType === 'model' ? modelData : [],
        ownerId: user.userId,
        creatorName,
        status: 'approved',
      })
      .returning();

    if (!created) {
      return reply.code(503).send({ error: '3D item could not be published.' });
    }

    return reply.code(201).send({
      item: {
        ...created,
        createdAt: created.createdAt.toISOString(),
      },
    });
  });

  app.post(
    '/api/ugc/:id/purchase',
    { preHandler: [requireAuth, requireSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { id?: string };
      const itemId = String(params.id || '');
      const [item] = await db.select().from(ugcItems).where(eq(ugcItems.id, itemId)).limit(1);

      if (!item || item.status === 'removed') {
        return reply.code(404).send({ error: 'Accessory not found.' });
      }
      if (item.ownerId === user.userId) {
        return reply.code(400).send({ error: 'You already own your own creation.' });
      }

      await getOrCreateProfile(user.userId, user.name);
      const ownedId = safeId(`ugc_${user.userId}_${itemId}`);
      const [alreadyOwned] = await db
        .select()
        .from(ownedUgc)
        .where(eq(ownedUgc.id, ownedId))
        .limit(1);

      if (alreadyOwned) {
        return reply.send({
          purchased: false,
          owned: true,
          item: { ...item, createdAt: item.createdAt.toISOString() },
        });
      }

      const price = Number(item.price || 0);
      try {
        await db.transaction(async tx => {
          const deducted = await tx
            .update(profiles)
            .set({
              starlits: sql`${profiles.starlits} - ${price}`,
              updatedAt: new Date(),
            })
            .where(and(eq(profiles.userId, user.userId), sql`${profiles.starlits} >= ${price}`))
            .returning();

          if (deducted.length === 0) {
            throw Object.assign(new Error('INSUFFICIENT_STARLITS'), {
              code: 'INSUFFICIENT_STARLITS',
            });
          }

          await tx.insert(ownedUgc).values({
            id: ownedId,
            ownerId: user.userId,
            itemId,
            price,
          });
        });
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'INSUFFICIENT_STARLITS') {
          return reply.code(400).send({ error: 'Not enough Starlits for this accessory.' });
        }
        return reply
          .code(409)
          .send({ error: 'Purchase could not be completed. Refresh your balance and retry.' });
      }

      return reply.send({
        purchased: true,
        item: { ...item, createdAt: item.createdAt.toISOString() },
      });
    }
  );

  app.post(
    '/api/ugc/:id/equip',
    { preHandler: [requireAuth, requireSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { id?: string };
      const itemId = String(params.id || '');
      const ownedId = safeId(`ugc_${user.userId}_${itemId}`);
      const [owned] = await db.select().from(ownedUgc).where(eq(ownedUgc.id, ownedId)).limit(1);

      if (!owned) {
        return reply.code(403).send({ error: 'Buy this accessory before equipping it.' });
      }

      const updated = await db
        .update(profiles)
        .set({ equippedUgcId: itemId, updatedAt: new Date() })
        .where(eq(profiles.userId, user.userId))
        .returning();

      if (updated.length === 0) {
        return reply.code(503).send({ error: 'Could not equip this accessory.' });
      }

      return reply.send({ equipped: itemId });
    }
  );

  app.post(
    '/api/games/:gameId/gamepasses',
    { preHandler: [requireAuth, requireSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const params = request.params as { gameId?: string };
      const gameId = String(params.gameId || '');
      const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);

      if (!game || game.ownerId !== user.userId) {
        return reply
          .code(403)
          .send({ error: 'Only the creator of this game can add gamepasses.' });
      }

      const input = (request.body || {}) as {
        name?: unknown;
        detail?: unknown;
        price?: unknown;
        effectType?: unknown;
        effectValue?: unknown;
      };
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      const detail = typeof input.detail === 'string' ? input.detail.trim() : '';
      const price = Number(input.price);
      const effectType = String(input.effectType || '');
      const effectValue = Number(input.effectValue || 1);

      if (
        name.length < 3 ||
        name.length > 36 ||
        detail.length < 8 ||
        detail.length > 140 ||
        !Number.isInteger(price) ||
        price < 5 ||
        price > 5000
      ) {
        return reply.code(400).send({ error: 'Check the gamepass name, description and price.' });
      }
      if (
        !['double_crystals', 'jump_boost', 'speed_boost'].includes(effectType) ||
        !Number.isFinite(effectValue) ||
        effectValue < 1 ||
        effectValue > 3
      ) {
        return reply
          .code(400)
          .send({ error: 'Choose a supported gameplay effect and strength.' });
      }

      const id = `pass_def_${randomUUID().replace(/-/g, '')}`;
      const [created] = await db
        .insert(gamepasses)
        .values({
          id,
          gameId,
          game: String(game.name || 'Creator game'),
          ownerId: user.userId,
          name,
          detail,
          price,
          effectType,
          effectValue,
          status: 'active',
        })
        .returning();

      if (!created) {
        return reply.code(503).send({ error: 'Gamepass could not be created.' });
      }

      return reply.code(201).send({
        pass: {
          ...created,
          createdAt: created.createdAt.toISOString(),
        },
      });
    }
  );

  app.get('/api/gamepasses', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const query = (request.query || {}) as { gameId?: unknown; gameName?: unknown };
    const requestedGameId = String(query.gameId || '');
    const requestedGameName = String(query.gameName || '').trim();

    if (requestedGameId) {
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(requestedGameId)) {
        return reply.code(400).send({ error: 'A valid game is required.' });
      }
      if (!(await canAccessGameRoom(requestedGameId, user.userId))) {
        return reply.code(403).send({ error: 'You do not have access to this game.' });
      }
    }

    const [gameRow] = requestedGameId
      ? await db.select().from(games).where(eq(games.id, requestedGameId)).limit(1)
      : [null];
    const gameName = requestedGameName || String(gameRow?.name || '');

    const allPasses = await db
      .select()
      .from(gamepasses)
      .where(ne(gamepasses.status, 'removed'))
      .orderBy(desc(gamepasses.createdAt))
      .limit(500);

    let catalog = allPasses;
    if (requestedGameId) {
      catalog = allPasses.filter(pass => pass.gameId === requestedGameId);
    } else {
      const publicGames = await db
        .select({ id: games.id })
        .from(games)
        .where(
          and(
            inArray(games.status, ['published', 'approved']),
            eq(games.isPrivate, false),
            sql`lower(${games.visibility}) <> 'private'`
          )
        );
      const publicIds = new Set(publicGames.map(item => item.id));
      catalog = allPasses.filter(pass => publicIds.has(pass.gameId));
    }

    const mineRows = await db
      .select()
      .from(ownedGamepasses)
      .where(eq(ownedGamepasses.ownerId, user.userId));

    const mine = mineRows.filter(
      row =>
        !requestedGameId ||
        row.gameId === requestedGameId ||
        (!row.gameId && row.game === gameName)
    );

    const catalogById = new Map(catalog.map(item => [item.id, item]));
    const ownedEffects = mine.map(row => {
      const pass = catalogById.get(row.passId);
      return {
        id: row.passId,
        gameId: row.gameId || pass?.gameId || '',
        game: row.game || pass?.game || '',
        effectType: row.effectType || pass?.effectType || '',
        effectValue: row.effectValue || pass?.effectValue || 1,
      };
    });

    return reply.send({
      catalog: catalog.map(item => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
      owned: mine.map(row => row.passId),
      ownedEffects,
    });
  });

  app.post(
    '/api/gamepasses/purchase',
    { preHandler: [requireAuth, requireSafety] },
    async (request, reply) => {
      const user = request.doriaUser!;
      const input = (request.body || {}) as { passId?: unknown; gameId?: unknown };
      const passId = typeof input.passId === 'string' ? input.passId : '';
      const gameId = typeof input.gameId === 'string' ? input.gameId : '';

      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(passId) || !/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) {
        return reply.code(400).send({ error: 'A valid gamepass and game are required.' });
      }
      if (!(await canAccessGameRoom(gameId, user.userId))) {
        return reply.code(403).send({ error: 'You do not have access to this game.' });
      }

      const [pass] = await db
        .select()
        .from(gamepasses)
        .where(
          and(
            eq(gamepasses.id, passId),
            eq(gamepasses.gameId, gameId),
            ne(gamepasses.status, 'removed')
          )
        )
        .limit(1);

      if (!pass) {
        return reply
          .code(404)
          .send({ error: 'Gamepass not found or no longer available for this game.' });
      }
      if (pass.ownerId === user.userId) {
        return reply.code(400).send({ error: 'Creators cannot purchase their own gamepass.' });
      }

      const profile = await getOrCreateProfile(user.userId, user.name);
      const ownedId = safeId(`pass_${user.userId}_${pass.id}`);
      const [alreadyOwned] = await db
        .select()
        .from(ownedGamepasses)
        .where(eq(ownedGamepasses.id, ownedId))
        .limit(1);

      if (alreadyOwned) {
        return reply.send({
          purchased: false,
          message: 'Already owned',
          profile,
          owned: true,
        });
      }

      const price = Number(pass.price);
      try {
        await db.transaction(async tx => {
          const deducted = await tx
            .update(profiles)
            .set({
              starlits: sql`${profiles.starlits} - ${price}`,
              updatedAt: new Date(),
            })
            .where(and(eq(profiles.userId, user.userId), sql`${profiles.starlits} >= ${price}`))
            .returning();

          if (deducted.length === 0) {
            throw Object.assign(new Error('INSUFFICIENT_STARLITS'), {
              code: 'INSUFFICIENT_STARLITS',
            });
          }

          await tx.insert(ownedGamepasses).values({
            id: ownedId,
            ownerId: user.userId,
            passId: pass.id,
            game: pass.game,
            gameId: pass.gameId,
            effectType: pass.effectType,
            effectValue: pass.effectValue,
            price,
          });
        });
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'INSUFFICIENT_STARLITS') {
          return reply.code(400).send({ error: 'Not enough Starlits for this gamepass.' });
        }
        return reply.code(409).send({
          error: 'Purchase could not be completed. Refresh your balance and try again.',
        });
      }

      const updatedProfile = await getOrCreateProfile(user.userId, user.name);
      return reply.send({
        purchased: true,
        profile: updatedProfile,
        owned: true,
        pass: {
          ...pass,
          createdAt: pass.createdAt.toISOString(),
        },
      });
    }
  );

  app.get('/api/badges', { preHandler: [requireAuth, requireSafety] }, async (request, reply) => {
    const user = request.doriaUser!;
    const [custom, earned, profile] = await Promise.all([
      db
        .select()
        .from(badgeDefinitions)
        .where(ne(badgeDefinitions.status, 'removed'))
        .orderBy(desc(badgeDefinitions.createdAt))
        .limit(250),
      db.select().from(earnedBadges).where(eq(earnedBadges.ownerId, user.userId)),
      getOrCreateProfile(user.userId, user.name),
    ]);

    const imagePaths = custom.map(item => item.imagePath).filter(Boolean);
    const urlByPath = await storage.getSignedReadUrls(imagePaths);

    return reply.send({
      custom: custom.map(item => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        imageUrl: item.imagePath ? urlByPath.get(item.imagePath) || '' : '',
      })),
      earnedIds: [
        ...(Array.isArray(profile.trophies) ? profile.trophies : []),
        ...earned.map(item => item.badgeId),
      ],
    });
  });

  app.post(
    '/api/badges',
    {
      preHandler: [requireAuth, requireSafety],
      config: rateLimitEnabled ? { rateLimit: { max: 15, timeWindow: '1 minute' } } : undefined,
    },
    async (request, reply) => {
    const user = request.doriaUser!;
    const input = (request.body || {}) as {
      name?: unknown;
      description?: unknown;
      gameId?: unknown;
      artStyle?: unknown;
      imageBase64?: unknown;
    };
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    const gameId = typeof input.gameId === 'string' ? input.gameId.trim() : '';
    const artStyle = String(input.artStyle || 'creator');
    const styles = new Set([
      'starter',
      'creator',
      'spark',
      'community',
      'currency',
      'game',
      'style',
      'collection',
      'special',
    ]);

    if (
      name.length < 3 ||
      name.length > 40 ||
      description.length > 160 ||
      !styles.has(artStyle)
    ) {
      return reply
        .code(400)
        .send({ error: 'Check the badge name, description and artwork style.' });
    }

    if (gameId) {
      const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if (!game || game.ownerId !== user.userId) {
        return reply
          .code(403)
          .send({ error: 'Only the creator of this game can create its badge.' });
      }
    }

    let imagePath = '';
    if (input.imageBase64 !== undefined) {
      const imageBase64 = typeof input.imageBase64 === 'string' ? input.imageBase64 : '';
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(imageBase64);
      if (!match || match[2].length > 2800000) {
        return reply
          .code(400)
          .send({ error: 'Badge image must be PNG, JPG or WebP and no larger than 2 MB.' });
      }
      const extension =
        match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg';
      imagePath = `badges/${user.userId}/${randomBytes(12).toString('hex')}.${extension}`;
      const saved = await storage.uploadBase64({
        key: imagePath,
        base64Content: match[2],
        contentType: match[1],
      });
      if (!saved) {
        return reply.code(503).send({ error: 'Badge image upload failed. Please retry.' });
      }
    }

    const profile = await getOrCreateProfile(user.userId, user.name);
    const id = `badge_${randomUUID().replace(/-/g, '')}`;
    const creatorName = profile.username || profile.displayName || 'Creator';

    try {
      const [created] = await db
        .insert(badgeDefinitions)
        .values({
          id,
          name,
          description,
          gameId,
          artStyle,
          imagePath,
          creatorId: user.userId,
          creatorName,
          status: 'published',
        })
        .returning();

      if (!created) throw new Error('Badge insert failed');

      const imageUrl = imagePath ? await storage.getSignedReadUrl(imagePath) : '';
      return reply.code(201).send({
        badge: {
          ...created,
          createdAt: created.createdAt.toISOString(),
          imageUrl,
        },
      });
    } catch {
      if (imagePath) await storage.deleteKeys([imagePath]);
      return reply.code(503).send({ error: 'Badge could not be published.' });
    }
  });
}
