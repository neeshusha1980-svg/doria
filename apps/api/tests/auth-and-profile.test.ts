import { describe, expect, it, afterAll } from 'vitest';
import { closeDb } from '../src/db/index.js';
import { createTestContext, signUpAndGetCookie } from './helpers/test-harness.js';

afterAll(async () => {
  await closeDb();
});

describe('Authentication, Username Directory, Profile & Avatar', () => {
  it('registers a user, claims a unique username atomically, and persists profile & avatar look', async () => {
    const { app } = await createTestContext();
    try {
      const health = await app.inject({ method: 'GET', url: '/api/_healthcheck' });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toEqual({ ok: true, app: 'Doria' });

      const unauthMe = await app.inject({ method: 'GET', url: '/api/me' });
      expect(unauthMe.statusCode).toBe(401);

      const playerA = await signUpAndGetCookie(app, {
        email: 'creator_a@doria.test',
        password: 'Password123!',
        name: 'Creator A',
      });

      const initialMe = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { cookie: playerA.cookie },
      });
      expect(initialMe.statusCode).toBe(200);
      expect(initialMe.json().profile.starlits).toBe(250);
      expect(initialMe.json().profile.trophies).toContain('first-steps');

      const setupRes = await app.inject({
        method: 'POST',
        url: '/api/setup-username',
        headers: { cookie: playerA.cookie },
        payload: { username: 'StarCreator7' },
      });
      expect(setupRes.statusCode).toBe(201);
      expect(setupRes.json().profile.username).toBe('StarCreator7');

      // Duplicate username claim (case-insensitive) must return 409
      const playerB = await signUpAndGetCookie(app, {
        email: 'creator_b@doria.test',
        password: 'Password123!',
        name: 'Creator B',
      });
      const dupRes = await app.inject({
        method: 'POST',
        url: '/api/setup-username',
        headers: { cookie: playerB.cookie },
        payload: { username: 'starcreator7' },
      });
      expect(dupRes.statusCode).toBe(409);

      // Update profile display name and bio
      const profRes = await app.inject({
        method: 'PUT',
        url: '/api/profile',
        headers: { cookie: playerA.cookie },
        payload: { displayName: 'Star Builder', bio: 'Making worlds in Doria' },
      });
      expect(profRes.statusCode).toBe(200);
      expect(profRes.json().profile.displayName).toBe('Star Builder');
      expect(profRes.json().profile.bio).toBe('Making worlds in Doria');

      // Avatar look validation & persistence
      const badAvatar = await app.inject({
        method: 'PUT',
        url: '/api/avatar-look',
        headers: { cookie: playerA.cookie },
        payload: { body: '#123456', accent: '#7cebe5', style: 'classic' },
      });
      expect(badAvatar.statusCode).toBe(400);

      const goodAvatar = await app.inject({
        method: 'PUT',
        url: '/api/avatar-look',
        headers: { cookie: playerA.cookie },
        payload: { body: '#f4c000', accent: '#ffe37b', style: 'crown' },
      });
      expect(goodAvatar.statusCode).toBe(200);
      expect(goodAvatar.json().avatarLook).toEqual({
        body: '#f4c000',
        accent: '#ffe37b',
        style: 'crown',
      });

      const searchRes = await app.inject({
        method: 'GET',
        url: '/api/users/search?username=StarCreator7',
        headers: { cookie: playerB.cookie },
      });
      expect(searchRes.statusCode).toBe(200);
      expect(searchRes.json().found).toBe(true);
      expect(searchRes.json().user.username).toBe('StarCreator7');
    } finally {
      await app.close();
    }
  });
});
