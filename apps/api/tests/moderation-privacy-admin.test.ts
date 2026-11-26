import { describe, expect, it } from 'vitest';
import { createTestContext, signUpAndGetCookie } from './helpers/test-harness.js';

describe('Moderation, Safety Profile Enforcement, CSRF & Verified Admin Allowlist', () => {
  it('requires BOTH verified email and ADMIN_EMAILS membership, enforces safety suspension, and blocks cross-origin CSRF', async () => {
    const { app } = await createTestContext();
    try {
      const regularUser = await signUpAndGetCookie(app, {
        email: 'regular@doria.test',
        password: 'Password123!',
        name: 'Regular Player',
        emailVerified: true,
      });

      const unverifiedAdmin = await signUpAndGetCookie(app, {
        email: 'verified-admin@doria.test',
        password: 'Password123!',
        name: 'Unverified Admin Candidate',
        emailVerified: false,
      });

      const deniedUnverifiedAdmin = await app.inject({
        method: 'GET',
        url: '/api/admin/overview',
        headers: { cookie: unverifiedAdmin.cookie },
      });
      expect(deniedUnverifiedAdmin.statusCode).toBe(403);

      const { db } = await import('../src/db/index.js');
      const { user } = await import('../src/db/schema.js');
      const { eq } = await import('drizzle-orm');
      await db
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, unverifiedAdmin.userId));

      const verifiedAdmin = unverifiedAdmin;

      const deniedRegular = await app.inject({
        method: 'GET',
        url: '/api/admin/overview',
        headers: { cookie: regularUser.cookie },
      });
      expect(deniedRegular.statusCode).toBe(403);

      const csrfBlocked = await app.inject({
        method: 'POST',
        url: '/api/news',
        headers: {
          cookie: regularUser.cookie,
          origin: 'https://malicious-site.example',
        },
        payload: { text: 'Forged post' },
      });
      expect(csrfBlocked.statusCode).toBe(403);

      const grantPlus = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${regularUser.userId}/plus`,
        headers: { cookie: verifiedAdmin.cookie },
        payload: { active: true },
      });
      expect(grantPlus.statusCode).toBe(200);
      expect(grantPlus.json().plusActive).toBe(true);

      const newsRes = await app.inject({
        method: 'POST',
        url: '/api/news',
        headers: { cookie: verifiedAdmin.cookie },
        payload: { text: 'Welcome to the independent Doria platform!' },
      });
      expect(newsRes.statusCode).toBe(201);
      const postId = newsRes.json().post.id;

      const reportRes = await app.inject({
        method: 'POST',
        url: '/api/reports',
        headers: { cookie: regularUser.cookie },
        payload: {
          targetType: 'news',
          targetId: postId,
          reason: 'other',
          details: 'Testing moderation workflow',
        },
      });
      expect(reportRes.statusCode).toBe(201);
      const reportId = reportRes.json().reportId;

      const resolveRes = await app.inject({
        method: 'PUT',
        url: `/api/admin/reports/${reportId}`,
        headers: { cookie: verifiedAdmin.cookie },
        payload: { status: 'resolved' },
      });
      expect(resolveRes.statusCode).toBe(200);
      expect(resolveRes.json().report.status).toBe('resolved');

      const suspendRes = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${regularUser.userId}/safety`,
        headers: { cookie: verifiedAdmin.cookie },
        payload: { status: 'suspended' },
      });
      expect(suspendRes.statusCode).toBe(200);

      const blockedWhenSuspended = await app.inject({
        method: 'POST',
        url: '/api/news',
        headers: { cookie: regularUser.cookie },
        payload: { text: 'Should be blocked by safety profile' },
      });
      expect(blockedWhenSuspended.statusCode).toBe(403);

      const auditRes = await app.inject({
        method: 'GET',
        url: '/api/admin/audit-logs',
        headers: { cookie: verifiedAdmin.cookie },
      });
      expect(auditRes.statusCode).toBe(200);
      expect(auditRes.json().logs.length).toBeGreaterThanOrEqual(3);

      await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${regularUser.userId}/safety`,
        headers: { cookie: verifiedAdmin.cookie },
        payload: { status: 'standard' },
      });

      const blockRes = await app.inject({
        method: 'POST',
        url: '/api/blocks',
        headers: { cookie: regularUser.cookie },
        payload: { userId: verifiedAdmin.userId },
      });
      expect(blockRes.statusCode).toBe(200);

      const newsAfterBlock = await app.inject({
        method: 'GET',
        url: '/api/news',
        headers: { cookie: regularUser.cookie },
      });
      expect(newsAfterBlock.json().posts).toHaveLength(0);

      const delReq = await app.inject({
        method: 'POST',
        url: '/api/privacy/deletion-requests',
        headers: { cookie: regularUser.cookie },
      });
      expect(delReq.statusCode).toBe(201);
      expect(delReq.json().requested).toBe(true);
    } finally {
      await app.close();
    }
  });
});
