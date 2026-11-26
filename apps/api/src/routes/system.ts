import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export async function registerSystemRoutes(app: FastifyInstance) {
  app.get('/api/_healthcheck', async (_request, reply) => {
    try {
      await db.execute(sql`SELECT 1`);
      return reply.send({ ok: true, app: 'Doria' });
    } catch {
      return reply.code(503).send({ ok: false, app: 'Doria', error: 'Database unavailable' });
    }
  });
}
