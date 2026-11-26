import { buildApp } from './app.js';
import { env } from './config/env.js';
import { closeDb } from './db/index.js';
import { realtimeHub } from './realtime/hub.js';

async function start() {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await realtimeHub.close();
    await app.close();
    await closeDb();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`Doria independent API listening on http://${env.HOST}:${env.PORT}`);
}

start().catch(err => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
