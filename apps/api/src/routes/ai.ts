import type { FastifyInstance } from 'fastify';
import { requireAuth, requireGuardianPermission, requireSafety } from '../auth/guards.js';
import {
  ALLOWED_GENRES,
  getAiUsage,
  getOrCreateProfile,
  releaseAiUsage,
  reserveAiUsage,
  type AiReservation,
} from '../services/profiles.js';
import { NeoProviderError, type NeoProviderAdapter } from '../ai/neo-adapter.js';

const NEO_SYSTEM_PROMPT =
  'You are Neo, Doria’s game creation AI. Create a small, complete, playable browser mini-game as one standalone HTML document. Return ONLY HTML, with no Markdown fences or explanation. Put all CSS and JavaScript inline. Make the game responsive for phones and desktop, include clear instructions and a visible restart control, and make the main interaction genuinely playable. Use accessible buttons and readable contrast. Keep the content friendly and age-appropriate for a youth gaming platform. Never include sexual, graphic, hateful, or dangerous content. Do not load external scripts, styles, fonts, images, or other resources. Do not use fetch, XMLHttpRequest, WebSocket, EventSource, forms, popups, cookies, localStorage, sessionStorage, or navigation. Do not attempt to access the parent page, browser APIs, or Doria account data. Do not include iframe, object, embed, or external links. Use only self-contained HTML, CSS, and simple inline JavaScript.';

const UNSAFE_HTML_PATTERNS: RegExp[] = [
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /<form/i,
  /fetch\s*\(/i,
  /XMLHttpRequest/i,
  /new\s+WebSocket/i,
  /new\s+EventSource/i,
  /document\.cookie/i,
  /localStorage/i,
  /sessionStorage/i,
  /window\.(?:parent|top|opener)/i,
  /(?:src|href)\s*=\s*["']\s*(?:https?:|\/\/)/i,
];

function isSafeGeneratedGameHtml(html: string): boolean {
  if (html.length < 100 || html.length > 60000 || !/<body/i.test(html)) {
    return false;
  }
  return !UNSAFE_HTML_PATTERNS.some(pattern => pattern.test(html));
}

export async function registerAiRoutes(
  app: FastifyInstance,
  neoAdapter: NeoProviderAdapter,
  rateLimitEnabled = false
) {
  app.get(
    '/api/ai/usage',
    {
      preHandler: [
        requireAuth,
        requireSafety,
        requireGuardianPermission('allowAi', 'Neo AI is disabled by your guardian.'),
      ],
    },
    async (request, reply) => {
      const user = request.doriaUser!;
      const profile = await getOrCreateProfile(user.userId, user.name);
      const usage = await getAiUsage(user.userId, profile.plusActive === true);
      return reply.send({ usage });
    }
  );

  app.post(
    '/api/neo/generate',
    {
      preHandler: [
        requireAuth,
        requireSafety,
        requireGuardianPermission('allowAi', 'Neo AI is disabled by your guardian.'),
      ],
      config: rateLimitEnabled
        ? {
            rateLimit: {
              max: 10,
              timeWindow: '1 minute',
            },
          }
        : undefined,
    },
    async (request, reply) => {
      const user = request.doriaUser!;
      const input = (request.body || {}) as {
        gameName?: unknown;
        genre?: unknown;
        prompt?: unknown;
      };
      const gameName =
        typeof input.gameName === 'string' ? input.gameName.trim().slice(0, 42) : '';
      const genre = typeof input.genre === 'string' ? input.genre : '';
      const prompt = typeof input.prompt === 'string' ? input.prompt.trim().slice(0, 500) : '';

      if (gameName.length < 3 || !ALLOWED_GENRES.has(genre) || prompt.length < 8) {
        return reply.code(400).send({
          error: 'Add a game name, supported genre, and a description of at least 8 characters.',
        });
      }

      const profile = await getOrCreateProfile(user.userId, user.name);
      const isPlus = profile.plusActive === true;
      const cost = prompt.length > 320 ? 30 : prompt.length > 140 ? 25 : 10;

      let reservation: AiReservation;
      try {
        reservation = await reserveAiUsage(user.userId, isPlus, isPlus ? cost : 1);
      } catch (cause) {
        const failure = cause as { code?: string };
        if (failure?.code === 'AI_LIMIT_REACHED') {
          return reply.code(429).send({
            error: isPlus
              ? 'You have used your 1,000 Doria Plus AI credits for this month. Your credits refresh next month.'
              : 'You have used all 10 free Neo prompts for today. Your daily prompts refresh tomorrow.',
          });
        }
        return reply
          .code(503)
          .send({ error: 'Your AI usage could not be checked. Please try again shortly.' });
      }

      try {
        const generated = await neoAdapter.generate({
          system: NEO_SYSTEM_PROMPT,
          prompt: `Create a playable mini-game for Doria. Game name: ${gameName}. Genre: ${genre}. Creator description: ${prompt}. Make the core gameplay match this idea rather than returning a generic template.`,
          maxTokens: 4500,
          temperature: 0.7,
        });

        const html = generated.text
          .trim()
          .replace(/^```(?:html)?\s*/i, '')
          .replace(/\s*```$/, '')
          .trim();

        if (!isSafeGeneratedGameHtml(html)) {
          await releaseAiUsage(reservation);
          return reply.code(502).send({
            error:
              'Neo could not produce a safe, playable game this time. Your AI usage was restored. Try a clearer or simpler idea.',
          });
        }

        return reply.send({
          html,
          model: 'Neo',
          usage: await getAiUsage(user.userId, isPlus),
          cost: isPlus ? cost : 1,
        });
      } catch (cause) {
        await releaseAiUsage(reservation);
        if (cause instanceof NeoProviderError && cause.statusCode === 429) {
          return reply.code(429).send({
            error:
              'Neo is busy right now. Your AI usage was restored; please wait a moment and try again.',
          });
        }
        return reply.code(503).send({
          error: 'Neo is temporarily unavailable. Your AI usage was restored; please try again.',
        });
      }
    }
  );
}
