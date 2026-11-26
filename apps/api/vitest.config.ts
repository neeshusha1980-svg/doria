import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 20000,
    hookTimeout: 20000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL || 'postgresql://doria:doria_test_db_pass@localhost:5432/doria',
      BETTER_AUTH_SECRET: 'test_only_ephemeral_secret_key_for_vitest_suite_1234567890',
      BETTER_AUTH_URL: 'http://localhost:4000',
      CORS_ORIGIN: 'http://localhost:8080,http://localhost:5173',
      ADMIN_EMAILS: 'verified-admin@doria.test',
    },
  },
});
