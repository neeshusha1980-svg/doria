import { describe, expect, it } from 'vitest';
import { createTestContext, signUpAndGetCookie } from './helpers/test-harness.js';

describe('Games, Baseplate Worlds, Likes, Daily Plays, UGC, Gamepasses & Badges', () => {
  it('publishes Baseplate worlds, enforces cross-game gamepass boundaries, and awards badges', async () => {
    const { app } = await createTestContext();
    try {
      const actorA = await signUpAndGetCookie(app, {
        email: 'builder@doria.test',
        password: 'Password123!',
        name: 'Builder A',
      });
      const actorB = await signUpAndGetCookie(app, {
        email: 'player@doria.test',
        password: 'Password123!',
        name: 'Player B',
      });

      // Publish a Baseplate world
      const createWorld = await app.inject({
        method: 'POST',
        url: '/api/games',
        headers: { cookie: actorA.cookie },
        payload: {
          name: 'Crystal Valley',
          genre: 'Adventure',
          description: 'Explore glowing crystals.',
          creationMode: 'baseplate',
          sceneData: [
            { kind: 'block', x: 0, z: 0, color: '#9b7bff' },
            { kind: 'crystal', x: 2, z: -3, color: '#6ee7ef' },
          ],
        },
      });
      expect(createWorld.statusCode).toBe(201);
      const gameId = createWorld.json().game.id;
      expect(createWorld.json().profile.trophies).toContain('world-maker');

      // Public feed lists the published game
      const feed = await app.inject({ method: 'GET', url: '/api/games' });
      expect(feed.statusCode).toBe(200);
      expect(feed.json().games.some((g: { id: string }) => g.id === gameId)).toBe(true);

      // Unique daily play count increments once per account per UTC day
      const play1 = await app.inject({
        method: 'POST',
        url: `/api/games/${gameId}/play`,
        headers: { cookie: actorB.cookie },
      });
      expect(play1.statusCode).toBe(201);
      expect(play1.json().counted).toBe(true);
      expect(play1.json().plays).toBe(1);

      const play2 = await app.inject({
        method: 'POST',
        url: `/api/games/${gameId}/play`,
        headers: { cookie: actorB.cookie },
      });
      expect(play2.statusCode).toBe(201);
      expect(play2.json().counted).toBe(false);
      expect(play2.json().plays).toBe(1);

      // Creator creates a gamepass for Crystal Valley
      const passRes = await app.inject({
        method: 'POST',
        url: `/api/games/${gameId}/gamepasses`,
        headers: { cookie: actorA.cookie },
        payload: {
          name: 'Double Crystal Pack',
          detail: 'Earn double crystals on every run.',
          price: 75,
          effectType: 'double_crystals',
          effectValue: 2,
        },
      });
      expect(passRes.statusCode).toBe(201);
      const passId = passRes.json().pass.id;

      // Cross-game purchase attempt must be rejected
      const wrongGameBuy = await app.inject({
        method: 'POST',
        url: '/api/gamepasses/purchase',
        headers: { cookie: actorB.cookie },
        payload: { passId, gameId: 'game_other_world' },
      });
      expect(wrongGameBuy.statusCode).toBe(403);

      // Valid gamepass purchase deducts Starlits once
      const validBuy = await app.inject({
        method: 'POST',
        url: '/api/gamepasses/purchase',
        headers: { cookie: actorB.cookie },
        payload: { passId, gameId },
      });
      expect(validBuy.statusCode).toBe(200);
      expect(validBuy.json().purchased).toBe(true);
      expect(validBuy.json().profile.starlits).toBe(175);

      // Create and purchase a 3D UGC item
      const ugcCreate = await app.inject({
        method: 'POST',
        url: '/api/ugc',
        headers: { cookie: actorA.cookie },
        payload: {
          name: 'Solar Halo',
          description: 'A glowing ring.',
          assetType: 'model',
          color: '#f4c000',
          price: 50,
          modelData: [
            { shape: 'torus', x: 0, y: 0.5, z: 0, sx: 1, sy: 1, sz: 1, color: '#f4c000', ry: 0 },
          ],
        },
      });
      expect(ugcCreate.statusCode).toBe(201);
      const ugcId = ugcCreate.json().item.id;

      const ugcBuy = await app.inject({
        method: 'POST',
        url: `/api/ugc/${ugcId}/purchase`,
        headers: { cookie: actorB.cookie },
      });
      expect(ugcBuy.statusCode).toBe(200);
      expect(ugcBuy.json().purchased).toBe(true);

      const ugcEquip = await app.inject({
        method: 'POST',
        url: `/api/ugc/${ugcId}/equip`,
        headers: { cookie: actorB.cookie },
      });
      expect(ugcEquip.statusCode).toBe(200);
      expect(ugcEquip.json().equipped).toBe(ugcId);

      // Daily tasks claim
      const tasksRes = await app.inject({
        method: 'GET',
        url: '/api/tasks',
        headers: { cookie: actorB.cookie },
      });
      expect(tasksRes.statusCode).toBe(200);
      const claimDaily = await app.inject({
        method: 'POST',
        url: '/api/tasks/daily-checkin/claim',
        headers: { cookie: actorB.cookie },
      });
      expect(claimDaily.statusCode).toBe(200);
      expect(claimDaily.json().claimed).toBe(true);
      expect(claimDaily.json().profile.starlits).toBe(135);
    } finally {
      await app.close();
    }
  });
});
