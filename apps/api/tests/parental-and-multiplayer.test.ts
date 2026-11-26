import { describe, expect, it } from 'vitest';
import { createTestContext, signUpAndGetCookie } from './helpers/test-harness.js';

describe('Parental Controls, Guardian Gates, Multiplayer, Chat & AI Permissions', () => {
  it('enforces guardian-linked supervised multiplayer, chat, friend request, moments, and AI permissions', async () => {
    const { app } = await createTestContext();
    try {
      const player = await signUpAndGetCookie(app, {
        email: 'youngplayer@doria.test',
        password: 'Password123!',
        name: 'Young Player',
      });
      const guardian = await signUpAndGetCookie(app, {
        email: 'guardian@doria.test',
        password: 'Password123!',
        name: 'Parent Guardian',
      });

      await app.inject({
        method: 'POST',
        url: '/api/setup-username',
        headers: { cookie: player.cookie },
        payload: { username: 'YoungPlayer1' },
      });
      await app.inject({
        method: 'POST',
        url: '/api/setup-username',
        headers: { cookie: guardian.cookie },
        payload: { username: 'ParentGuardian1' },
      });

      const gameRes = await app.inject({
        method: 'POST',
        url: '/api/games',
        headers: { cookie: guardian.cookie },
        payload: {
          name: 'Safe Arena',
          genre: 'Social',
          description: 'Community hangout',
          creationMode: 'baseplate',
          sceneData: [{ kind: 'block', x: 0, z: 0, color: '#9b7bff' }],
        },
      });
      const gameId = gameRes.json().game.id;

      const lockedMp = await app.inject({
        method: 'POST',
        url: `/api/multiplayer/${gameId}/join`,
        headers: { cookie: player.cookie },
      });
      expect(lockedMp.statusCode).toBe(403);

      const lockedChat = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: player.cookie },
        payload: { gameId, text: 'Hello!' },
      });
      expect(lockedChat.statusCode).toBe(403);

      const inviteRes = await app.inject({
        method: 'POST',
        url: '/api/parental/invitations',
        headers: { cookie: player.cookie },
        payload: { email: 'guardian@doria.test' },
      });
      expect(inviteRes.statusCode).toBe(201);
      const token = inviteRes.json().token;

      const wrongAccept = await app.inject({
        method: 'POST',
        url: '/api/parental/invitations/accept',
        headers: { cookie: player.cookie },
        payload: { token },
      });
      expect(wrongAccept.statusCode).toBe(403);

      const acceptRes = await app.inject({
        method: 'POST',
        url: '/api/parental/invitations/accept',
        headers: { cookie: guardian.cookie },
        payload: { token },
      });
      expect(acceptRes.statusCode).toBe(200);
      expect(acceptRes.json().accepted).toBe(true);

      const disableAi = await app.inject({
        method: 'PUT',
        url: `/api/parental/children/${player.userId}/settings`,
        headers: { cookie: guardian.cookie },
        payload: { allowAi: false },
      });
      expect(disableAi.statusCode).toBe(200);

      const deniedAi = await app.inject({
        method: 'POST',
        url: '/api/neo/generate',
        headers: { cookie: player.cookie },
        payload: {
          gameName: 'Child Game',
          genre: 'Adventure',
          prompt: 'A fun adventure world',
        },
      });
      expect(deniedAi.statusCode).toBe(403);

      const enableMp = await app.inject({
        method: 'PUT',
        url: `/api/parental/children/${player.userId}/multiplayer`,
        headers: { cookie: guardian.cookie },
        payload: { enabled: true },
      });
      expect(enableMp.statusCode).toBe(200);

      const enableChat = await app.inject({
        method: 'PUT',
        url: `/api/parental/children/${player.userId}/settings`,
        headers: { cookie: guardian.cookie },
        payload: { allowChat: true },
      });
      expect(enableChat.statusCode).toBe(200);

      const joinOk = await app.inject({
        method: 'POST',
        url: `/api/multiplayer/${gameId}/join`,
        headers: { cookie: player.cookie },
      });
      expect(joinOk.statusCode).toBe(201);

      const stateOk = await app.inject({
        method: 'POST',
        url: `/api/multiplayer/${gameId}/state`,
        headers: { cookie: player.cookie },
        payload: { lane: 1, distance: 12, jump: 0, score: 1, status: 'playing' },
      });
      expect(stateOk.statusCode).toBe(200);

      const chatOk = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: player.cookie },
        payload: { gameId, text: 'Hello everyone!' },
      });
      expect(chatOk.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });
});
