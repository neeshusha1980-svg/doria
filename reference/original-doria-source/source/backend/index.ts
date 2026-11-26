import { router, json, error, db, increment, requireAuth, requireAdminEmailAllowlist, ai, storage } from '@appdeploy/sdk';
import { createHash, randomBytes } from 'node:crypto';
import { notifySubscribers, realtimeSubscriptionRoutes } from './realtime-subscribers';
import { canAccessGameRoom } from './room-access';

type GameInput = { name?: unknown; genre?: unknown; description?: unknown; creationMode?: unknown; htmlCode?: unknown; neoPrompt?: unknown; sceneData?: unknown };
type AvatarLook = {
  body: string;
  accent: string;
  style: 'classic' | 'halo' | 'crown';
};
type PublicProfile = {
  userId: string;
  username?: string;
  displayName: string;
  starlits: number;
  trophies: string[];
  bio?: string;
  plusActive?: boolean;
  equippedUgcId?: string;
  avatarLook?: AvatarLook;
};
const DEFAULT_AVATAR_LOOK: AvatarLook = {
  body: '#9b7bff',
  accent: '#7cebe5',
  style: 'classic',
};
const AVATAR_BODY_COLORS = new Set([
  '#9b7bff', '#ff7db7', '#55d6be', '#f4c000', '#69a8ff', '#f0f0f7',
]);
const AVATAR_ACCENT_COLORS = new Set([
  '#7cebe5', '#ffe37b', '#ff8ed5', '#a6f2a6', '#ffffff',
]);
const allowedGenres = new Set(['Adventure','Obby','Roleplay','Simulator','Racing','Puzzle','Social']);

const defaultProfile = (userId: string, name?: string) => ({
  id: userId, userId, displayName: (name || 'Creator').slice(0, 48),
  starlits: 250, trophies: ['first-steps'], createdAt: new Date().toISOString(),
});
async function getOrCreateProfile(userId: string, name?: string): Promise<PublicProfile> {
  // Profile onboarding must be read-after-write consistent: a returning user
  // with a saved username should never be sent through username setup again.
  const [saved] = await db.get<PublicProfile>('profiles', [userId], { consistent: true });
  if (saved) return saved;
  const profile = defaultProfile(userId, name);
  await db.tx.add('profiles', [profile]);
  const [created] = await db.get<PublicProfile>('profiles', [userId], { consistent: true });
  return created || profile;
}

async function syncEarnedTrophies(userId: string, currentProfile?: PublicProfile): Promise<PublicProfile> {
  const profile = currentProfile || await getOrCreateProfile(userId);
  const [games, ideaClaim] = await Promise.all([
    listRecent<{ ownerId?: string; status?: string }>('games', 5000),
    db.get<{ userId: string }>('reward_claims', [userId + '_ideaStarter'], { consistent: true }),
  ]);
  const publishedCount = games.filter(game => game.ownerId === userId && game.status === 'published').length;
  const earned = new Set(Array.isArray(profile.trophies) ? profile.trophies : []);
  earned.add('first-steps');
  if (publishedCount >= 1) earned.add('world-maker');
  if (publishedCount >= 5) earned.add('rising-creator');
  if (publishedCount >= 10) earned.add('studio-veteran');
  if (ideaClaim[0]) earned.add('idea-starter');
  const trophies = Array.from(earned);
  const previous = Array.isArray(profile.trophies) ? profile.trophies : [];
  if (trophies.length === previous.length && trophies.every(id => previous.includes(id))) return { ...profile, trophies };
  await db.tx.update('profiles', [{ id: userId, record: { trophies } }], { patch: true });
  const [updated] = await db.get<PublicProfile>('profiles', [userId], { consistent: true });
  return updated || { ...profile, trophies };
}
function usernameFrom(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/^@/, '') : '';
}
function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}
async function listRecent<T>(table: string, limit = 100): Promise<T[]> {
  const result = await db.list<T>(table, { limit });
  return result.items;
}

async function isBlockedEitherWay(userA: string, userB: string): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false;
  const idA = safeId('block_' + userA + '_' + userB);
  const idB = safeId('block_' + userB + '_' + userA);
  const [a, b] = await Promise.all([
    db.get<{ id: string }>('user_blocks', [idA], { consistent: true }),
    db.get<{ id: string }>('user_blocks', [idB], { consistent: true }),
  ]);
  return Boolean(a[0] || b[0]);
}

async function requireSafety({ user }: { user?: { userId: string } }) {
  if (!user) return error('Sign in required.', 401);
}

async function requireMultiplayerSafety({ user }: { user?: { userId: string } }) {
  if (!user) return error('Sign in required.', 401);
  const [safety] = await db.get<{ status: string; supervisedAccess?: boolean }>('safety_profiles', [user.userId], { consistent: true });
  if (!safety || safety.status !== 'active' || safety.supervisedAccess !== true) {
    return error('Multiplayer is locked until a linked guardian enables supervised access. No external identity check is used.', 403);
  }
}

const ADMIN_EMAILS = [
  'ritanshletsplayfootball@gmail.com',
  'akshat.aggarwal217@gmail.com',
  'mokshnaksh15@gmail.com',
  'piyushgupta71@gmail.com',
  'vedantsinghparihar83@gmail.com',
];
const requireDoriaAdmin = requireAdminEmailAllowlist(ADMIN_EMAILS);

const FREE_DAILY_LIMIT = 10;
const PLUS_MONTHLY_CREDITS = 1000;

function usagePeriod(isPlus: boolean, now = new Date()) {
  return isPlus
    ? 'month_' + now.getUTCFullYear() + '_' + String(now.getUTCMonth() + 1).padStart(2, '0')
    : 'day_' + now.toISOString().slice(0, 10);
}

async function reserveAiUsage(userId: string, isPlus: boolean, cost: number) {
  const period = usagePeriod(isPlus);
  const id = safeId('ai_' + userId + '_' + period);
  const field = isPlus ? 'plusCreditsUsed' : 'freePromptsUsed';
  const limit = isPlus ? PLUS_MONTHLY_CREDITS : FREE_DAILY_LIMIT;
  await db.tx.add('ai_usage', [{
    id, userId, period, plusCreditsUsed: 0, freePromptsUsed: 0,
    updatedAt: new Date().toISOString(),
  }]);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [usage] = await db.get<Record<string, unknown>>('ai_usage', [id], { consistent: true });
    if (!usage) throw new Error('AI usage record could not be created.');
    const used = Number(usage[field] || 0);
    if (!Number.isFinite(used) || used + cost > limit) {
      const remaining = Math.max(0, limit - (Number.isFinite(used) ? used : limit));
      throw Object.assign(new Error('AI_LIMIT_REACHED'), { code: 'AI_LIMIT_REACHED', remaining, limit, isPlus });
    }
    const [updated] = await db.tx.update('ai_usage', [{
      id,
      record: { [field]: increment(cost), updatedAt: new Date().toISOString() },
      if: { [field]: used },
    }], { patch: true });
    if (updated) return { id, field, cost, isPlus, period, usedAfter: used + cost };
  }
  throw new Error('AI usage is busy. Please try again.');
}

async function releaseAiUsage(reservation: { id: string; field: string; cost: number }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [usage] = await db.get<Record<string, unknown>>('ai_usage', [reservation.id], { consistent: true });
    if (!usage) return;
    const used = Number(usage[reservation.field] || 0);
    if (used < reservation.cost) return;
    const [updated] = await db.tx.update('ai_usage', [{
      id: reservation.id,
      record: { [reservation.field]: increment(-reservation.cost), updatedAt: new Date().toISOString() },
      if: { [reservation.field]: used },
    }], { patch: true });
    if (updated) return;
  }
  console.error('Could not reconcile a failed Neo generation credit reservation.');
}

async function getAiUsage(userId: string, isPlus: boolean) {
  const period = usagePeriod(isPlus);
  const id = safeId('ai_' + userId + '_' + period);
  const [usage] = await db.get<Record<string, unknown>>('ai_usage', [id], { consistent: true });
  if (isPlus) {
    const used = Number(usage?.plusCreditsUsed || 0);
    return { plan: 'plus', period, monthlyAllowance: PLUS_MONTHLY_CREDITS, creditsUsed: used, creditsRemaining: Math.max(0, PLUS_MONTHLY_CREDITS - used) };
  }
  const used = Number(usage?.freePromptsUsed || 0);
  return { plan: 'free', period, dailyAllowance: FREE_DAILY_LIMIT, promptsUsed: used, promptsRemaining: Math.max(0, FREE_DAILY_LIMIT - used) };
}

export const handler = router({
  ...realtimeSubscriptionRoutes,
  'GET /api/_healthcheck': [async () => json({ ok: true, app: 'Doria' })],
  'GET /api/admin/overview': [requireAuth(), requireDoriaAdmin, async ({ user }) => {
    const [profiles, games, reports] = await Promise.all([
      db.list('profiles', { limit: 100 }),
      db.list('games', { limit: 100 }),
      db.list('content_reports', { limit: 100 }),
    ]);
    return json({ counts: { users: profiles.items.length, games: games.items.length, reports: reports.items.length }, recentReports: reports.items.slice(-8).reverse(), adminVerified: true, adminEmail: user?.email || '' });
  }],
  'GET /api/admin/games': [requireAuth(), requireDoriaAdmin, async () => {
    const result = await db.list<Record<string, unknown>>('games', { limit: 100 });
    return json({ games: result.items.map(game => ({ id: game.id, name: game.name, description: game.description || '', genre: game.genre || '', creatorName: game.creatorName || '', plays: game.plays || 0, status: game.status || 'published' })) });
  }],
  'PUT /api/admin/games/:id': [requireAuth(), requireDoriaAdmin, async ({ params, body }) => {
    const id = String(params.id || '');
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) return error('Invalid game id.', 400);
    const input = (body || {}) as { name?: unknown; description?: unknown; genre?: unknown };
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.name !== undefined) {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (name.length < 3 || name.length > 42) return error('Game name must be 3–42 characters.', 400);
      patch.name = name;
    }
    if (input.description !== undefined) {
      const description = typeof input.description === 'string' ? input.description.trim() : '';
      if (description.length > 180) return error('Game description must be 180 characters or fewer.', 400);
      patch.description = description;
    }
    if (input.genre !== undefined) {
      const genre = String(input.genre || '');
      if (!allowedGenres.has(genre)) return error('Choose a supported game genre.', 400);
      patch.genre = genre;
    }
    const [updated] = await db.tx.update('games', [{ id, record: patch }], { patch: true });
    if (!updated) return error('Game not found or could not be updated.', 404);
    const [game] = await db.get<Record<string, unknown>>('games', [id], { consistent: true });
    return json({ game: game || { id, ...patch } });
  }],
  'GET /api/admin/users': [requireAuth(), requireDoriaAdmin, async () => {
    const result = await db.list<Record<string, unknown>>('profiles', { limit: 100 });
    return json({ users: result.items.map((profile) => ({ userId: profile.userId, username: profile.username || null, displayName: profile.displayName || 'Doria user', plusActive: profile.plusActive === true, createdAt: profile.createdAt || null })) });
  }],
  'GET /api/admin/reports': [requireAuth(), requireDoriaAdmin, async () => {
    const result = await db.list<Record<string, unknown>>('content_reports', { limit: 100 });
    return json({ reports: result.items.slice().reverse() });
  }],
  'GET /api/admin/privacy-requests': [requireAuth(), requireDoriaAdmin, async () => {
    const result = await db.list<Record<string, unknown>>('privacy_requests', { limit: 100 });
    return json({ requests: result.items.slice().reverse() });
  }],
  'PUT /api/admin/privacy-requests/:id': [requireAuth(), requireDoriaAdmin, async ({ params, body, user }) => {
    const id = String(params.id || '');
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) return error('Invalid privacy request id.', 400);
    const status = (body as { status?: unknown } | null)?.status;
    if (!['reviewing', 'contacted'].includes(String(status))) return error('Choose a valid privacy request status.', 400);
    const [updated] = await db.tx.update('privacy_requests', [{ id, record: { status, reviewedAt: new Date().toISOString(), reviewedBy: user!.userId } }], { patch: true });
    if (!updated) return error('Privacy request not found. Refresh and try again.', 404);
    const [request] = await db.get<Record<string, unknown>>('privacy_requests', [id], { consistent: true });
    return json({ request: request || { id, status } });
  }],
  'PUT /api/admin/reports/:id': [requireAuth(), requireDoriaAdmin, async ({ params, body, user }) => {
    const id = String(params.id || '');
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) return error('Invalid report id.', 400);
    const status = (body as { status?: unknown } | null)?.status;
    if (!['reviewing', 'resolved', 'dismissed'].includes(String(status))) return error('Choose a valid report status.', 400);
    const [updated] = await db.tx.update('content_reports', [{ id, record: { status, reviewedAt: new Date().toISOString(), reviewedBy: user!.userId } }], { patch: true });
    if (!updated) return error('Report not found or already changed. Refresh and try again.', 404);
    const [report] = await db.get<Record<string, unknown>>('content_reports', [id], { consistent: true });
    return json({ report: report || { id, status } });
  }],
  'GET /api/ai/usage': [requireAuth(), requireSafety, async ({ user }) => {
    const profile = await getOrCreateProfile(user!.userId, user!.name);
    return json({ usage: await getAiUsage(user!.userId, profile.plusActive === true) });
  }],
  'PUT /api/admin/users/:id/plus': [requireAuth(), requireDoriaAdmin, async ({ params, body }) => {
    const id = String(params.id || '');
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) return error('Invalid user id.', 400);
    const active = (body as { active?: unknown } | null)?.active;
    if (typeof active !== 'boolean') return error('Choose whether Doria Plus is active.', 400);
    const [updated] = await db.tx.update('profiles', [{ id, record: { plusActive: active, planUpdatedAt: new Date().toISOString() } }], { patch: true });
    if (!updated) return error('User profile not found.', 404);
    return json({ userId: id, plusActive: active });
  }],
  'POST /api/neo/generate': [requireAuth(), requireSafety, async ({ body, user }) => {
    const input = (body || {}) as { gameName?: unknown; genre?: unknown; prompt?: unknown };
    const gameName = typeof input.gameName === 'string' ? input.gameName.trim().slice(0, 42) : '';
    const genre = typeof input.genre === 'string' ? input.genre : '';
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim().slice(0, 500) : '';
    if (gameName.length < 3 || !allowedGenres.has(genre) || prompt.length < 8) {
      return error('Add a game name, supported genre, and a description of at least 8 characters.', 400);
    }
    const profile = await getOrCreateProfile(user!.userId, user!.name);
    const isPlus = profile.plusActive === true;
    const cost = prompt.length > 320 ? 30 : prompt.length > 140 ? 25 : 10;
    let reservation: Awaited<ReturnType<typeof reserveAiUsage>>;
    try {
      reservation = await reserveAiUsage(user!.userId, isPlus, isPlus ? cost : 1);
    } catch (cause) {
      const failure = cause as { code?: string; remaining?: number; limit?: number; isPlus?: boolean };
      if (failure?.code === 'AI_LIMIT_REACHED') {
        return error(isPlus
          ? 'You have used your 1,000 Doria Plus AI credits for this month. Your credits refresh next month.'
          : 'You have used all 10 free Neo prompts for today. Your daily prompts refresh tomorrow.', 429);
      }
      console.error('Neo usage reservation failed', cause);
      return error('Your AI usage could not be checked. Please try again shortly.', 503);
    }
    try {
      const generated = await ai.generate({
        system: 'You are Neo, Doria’s game creation AI. Create a small, complete, playable browser mini-game as one standalone HTML document. Return ONLY HTML, with no Markdown fences or explanation. Put all CSS and JavaScript inline. Make the game responsive for phones and desktop, include clear instructions and a visible restart control, and make the main interaction genuinely playable. Use accessible buttons and readable contrast. Keep the content friendly and age-appropriate for a youth gaming platform. Never include sexual, graphic, hateful, or dangerous content. Do not load external scripts, styles, fonts, images, or other resources. Do not use fetch, XMLHttpRequest, WebSocket, EventSource, forms, popups, cookies, localStorage, sessionStorage, or navigation. Do not attempt to access the parent page, browser APIs, or Doria account data. Do not include iframe, object, embed, or external links. Use only self-contained HTML, CSS, and simple inline JavaScript.',
        prompt: 'Create a playable mini-game for Doria. Game name: ' + gameName + '. Genre: ' + genre + '. Creator description: ' + prompt + '. Make the core gameplay match this idea rather than returning a generic template.',
        maxTokens: 4500,
        temperature: 0.7,
        thinkingMode: 'FAST',
      });
      const html = generated.text.trim().replace(/^\x60\x60\x60(?:html)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '').trim();
      if (html.length < 100 || html.length > 60000 || !/<body\b/i.test(html)) {
        await releaseAiUsage(reservation);
        return error('Neo could not produce a playable game this time. Your AI usage was restored. Try a clearer or simpler idea.', 502);
      }
      return json({ html, model: 'Neo', usage: await getAiUsage(user!.userId, isPlus), cost: isPlus ? cost : 1 });
    } catch (cause) {
      await releaseAiUsage(reservation);
      const failure = cause as { statusCode?: number };
      if (failure?.statusCode === 429) return error('Neo is busy right now. Your AI usage was restored; please wait a moment and try again.', 429);
      console.error('Neo generation failed', cause);
      return error('Neo is temporarily unavailable. Your AI usage was restored; please try again.', 503);
    }
  }],

    

  'GET /api/my/games': [requireAuth(), async ({ query, user }) => {
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 30));
    const result = await db.list<Record<string, unknown>>('games', {
      limit,
      ...(query.nextToken ? { nextToken: query.nextToken } : {}),
      filter: { ownerId: user!.userId },
    });
    const likes = await listRecent<{ gameId: string }>('game_likes', 5000);
    const likeCounts = new Map<string, number>();
    likes.forEach(row => likeCounts.set(row.gameId, (likeCounts.get(row.gameId) || 0) + 1));
    return json({
      games: result.items.slice().reverse().map(game => ({
        ...game,
        likes: likeCounts.get(String(game.id)) || 0,
        status: game.status || 'published',
      })),
      nextToken: result.nextToken || null,
    });
  }],
  'GET /api/games': [async ({ query }) => {
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 30));
    const result = await db.list<Record<string, unknown>>('games', {
      limit,
      ...(query.nextToken ? { nextToken: query.nextToken } : {}),
    });
    const likes = await listRecent<{ gameId: string }>('game_likes', 5000);
    const likeCounts = new Map<string, number>();
    likes.forEach(row => likeCounts.set(row.gameId, (likeCounts.get(row.gameId) || 0) + 1));
    const visibleGames = result.items
      .filter(game => {
        const status = String(game.status || 'published').toLowerCase();
        const visibility = String(game.visibility || 'public').toLowerCase();
        return ['published', 'approved'].includes(status)
          && game.isPrivate !== true
          && visibility !== 'private';
      })
      .slice()
      .reverse()
      .map(game => ({
        ...game,
        likes: likeCounts.get(String(game.id)) || 0,
        status: game.status || 'published',
      }));
    return json({ games: visibleGames, nextToken: result.nextToken || null });
  }],
  'GET /api/me': [requireAuth(), async ({ user }) => {
    const [safety] = await db.get('safety_profiles', [user!.userId], { consistent: true });
    const profile = await getOrCreateProfile(user!.userId, user!.name);
    return json({ profile: await syncEarnedTrophies(user!.userId, profile), safety: safety || null });
  }],
  'GET /api/avatar-look': [requireAuth(), async ({ user }) => {
    const profile = await getOrCreateProfile(user!.userId, user!.name);
    return json({ avatarLook: profile.avatarLook || DEFAULT_AVATAR_LOOK });
  }],
  'PUT /api/avatar-look': [requireAuth(), requireSafety, async ({ body, user }) => {
    const input = (body || {}) as { body?: unknown; accent?: unknown; style?: unknown };
    const avatarBody = typeof input.body === 'string' ? input.body.toLowerCase() : '';
    const accent = typeof input.accent === 'string' ? input.accent.toLowerCase() : '';
    const style = typeof input.style === 'string' ? input.style : '';

    if (!AVATAR_BODY_COLORS.has(avatarBody) || !AVATAR_ACCENT_COLORS.has(accent) || !['classic', 'halo', 'crown'].includes(style)) {
      return error('Choose a supported avatar colour and accessory.', 400);
    }

    await getOrCreateProfile(user!.userId, user!.name);
    const avatarLook: AvatarLook = { body: avatarBody, accent, style: style as AvatarLook['style'] };
    const [updated] = await db.tx.update('profiles', [{
      id: user!.userId,
      record: { avatarLook, updatedAt: new Date().toISOString() },
    }], { patch: true });

    if (!updated) return error('Avatar could not be saved. Please retry.', 503);
    return json({ saved: true, avatarLook });
  }],
  'PUT /api/profile': [requireAuth(), async ({ body, user }) => {
    const input = (body || {}) as { displayName?: unknown; bio?: unknown };
    const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
    const bio = typeof input.bio === 'string' ? input.bio.trim() : '';
    if (displayName.length < 2 || displayName.length > 40) return error('Display name must be 2–40 characters.', 400);
    if (bio.length > 220) return error('Bio must be 220 characters or fewer.', 400);
    const [updated] = await db.tx.update('profiles', [{
      id: user!.userId,
      record: { displayName, bio, updatedAt: new Date().toISOString() },
    }], { patch: true });
    if (!updated) return error('Profile could not be saved. Please retry.', 503);
    const [profile] = await db.get<PublicProfile>('profiles', [user!.userId], { consistent: true });
    return json({ profile: profile || { userId: user!.userId, displayName, bio, starlits: 0, trophies: [] } });
  }],
  'POST /api/games/:id/like': [requireAuth(), requireSafety, async ({ params, user }) => {
    const gameId=String(params.id||'').slice(0,120); if(!gameId) return error('Game id required.',400);
    const [game] = await db.get<Record<string, unknown>>('games', [gameId], { consistent: true });
    if (!game || !(await canAccessGameRoom(gameId, user!.userId))) return error('Game not found.', 404);
    const userId=user!.userId; const likeId=safeId('like_'+gameId+'_'+userId);
    const [existing]=await db.get<{id:string;gameId:string;userId:string}>('game_likes',[likeId],{consistent:true});
    if(existing) await db.delete('game_likes',[likeId]); else await db.add('game_likes',[{id:likeId,gameId,userId,createdAt:new Date().toISOString()}]);
    const rows=await listRecent<{gameId:string}>('game_likes',5000);
    return json({ liked: !existing, likes: rows.filter(row => row.gameId === gameId).length });
  }],
  'POST /api/setup-username': [requireAuth(), requireSafety, async ({ body, user }) => {
    const username = usernameFrom((body as { username?: unknown } | null)?.username);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return error('Username must be 3–20 characters using letters, numbers or underscores.', 400);
    const userId = user!.userId;
    const existing = await getOrCreateProfile(userId, user!.name);
    if (existing.username) return error('Your account already has a username.', 409);
    const normalized = username.toLowerCase();
    const [claimed] = await db.get<{ userId: string; username: string }>('usernames', [normalized], { consistent: true });
    if (claimed && claimed.userId !== userId) return error('That username is already taken. Try another one.', 409);
    const addUsername = db.tx.add('usernames', [{ id: normalized, userId, username }]);
    const updateProfile = db.tx.update('profiles', [{ id: userId, record: { username, displayName: username } }], { patch: true });
    try { await db.transact([addUsername, updateProfile]); }
    catch {
      const [winner] = await db.get<{ userId: string }>('usernames', [normalized], { consistent: true });
      if (!winner || winner.userId !== userId) return error('That username is already taken. Try another one.', 409);
    }
    const [profile] = await db.get<PublicProfile>('profiles', [userId], { consistent: true });
    return json({ profile: profile || { ...existing, username } }, 201);
  }],
  'POST /api/games': [requireAuth(), requireSafety, async ({ body, user }) => {
    const input = (body || {}) as GameInput;
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const genre = typeof input.genre === 'string' ? input.genre : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    const creationMode = ['html','neo','baseplate'].includes(String(input.creationMode)) ? String(input.creationMode) : 'baseplate';
    const htmlCode = typeof input.htmlCode === 'string' ? input.htmlCode : '';
    const neoPrompt = typeof input.neoPrompt === 'string' ? input.neoPrompt.trim().slice(0,500) : '';
    if (name.length < 3 || name.length > 42) return error('Game name must be between 3 and 42 characters.', 400);
    if (!allowedGenres.has(genre)) return error('Choose a supported game genre.', 400);
    if (description.length > 180) return error('Description must be 180 characters or fewer.', 400);
    if (creationMode !== 'baseplate' && (!htmlCode.trim() || htmlCode.length > (creationMode === 'neo' ? 60000 : 100000))) {
      return error('Add game HTML within the supported size limit before publishing.', 400);
    }
    if (creationMode === 'neo' && !/<body\b/i.test(htmlCode)) return error('Neo game output is incomplete. Generate it again before publishing.', 400);
    const profile = await getOrCreateProfile(user!.userId, user!.name);
    const allowedSceneKinds = new Set(['block','tree','crystal','platform','rock','lamp','door','flower','cloud','flag']);
    const sceneData = Array.isArray(input.sceneData)
      ? input.sceneData.slice(0, 500).flatMap((item: unknown) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
          const candidate = item as Record<string, unknown>;
          const kind = typeof candidate.kind === 'string' ? candidate.kind : '';
          const x = Number(candidate.x);
          const z = Number(candidate.z);
          const color = typeof candidate.color === 'string' ? candidate.color : '';
          if (!allowedSceneKinds.has(kind) || !Number.isFinite(x) || !Number.isFinite(z)
            || Math.abs(x) > 11 || Math.abs(z) > 11 || !/^#[0-9a-fA-F]{6}$/.test(color)) return [];
          return [{ kind, x, z, color }];
        })
      : [];
    if (creationMode === 'baseplate' && sceneData.length === 0) return error('Place at least one valid object before publishing a baseplate world.', 400);
    const game = { name, genre, description, creationMode, htmlCode, neoPrompt, sceneData, creatorName: profile.username || profile.displayName || user!.name || 'Creator', ownerId: user!.userId, status: 'published', plays: 0, createdAt: new Date().toISOString() };
    const [id] = await db.add('games', [game]);
    if (!id) return error('Could not save the game listing. Please try again.', 503);
    const updatedProfile = await syncEarnedTrophies(user!.userId, profile);
    return json({ game: { ...game, id }, profile: updatedProfile }, 201);
  }],
  'POST /api/rewards/idea-starter': [requireAuth(), requireSafety, async ({ user }) => {
    const userId = user!.userId;
    const profile = await getOrCreateProfile(userId, user!.name);
    const claimId = userId + '_ideaStarter';
    const [claim] = await db.get<{ userId: string; reward: number }>('reward_claims', [claimId], { consistent: true });
    if (claim) return json({ claimed: false, profile: { ...profile, trophies: Array.from(new Set([...(profile.trophies || []), 'idea-starter'])) } });
    const addClaim = db.tx.add('reward_claims', [{ id: claimId, userId, reward: 25, claimedAt: new Date().toISOString() }]);
    const updateProfile = db.tx.update('profiles', [{ id: userId, record: { starlits: increment(25), trophies: Array.from(new Set([...(profile.trophies || []), 'idea-starter'])) } }], { patch: true });
    try { await db.transact([addClaim, updateProfile]); }
    catch {
      const [existingClaim] = await db.get<{ userId: string }>('reward_claims', [claimId], { consistent: true });
      if (!existingClaim) return error('Reward could not be claimed. Please try again.', 503);
    }
    const [updated] = await db.get<PublicProfile>('profiles', [userId], { consistent: true });
    return json({ claimed: true, profile: updated || { ...profile, starlits: profile.starlits + 25 } });
  }],
  'GET /api/users/search': [requireAuth(), requireSafety, async ({ query, user }) => {
    const username = usernameFrom(query.username);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return error('Enter a valid username.', 400);
    const [entry] = await db.get<{ userId: string; username: string }>('usernames', [username.toLowerCase()], { consistent: true });
    if (!entry) return json({ found: false, message: 'User not found' });
    const [profile] = await db.get<PublicProfile>('profiles', [entry.userId], { consistent: true });
    if (!profile) return json({ found: false, message: 'User not found' });
    return json({ found: true, user: { userId: profile.userId, username: profile.username, displayName: profile.displayName } });
  }],
  'GET /api/blocks': [requireAuth(), requireSafety, async ({ user }) => {
    const rows = await listRecent<{ id: string; blockerId: string; blockedId: string; blockedUsername: string; createdAt: string }>('user_blocks', 1000);
    return json({ blockedUsers: rows.filter(row => row.blockerId === user!.userId).map(row => ({ userId: row.blockedId, username: row.blockedUsername, createdAt: row.createdAt })) });
  }],
  'POST /api/blocks': [requireAuth(), requireSafety, async ({ body, user }) => {
    const targetId = typeof (body as { userId?: unknown } | null)?.userId === 'string' ? String((body as { userId: string }).userId).slice(0, 120) : '';
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(targetId) || targetId === user!.userId) return error('Choose a valid player to block.', 400);
    const [target] = await db.get<PublicProfile>('profiles', [targetId], { consistent: true });
    if (!target) return error('Player not found.', 404);
    const id = safeId('block_' + user!.userId + '_' + targetId);
    const [existing] = await db.get<{ id: string }>('user_blocks', [id], { consistent: true });
    if (!existing) {
      const [created] = await db.tx.add('user_blocks', [{ id, blockerId: user!.userId, blockedId: targetId, blockedUsername: target.username || target.displayName, createdAt: new Date().toISOString() }]);
      if (!created) return error('Could not block this player. Please retry.', 503);
    }
    await db.delete('friends', [safeId('friend_' + user!.userId + '_' + targetId), safeId('friend_' + targetId + '_' + user!.userId)]);
    const requests = await listRecent<{ id: string; fromUserId: string; toUserId: string; status: string }>('friend_requests', 1000);
    const pendingIds = requests.filter(row => row.status === 'pending' && ((row.fromUserId === user!.userId && row.toUserId === targetId) || (row.fromUserId === targetId && row.toUserId === user!.userId))).map(row => row.id);
    if (pendingIds.length) await db.delete('friend_requests', pendingIds);
    return json({ blocked: true, userId: targetId, username: target.username || target.displayName });
  }],
  'DELETE /api/blocks/:userId': [requireAuth(), requireSafety, async ({ params, user }) => {
    const targetId = String(params.userId || '').slice(0, 120);
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(targetId)) return error('Invalid player id.', 400);
    await db.delete('user_blocks', [safeId('block_' + user!.userId + '_' + targetId)]);
    return json({ unblocked: true, userId: targetId });
  }],
  'POST /api/privacy/deletion-requests': [requireAuth(), async ({ user }) => {
    const id = safeId('privacy_delete_' + user!.userId);
    const [existing] = await db.get<{ status: string }>('privacy_requests', [id], { consistent: true });
    if (existing) return json({ requested: true, alreadyPending: true, message: 'Your account deletion request is already recorded for manual review.' });
    const [created] = await db.tx.add('privacy_requests', [{ id, userId: user!.userId, requestType: 'account_deletion', status: 'open', createdAt: new Date().toISOString() }]);
    if (!created) return error('Your request could not be recorded. Please contact the privacy address in the policy.', 503);
    return json({ requested: true, message: 'Your account deletion request was recorded for manual review. Your account has not been deleted yet.' }, 201);
  }],
  'DELETE /api/admin/content/:type/:id': [requireAuth(), requireDoriaAdmin, async ({ params }) => {
    const type = String(params.type || '');
    const id = String(params.id || '');
    const tables: Record<string, string> = { game: 'games', moment: 'moments', news: 'news_posts', chat: 'chat_messages' };
    if (!tables[type] || !/^[a-zA-Z0-9_-]{1,120}$/.test(id)) return error('Invalid content item.', 400);
    const [removed] = await db.delete(tables[type], [id]);
    if (!removed) return error('Content item not found or already removed.', 404);
    return json({ removed: true, type, id });
  }],
  'GET /api/friends': [requireAuth(), requireSafety, async ({ user }) => {
    const [friendRows, requestRows] = await Promise.all([
      listRecent<{ id: string; userId: string; friendId: string; username: string }>('friends', 500),
      listRecent<{ id: string; fromUserId: string; fromUsername: string; toUserId: string; toUsername: string; status: string; createdAt: string }>('friend_requests', 1000),
    ]);
    const userId = user!.userId;
    const visibleFriends: Array<{ id: string; userId: string; username: string }> = [];
    const incomingRequests: Array<{ id: string; userId: string; username: string; createdAt: string }> = [];
    const outgoingRequests: Array<{ id: string; userId: string; username: string; createdAt: string }> = [];
    for (const row of friendRows.filter(item => item.userId === userId)) {
      if (!(await isBlockedEitherWay(userId, row.friendId))) visibleFriends.push({ id: row.id, userId: row.friendId, username: row.username });
    }
    for (const row of requestRows.filter(item => item.toUserId === userId && item.status === 'pending')) {
      if (!(await isBlockedEitherWay(userId, row.fromUserId))) incomingRequests.push({ id: row.id, userId: row.fromUserId, username: row.fromUsername, createdAt: row.createdAt });
    }
    for (const row of requestRows.filter(item => item.fromUserId === userId && item.status === 'pending')) {
      if (!(await isBlockedEitherWay(userId, row.toUserId))) outgoingRequests.push({ id: row.id, userId: row.toUserId, username: row.toUsername, createdAt: row.createdAt });
    }
    return json({ friends: visibleFriends, incomingRequests, outgoingRequests });
  }],
  'POST /api/friends': [requireAuth(), requireSafety, async ({ body, user }) => {
    const [parentSettings] = await db.get<Record<string, unknown>>('parental_settings', [user!.userId], { consistent: true });
    if (parentSettings?.allowFriendRequests === false) return error('Your guardian has disabled friend requests.', 403);
    const username = usernameFrom((body as { username?: unknown } | null)?.username);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return error('Enter a valid username.', 400);
    const userId = user!.userId;
    const [targetEntry] = await db.get<{ userId: string; username: string }>('usernames', [username.toLowerCase()], { consistent: true });
    if (!targetEntry) return error('User not found', 404);
    if (targetEntry.userId === userId) return error('You cannot add yourself as a friend.', 400);
    const [mine, target] = await Promise.all([
      db.get<PublicProfile>('profiles', [userId], { consistent: true }),
      db.get<PublicProfile>('profiles', [targetEntry.userId], { consistent: true }),
    ]);
    const myProfile = mine[0];
    const targetProfile = target[0];
    if (!myProfile || !targetProfile) return error('User not found', 404);
    if (await isBlockedEitherWay(userId, targetEntry.userId)) return error('This friend request is unavailable because one of these accounts has blocked the other.', 403);
    const mineId = safeId('friend_' + userId + '_' + targetEntry.userId);
    const [already] = await db.get<{ userId: string }>('friends', [mineId], { consistent: true });
    if (already) return json({ added: false, message: 'Already friends', friend: { username: targetProfile.username } });
    const [targetSettings] = await db.get<Record<string, unknown>>('parental_settings', [targetEntry.userId], { consistent: true });
    if (targetSettings?.allowFriendRequests === false) return error('This player is not accepting friend requests.', 403);
    const requestId = safeId('friend_request_' + userId + '_' + targetEntry.userId);
    const [existing] = await db.get<{ status: string }>('friend_requests', [requestId], { consistent: true });
    if (existing?.status === 'pending') return json({ requested: false, message: 'Friend request already pending.' });
    if (existing?.status === 'accepted') return json({ added: false, message: 'Already friends', friend: { username: targetProfile.username } });
    const [reverse] = await db.get<{ status: string }>('friend_requests', [safeId('friend_request_' + targetEntry.userId + '_' + userId)], { consistent: true });
    if (reverse?.status === 'pending') return error('This player has already sent you a request. Accept it in your incoming requests.', 409);
    const request = { id: requestId, fromUserId: userId, fromUsername: myProfile.username || myProfile.displayName, toUserId: targetEntry.userId, toUsername: targetProfile.username || targetProfile.displayName, status: 'pending', createdAt: new Date().toISOString() };
    try {
      await db.tx.add('friend_requests', [request]);
    } catch {
      const [saved] = await db.get<{ status: string }>('friend_requests', [requestId], { consistent: true });
      if (!saved) return error('Friend request could not be sent. Please try again.', 503);
      if (saved.status !== 'pending') return error('This request has already been handled.', 409);
    }
    return json({ requested: true, request: { id: requestId, username: request.toUsername } }, 201);
  }],
  'PUT /api/friend-requests/:id': [requireAuth(), requireSafety, async ({ params, body, user }) => {
    const action = (body as { action?: unknown } | null)?.action;
    if (action !== 'accept' && action !== 'decline') return error('Choose accept or decline.', 400);
    const id = String(params.id || '').slice(0, 120);
    const [request] = await db.get<{ id: string; fromUserId: string; fromUsername: string; toUserId: string; toUsername: string; status: string }>('friend_requests', [id], { consistent: true });
    if (!request || request.toUserId !== user!.userId) return error('Friend request not found.', 404);
    if (request.status !== 'pending') return error('This friend request has already been handled.', 409);
    if (await isBlockedEitherWay(user!.userId, request.fromUserId)) return error('This request cannot be accepted because one account has blocked the other.', 403);
    if (action === 'decline') {
      await db.tx.update('friend_requests', [{ id, record: { status: 'declined', updatedAt: new Date().toISOString() }, if: { status: 'pending', toUserId: user!.userId } }], { patch: true });
      const [updated] = await db.get<{ status: string }>('friend_requests', [id], { consistent: true });
      if (updated?.status !== 'declined') return error('Request could not be declined. Refresh and try again.', 409);
      return json({ declined: true, requestId: id });
    }
    const [sender] = await db.get<PublicProfile>('profiles', [request.fromUserId], { consistent: true });
    const [receiver] = await db.get<PublicProfile>('profiles', [request.toUserId], { consistent: true });
    if (!sender || !receiver) return error('A player profile is no longer available.', 404);
    const senderFriendId = safeId('friend_' + request.fromUserId + '_' + request.toUserId);
    const receiverFriendId = safeId('friend_' + request.toUserId + '_' + request.fromUserId);
    try {
      await db.transact([
        db.tx.update('friend_requests', [{ id, record: { status: 'accepted', updatedAt: new Date().toISOString() }, if: { status: 'pending', toUserId: user!.userId } }], { patch: true }),
        db.tx.add('friends', [{ id: senderFriendId, userId: request.fromUserId, friendId: request.toUserId, username: receiver.username || receiver.displayName, createdAt: new Date().toISOString() }]),
        db.tx.add('friends', [{ id: receiverFriendId, userId: request.toUserId, friendId: request.fromUserId, username: sender.username || sender.displayName, createdAt: new Date().toISOString() }]),
      ]);
    } catch {
      const [current] = await db.get<{ status: string }>('friend_requests', [id], { consistent: true });
      if (current?.status !== 'accepted') return error('Request could not be accepted. Refresh and try again.', 409);
    }
    return json({ accepted: true, friend: { userId: request.fromUserId, username: sender.username || sender.displayName } });
  }],
  'GET /api/ugc': [requireAuth(), requireSafety, async ({ user }) => {
    const [items, ownership, profile] = await Promise.all([
      listRecent<Record<string, unknown>>('ugc_items', 500),
      listRecent<Record<string, unknown>>('owned_ugc', 1000),
      getOrCreateProfile(user!.userId, user!.name),
    ]);
    return json({ items: items.filter(item => item.status !== 'removed'), owned: ownership.filter(row => row.ownerId === user!.userId).map(row => row.itemId), equipped: profile.equippedUgcId || null });
  }],
  'POST /api/ugc': [requireAuth(), requireSafety, async ({ body, user }) => {
    const input = (body || {}) as { name?: unknown; description?: unknown; assetType?: unknown; color?: unknown; price?: unknown; modelData?: unknown };
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    const assetType = String(input.assetType || '');
    const color = String(input.color || '');
    const price = Number(input.price);
    const shapes = new Set(['box','sphere','cone','cylinder','torus','octahedron']);
    const rawParts = Array.isArray(input.modelData) ? input.modelData : [];
    const modelData = rawParts.map((raw: unknown) => {
      const part = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : {};
      return {
        shape: String(part.shape || ''),
        x: Number(part.x), y: Number(part.y), z: Number(part.z),
        sx: Number(part.sx), sy: Number(part.sy), sz: Number(part.sz),
        color: String(part.color || ''), ry: Number(part.ry || 0),
      };
    });
    const validModel = assetType !== 'model' || (
      modelData.length >= 1 && modelData.length <= 24 &&
      modelData.every(part => shapes.has(part.shape) &&
        [part.x,part.y,part.z,part.sx,part.sy,part.sz,part.ry].every(Number.isFinite) &&
        Math.abs(part.x) <= 3 && Math.abs(part.y) <= 3 && Math.abs(part.z) <= 3 &&
        part.sx >= 0.1 && part.sx <= 3 && part.sy >= 0.1 && part.sy <= 3 && part.sz >= 0.1 && part.sz <= 3 &&
        /^#[0-9a-fA-F]{6}$/.test(part.color))
    );
    if (name.length < 3 || name.length > 36 || description.length > 120 || !['halo','crown','visor','wings','model'].includes(assetType) || !/^#[0-9a-fA-F]{6}$/.test(color) || !Number.isInteger(price) || price < 0 || price > 5000 || !validModel) return error('Check your item details and 3D model parts. Models need 1–24 valid parts.', 400);
    const profile = await getOrCreateProfile(user!.userId, user!.name);
    const item = { name, description, assetType, color, price, modelData: assetType === 'model' ? modelData : [], ownerId: user!.userId, creatorName: profile.username || profile.displayName || 'Creator', status: 'approved', createdAt: new Date().toISOString() };
    const [id] = await db.add('ugc_items', [item]);
    if (!id) return error('3D item could not be published.', 503);
    return json({ item: { ...item, id } }, 201);
  }],
  'POST /api/ugc/:id/purchase': [requireAuth(), requireSafety, async ({ params, user }) => {
    const [item] = await db.get<Record<string, unknown>>('ugc_items', [String(params.id || '')], { consistent: true });
    if (!item || item.status === 'removed') return error('Accessory not found.', 404);
    if (item.ownerId === user!.userId) return error('You already own your own creation.', 400);
    const userId = user!.userId;
    const profile = await getOrCreateProfile(userId, user!.name);
    const ownedId = safeId('ugc_' + userId + '_' + String(params.id));
    const [owned] = await db.get<Record<string, unknown>>('owned_ugc', [ownedId], { consistent: true });
    if (owned) return json({ purchased: false, owned: true, item });
    const price = Number(item.price || 0);
    if (profile.starlits < price) return error('Not enough Starlits for this accessory.', 400);
    try {
      await db.transact([
        db.tx.add('owned_ugc', [{ id: ownedId, ownerId: userId, itemId: String(params.id), purchasedAt: new Date().toISOString(), price }]),
        db.tx.update('profiles', [{ id: userId, record: { starlits: increment(-price) }, if: { starlits: profile.starlits } }], { patch: true }),
      ]);
    } catch { return error('Purchase could not be completed. Refresh your balance and retry.', 409); }
    return json({ purchased: true, item: { ...item, id: params.id } });
  }],
  'POST /api/ugc/:id/equip': [requireAuth(), requireSafety, async ({ params, user }) => {
    const ownedId = safeId('ugc_' + user!.userId + '_' + String(params.id || ''));
    const [owned] = await db.get<Record<string, unknown>>('owned_ugc', [ownedId], { consistent: true });
    if (!owned) return error('Buy this accessory before equipping it.', 403);
    const [updated] = await db.tx.update('profiles', [{ id: user!.userId, record: { equippedUgcId: String(params.id), updatedAt: new Date().toISOString() } }], { patch: true });
    if (!updated) return error('Could not equip this accessory.', 503);
    return json({ equipped: String(params.id) });
  }],
  'POST /api/games/:gameId/gamepasses': [requireAuth(), requireSafety, async ({ params, body, user }) => {
    const gameId = String(params.gameId || '');
    const [game] = await db.get<Record<string, unknown>>('games', [gameId], { consistent: true });
    if (!game || game.ownerId !== user!.userId) return error('Only the creator of this game can add gamepasses.', 403);
    const input = (body || {}) as { name?: unknown; detail?: unknown; price?: unknown; effectType?: unknown; effectValue?: unknown };
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const detail = typeof input.detail === 'string' ? input.detail.trim() : '';
    const price = Number(input.price);
    const effectType = String(input.effectType || '');
    const effectValue = Number(input.effectValue || 1);
    if (name.length < 3 || name.length > 36 || detail.length < 8 || detail.length > 140 || !Number.isInteger(price) || price < 5 || price > 5000) return error('Check the gamepass name, description and price.', 400);
    if (!['double_crystals','jump_boost','speed_boost'].includes(effectType) || !Number.isFinite(effectValue) || effectValue < 1 || effectValue > 3) return error('Choose a supported gameplay effect and strength.', 400);
    const pass = { gameId, game: String(game.name || 'Creator game'), ownerId: user!.userId, name, detail, price, effectType, effectValue, createdAt: new Date().toISOString() };
    const [id] = await db.add('gamepasses', [pass]);
    if (!id) return error('Gamepass could not be created.', 503);
    return json({ pass: { ...pass, id } }, 201);
  }],
  'GET /api/gamepasses': [requireAuth(), requireSafety, async ({ user, query }) => {
    const requestedGameId = String(query.gameId || '');
    const requestedGameName = String(query.gameName || '').trim();
    const [game] = requestedGameId ? await db.get<Record<string, unknown>>('games', [requestedGameId], { consistent: true }) : [null];
    const gameName = requestedGameName || String(game?.name || '');
    const rows = await listRecent<Record<string, unknown>>('owned_gamepasses', 1000);
    const custom = await listRecent<Record<string, unknown>>('gamepasses', 500);
    if (requestedGameId) {
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(requestedGameId)) return error('A valid game is required.', 400);
      if (!(await canAccessGameRoom(requestedGameId, user!.userId))) return error('You do not have access to this game.', 403);
    }
    const publicGames = requestedGameId
      ? null
      : await listRecent<Record<string, unknown>>('games', 1000);
    const publicGameIds = publicGames
      ? new Set(publicGames
          .filter(game => ['published', 'approved'].includes(String(game.status || 'published').toLowerCase())
            && game.isPrivate !== true
            && String(game.visibility || 'public').toLowerCase() !== 'private')
          .map(game => String(game.id)))
      : null;
    const catalog = custom.filter(pass =>
      pass.status !== 'removed'
      && (requestedGameId
        ? pass.gameId === requestedGameId
        : Boolean(publicGameIds?.has(String(pass.gameId))))
    );
    const mine = rows.filter(row => row.ownerId === user!.userId && (!requestedGameId || row.gameId === requestedGameId || (!row.gameId && row.game === gameName)));
    const ownedEffects = mine.map(row => {
      const pass = (catalog.find(item => item.id === row.passId) || row) as Record<string, unknown>;
      return { id: row.passId, gameId: row.gameId || pass.gameId || '', game: row.game || pass.game || '', effectType: row.effectType || pass.effectType || '', effectValue: row.effectValue || pass.effectValue || 1 };
    });
    return json({ catalog, owned: mine.map(row => row.passId), ownedEffects });
  }],
  'POST /api/gamepasses/purchase': [requireAuth(), requireSafety, async ({ body, user }) => {
    const input = (body || {}) as { passId?: unknown; gameId?: unknown };
    const passId = typeof input.passId === 'string' ? input.passId : '';
    const gameId = typeof input.gameId === 'string' ? input.gameId : '';
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(passId) || !/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) {
      return error('A valid gamepass and game are required.', 400);
    }
    if (!(await canAccessGameRoom(gameId, user!.userId))) return error('You do not have access to this game.', 403);
    const custom = await listRecent<Record<string, unknown>>('gamepasses', 500);
    const pass = custom.find(item => item.id === passId && item.gameId === gameId && item.status !== 'removed');
    if (!pass) return error('Gamepass not found or no longer available for this game.', 404);
    if (pass.ownerId === user!.userId) return error('Creators cannot purchase their own gamepass.', 400);
    const userId = user!.userId;
    const profile = await getOrCreateProfile(userId, user!.name);
    const ownedId = safeId('pass_' + userId + '_' + pass.id);
    const [owned] = await db.get<{ ownerId: string }>('owned_gamepasses', [ownedId], { consistent: true });
    if (owned) return json({ purchased: false, message: 'Already owned', profile, owned: true });
    if (profile.starlits < Number(pass.price)) return error('Not enough Starlits for this gamepass.', 400);
    try {
      await db.transact([
        db.tx.add('owned_gamepasses', [{ id: ownedId, ownerId: userId, passId: pass.id, game: pass.game, gameId: pass.gameId || '', effectType: pass.effectType || '', effectValue: pass.effectValue || 1, purchasedAt: new Date().toISOString(), price: Number(pass.price) }]),
        db.tx.update('profiles', [{ id: userId, record: { starlits: increment(-Number(pass.price)) }, if: { starlits: profile.starlits } }], { patch: true }),
      ]);
    } catch {
      const [nowOwned] = await db.get<{ ownerId: string }>('owned_gamepasses', [ownedId], { consistent: true });
      if (!nowOwned) return error('Purchase could not be completed. Refresh your balance and try again.', 409);
    }
    const [updated] = await db.get<PublicProfile>('profiles', [userId], { consistent: true });
    return json({ purchased: true, profile: updated || { ...profile, starlits: profile.starlits - Number(pass.price) }, owned: true, pass });
  }],
  'GET /api/badges': [requireAuth(), requireSafety, async ({ user }) => {
    const [custom, earned, profile] = await Promise.all([
      listRecent<Record<string, unknown>>('badge_definitions', 250),
      listRecent<Record<string, unknown>>('earned_badges', 1000),
      getOrCreateProfile(user!.userId, user!.name),
    ]);
    const visible = custom.filter(item => item.status !== 'removed');
    const imagePaths = visible.filter(item => typeof item.imagePath === 'string').map(item => String(item.imagePath));
    const signed = imagePaths.length ? await storage.url(imagePaths) : [];
    const urlByPath = new Map(signed.map(item => [item.path, item.url]));
    return json({
      custom: visible.map(item => ({ ...item, imageUrl: item.imagePath ? (urlByPath.get(String(item.imagePath)) || '') : '' })),
      earnedIds: [...(Array.isArray(profile.trophies) ? profile.trophies : []), ...earned.filter(item => item.ownerId === user!.userId).map(item => String(item.badgeId))],
    });
  }],
  'POST /api/badges': [requireAuth(), requireSafety, async ({ body, user }) => {
    const input = (body || {}) as { name?: unknown; description?: unknown; gameId?: unknown; artStyle?: unknown; imageBase64?: unknown };
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    const gameId = typeof input.gameId === 'string' ? input.gameId.trim() : '';
    const artStyle = String(input.artStyle || 'creator');
    const styles = new Set(['starter','creator','spark','community','currency','game','style','collection','special']);
    if (name.length < 3 || name.length > 40 || description.length > 160 || !styles.has(artStyle)) return error('Check the badge name, description and artwork style.', 400);
    if (gameId) {
      const [game] = await db.get<Record<string, unknown>>('games', [gameId], { consistent: true });
      if (!game || game.ownerId !== user!.userId) return error('Only the creator of this game can create its badge.', 403);
    }
    let imagePath = '';
    if (input.imageBase64 !== undefined) {
      const imageBase64 = typeof input.imageBase64 === 'string' ? input.imageBase64 : '';
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(imageBase64);
      if (!match || match[2].length > 2800000) return error('Badge image must be PNG, JPG or WebP and no larger than 2 MB.', 400);
      const extension = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg';
      imagePath = 'badges/' + user!.userId + '/' + randomBytes(12).toString('hex') + '.' + extension;
      const [saved] = await storage.write([{ path: imagePath, content: match[2], contentType: match[1] }]);
      if (!saved) return error('Badge image upload failed. Please retry.', 503);
    }
    const profile = await getOrCreateProfile(user!.userId, user!.name);
    const badge = { name, description, gameId, artStyle, imagePath, creatorId: user!.userId, creatorName: profile.username || profile.displayName || 'Creator', status: 'published', createdAt: new Date().toISOString() };
    const [id] = await db.add('badge_definitions', [badge]);
    if (!id) {
      if (imagePath) await storage.delete([imagePath]);
      return error('Badge could not be published.', 503);
    }
    const imageUrl = imagePath ? (await storage.url([imagePath]))[0]?.url || '' : '';
    return json({ badge: { ...badge, id, imageUrl } }, 201);
  }],
  'POST /api/games/:gameId/play': [requireAuth(), async ({ params, user }) => {
    const gameId = String(params.gameId || '');
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) return error('A valid game is required.', 400);
    if (!(await canAccessGameRoom(gameId, user!.userId))) return error('Published game not found.', 404);

    const day = new Date().toISOString().slice(0, 10);
    const dailyPlayId = safeId('daily_play_' + user!.userId + '_' + gameId + '_' + day);
    const [existingPlay] = await db.get<Record<string, unknown>>('game_play_receipts', [dailyPlayId], { consistent: true });
    let counted = false;

    if (!existingPlay) {
      try {
        await db.transact([
          db.tx.add('game_play_receipts', [{
            id: dailyPlayId,
            userId: user!.userId,
            gameId,
            day,
            playedAt: new Date().toISOString(),
          }]),
          db.tx.update('games', [{
            id: gameId,
            record: { plays: increment(1) },
          }], { patch: true }),
        ]);
        counted = true;
      } catch {
        const [receipt] = await db.get<Record<string, unknown>>('game_play_receipts', [dailyPlayId], { consistent: true });
        if (!receipt) return error('Your play could not be recorded. Please retry.', 503);
      }
    }

    const sessionId = randomBytes(16).toString('hex');
    const [session] = await db.add('game_play_sessions', [{
      id: sessionId,
      userId: user!.userId,
      gameId,
      status: 'active',
      startedAt: new Date().toISOString(),
    }]);
    if (!session) return error('A game session could not be started.', 503);

    const [updatedGame] = await db.get<Record<string, unknown>>('games', [gameId], { consistent: true });
    return json({
      sessionId,
      counted,
      plays: Number(updatedGame?.plays || 0),
    }, 201);
  }],
  'POST /api/games/:gameId/complete': [requireAuth(), requireSafety, async ({ params, body, user }) => {
    const gameId = String(params.gameId || '');
    const input = (body || {}) as { score?: unknown; sessionId?: unknown };
    const score = Number(input.score || 0);
    const sessionId = typeof input.sessionId === 'string' ? input.sessionId : '';
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId) || !/^[a-f0-9]{32}$/.test(sessionId)
      || !Number.isFinite(score) || score < 10 || score > 100000) {
      return error('A valid game session and completed score are required.', 400);
    }
    const [game] = await db.get<Record<string, unknown>>('games', [gameId], { consistent: true });
    if (!game || !['published', 'approved'].includes(String(game.status || 'published').toLowerCase())
      || !(await canAccessGameRoom(gameId, user!.userId))) return error('Published game not found.', 404);

    const [session] = await db.get<Record<string, unknown>>('game_play_sessions', [sessionId], { consistent: true });
    if (!session || session.userId !== user!.userId || session.gameId !== gameId) {
      return error('This game session does not belong to your account.', 403);
    }
    const elapsed = Date.now() - Date.parse(String(session.startedAt || ''));
    if (!Number.isFinite(elapsed) || elapsed < 5000 || elapsed > 4 * 60 * 60 * 1000) {
      return error('Play this world before submitting a completion.', 400);
    }
    if (session.status !== 'active') return error('This play session has already been completed.', 409);

    const completionId = safeId('complete_' + user!.userId + '_' + gameId);
    const [existing] = await db.get<Record<string, unknown>>('game_completion_receipts', [completionId], { consistent: true });
    if (existing) return json({ completed: true, alreadyCompleted: true, earned: [] });
    const definitions = (await listRecent<Record<string, unknown>>('badge_definitions', 250)).filter(item => item.status === 'published' && item.gameId === gameId);
    const badgeIds = definitions.map(item => safeId('earned_' + user!.userId + '_' + String(item.id)));
    const current = badgeIds.length ? await db.get<Record<string, unknown>>('earned_badges', badgeIds, { consistent: true }) : [];
    const earnedNow = definitions.filter((_, index) => !current[index]);
    const completedAt = new Date().toISOString();
    const writes = [
      db.tx.update('game_play_sessions', [{
        id: sessionId,
        record: { status: 'completed', completedAt },
        if: { userId: user!.userId, gameId, status: 'active' },
      }], { patch: true }),
      db.tx.add('game_completion_receipts', [{ id: completionId, userId: user!.userId, gameId, score, completedAt }]),
      ...earnedNow.map(item => db.tx.add('earned_badges', [{ id: safeId('earned_' + user!.userId + '_' + String(item.id)), ownerId: user!.userId, badgeId: String(item.id), gameId, earnedAt: new Date().toISOString() }])),
    ];
    try { await db.transact(writes); }
    catch {
      const [receipt] = await db.get<Record<string, unknown>>('game_completion_receipts', [completionId], { consistent: true });
      if (!receipt) return error('Game completion could not be recorded. Please retry.', 409);
    }
    return json({ completed: true, earned: earnedNow.map(item => ({ id: item.id, name: item.name })) });
  }],
  'GET /api/moments': [requireAuth(), requireSafety, async ({ user }) => {
    const rows = await listRecent<{ id: string; ownerId: string; username: string; caption: string; videoUrl?: string; videoPath?: string; createdAt: string }>('moments', 100);
    const allowed = [];
    for (const row of rows) {
      if ((row.videoPath || row.videoUrl) && row.caption !== undefined && (row.ownerId === user!.userId || !(await isBlockedEitherWay(user!.userId, row.ownerId)))) allowed.push(row);
    }
    const paths = allowed.filter(row => row.videoPath).map(row => row.videoPath as string);
    const signed = paths.length ? await storage.url(paths) : [];
    const urlByPath = new Map(signed.map(item => [item.path, item.url]));
    const moments = allowed.map(row => ({ ...row, videoUrl: row.videoPath ? (urlByPath.get(row.videoPath) || '') : (row.videoUrl || '') })).filter(row => Boolean(row.videoUrl));
    return json({ moments });
  }],
  'POST /api/moments': [requireAuth(), requireSafety, async ({ body, user }) => {
    const [parentSettings] = await db.get<Record<string, unknown>>('parental_settings', [user!.userId], { consistent: true });
    if (parentSettings?.allowMoments === false) return error('Your guardian has disabled Doria Moments posting.', 403);
    const input = (body || {}) as { videoBase64?: unknown; contentType?: unknown; caption?: unknown };
    const videoBase64 = typeof input.videoBase64 === 'string' ? input.videoBase64 : '';
    const contentType = typeof input.contentType === 'string' ? input.contentType : '';
    const caption = typeof input.caption === 'string' ? input.caption.trim() : '';
    const allowedTypes: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv' };
    if (!allowedTypes[contentType]) return error('Upload an MP4, WebM or OGG video file.', 400);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(videoBase64)) return error('The selected video file could not be read. Please choose it again.', 400);
    const estimatedBytes = Math.floor(videoBase64.length * 3 / 4);
    if (!videoBase64 || estimatedBytes > 7 * 1024 * 1024) return error('Videos must be 7 MB or smaller.', 413);
    if (caption.length > 180) return error('Caption must be 180 characters or fewer.', 400);
    const profile = await getOrCreateProfile(user!.userId, user!.name);
    const videoPath = `moments/${user!.userId}/${randomBytes(16).toString('hex')}.${allowedTypes[contentType]}`;
    const [uploaded] = await storage.write([{ path: videoPath, content: videoBase64, contentType }]);
    if (!uploaded) return error('Video upload failed. Please try again.', 503);
    try {
      const [stored] = await db.add('moments', { ownerId: user!.userId, username: profile.username || profile.displayName, caption, videoPath, createdAt: new Date().toISOString() });
      if (!stored) throw new Error('Moment record could not be saved.');
      const [signed] = await storage.url([videoPath]);
      if (!signed?.url) throw new Error('Video preview URL could not be created.');
      const moment = { id: stored, ownerId: user!.userId, username: profile.username || profile.displayName, caption, videoUrl: signed.url, createdAt: new Date().toISOString() };
      return json({ moment }, 201);
    } catch (cause) {
      await storage.delete([videoPath]);
      console.error('Moment upload could not be saved', cause);
      return error('Video Moment could not be published. Please try again.', 503);
    }
  }],
  'GET /api/news': [requireAuth(), requireSafety, async ({ user }) => {
    const rows = await listRecent<{ id: string; ownerId: string; username: string; text: string; attachments?: Array<{name:string;type:string;dataUrl:string}>; createdAt: string }>('news_posts', 100);
    const visible = [];
    for (const row of rows) {
      if (typeof row.text === 'string' && (row.ownerId === user!.userId || !(await isBlockedEitherWay(user!.userId, row.ownerId)))) visible.push(row);
    }
    return json({ posts: visible });
  }],
  'POST /api/news': [requireAuth(), requireSafety, async ({ body, user }) => {
    const input=(body||{}) as {text?:unknown;attachments?:unknown};
    const text=typeof input.text==='string'?input.text.trim():'';
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain']);
    const attachments = Array.isArray(input.attachments)
      ? input.attachments.filter((item: unknown): item is { name: string; type: string; dataUrl: string } => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
          const file = item as Record<string, unknown>;
          return typeof file.name === 'string' && file.name.length <= 100
            && typeof file.type === 'string' && allowedTypes.has(file.type)
            && typeof file.dataUrl === 'string' && file.dataUrl.length <= 70000
            && file.dataUrl.startsWith('data:' + file.type + ';base64,');
        }).slice(0, 2)
      : [];
    const attachmentBytes = attachments.reduce((sum, item) => sum + item.dataUrl.length, 0);
    if (text.length > 500 || (!text && attachments.length === 0) || attachmentBytes > 140000) return error('Add text or up to two small supported attachments (140 KB total).', 400);
    const profile = await getOrCreateProfile(user!.userId, user!.name);
    const post = { ownerId: user!.userId, username: profile.username || profile.displayName, text, attachments, createdAt: new Date().toISOString() };
    const [id] = await db.add('news_posts', [post]);
    if (!id) return error('Could not publish the news post.', 503);
    return json({ post: { ...post, id } }, 201);
  }],
  'GET /api/tasks': [requireAuth(), requireSafety, async ({ user }) => {
    const day = new Date().toISOString().slice(0, 10);
    const definitions = [
      { id: 'daily-checkin', title: 'Daily explorer', detail: 'Open your Doria universe and claim today’s check-in reward.', reward: 10, kind: 'daily' },
      { id: 'like-a-world', title: 'Show a creator some love', detail: 'Like at least one community game today.', reward: 15, kind: 'like' },
      { id: 'publish-a-world', title: 'World maker', detail: 'Publish a game or 3D world to Doria.', reward: 40, kind: 'publish' },
      { id: 'design-ugc', title: 'Wearable designer', detail: 'Create an avatar accessory for the marketplace.', reward: 30, kind: 'ugc' },
    ];
    const [claims, likes, games, ugc] = await Promise.all([
      listRecent<Record<string, unknown>>('task_reward_claims', 2000),
      listRecent<Record<string, unknown>>('game_likes', 2000),
      listRecent<Record<string, unknown>>('games', 1000),
      listRecent<Record<string, unknown>>('ugc_items', 1000),
    ]);
    const tasks = definitions.map(task => {
      const claimId = safeId('task_' + user!.userId + '_' + task.id + '_' + day);
      const completed = claims.some(row => row.id === claimId);
      const canClaim = task.kind === 'daily' || (task.kind === 'like' && likes.some(row => row.userId === user!.userId || row.ownerId === user!.userId)) || (task.kind === 'publish' && games.some(row => row.ownerId === user!.userId)) || (task.kind === 'ugc' && ugc.some(row => row.ownerId === user!.userId));
      return { id: task.id, title: task.title, detail: task.detail, reward: task.reward, completed, canClaim: canClaim && !completed };
    });
    return json({ tasks });
  }],
  'POST /api/tasks/:id/claim': [requireAuth(), requireSafety, async ({ params, user }) => {
    const definitions: Record<string, { reward: number; kind: string }> = { 'daily-checkin': { reward: 10, kind: 'daily' }, 'like-a-world': { reward: 15, kind: 'like' }, 'publish-a-world': { reward: 40, kind: 'publish' }, 'design-ugc': { reward: 30, kind: 'ugc' } };
    const task = definitions[String(params.id || '')];
    if (!task) return error('Quest not found.', 404);
    const userId = user!.userId;
    const day = new Date().toISOString().slice(0, 10);
    const claimId = safeId('task_' + userId + '_' + String(params.id) + '_' + day);
    const [existing] = await db.get<Record<string, unknown>>('task_reward_claims', [claimId], { consistent: true });
    if (existing) return json({ claimed: false, reward: task.reward, profile: await getOrCreateProfile(userId, user!.name) });
    let eligible = task.kind === 'daily';
    if (task.kind === 'like') { const likes = await listRecent<Record<string, unknown>>('game_likes', 2000); eligible = likes.some(row => row.userId === userId || row.ownerId === userId); }
    if (task.kind === 'publish') { const games = await listRecent<Record<string, unknown>>('games', 1000); eligible = games.some(row => row.ownerId === userId); }
    if (task.kind === 'ugc') { const ugc = await listRecent<Record<string, unknown>>('ugc_items', 1000); eligible = ugc.some(row => row.ownerId === userId); }
    if (!eligible) return error('Complete the activity before claiming this reward.', 403);
    const profile = await getOrCreateProfile(userId, user!.name);
    try {
      await db.transact([
        db.tx.add('task_reward_claims', [{ id: claimId, userId, taskId: String(params.id), reward: task.reward, day, claimedAt: new Date().toISOString() }]),
        db.tx.update('profiles', [{ id: userId, record: { starlits: increment(task.reward) }, if: { starlits: profile.starlits } }], { patch: true }),
      ]);
    } catch { return error('Reward could not be claimed. Refresh your balance and try again.', 409); }
    const [updated] = await db.get<PublicProfile>('profiles', [userId], { consistent: true });
    return json({ claimed: true, reward: task.reward, profile: updated || { ...profile, starlits: profile.starlits + task.reward } });
  }],
  'GET /api/multiplayer/:gameId': [requireAuth(), requireMultiplayerSafety, async ({ params, user }) => {
    const gameId = String(params.gameId || '');
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) return error('A valid game room is required.', 400);
    if (!(await canAccessGameRoom(gameId, user!.userId))) return error('You do not have access to this game room.', 403);
    const rows = await listRecent<Record<string, unknown>>('game_players', 500);
    const cutoff = Date.now() - 20000;
    const visibleRows = [];
    for (const row of rows.filter(item => item.gameId === gameId && item.status !== 'offline' && Date.parse(String(item.updatedAt || '')) >= cutoff)) {
      if (!(await isBlockedEitherWay(user!.userId, String(row.userId || '')))) visibleRows.push(row);
    }
    const players = visibleRows.map(row => ({
        userId: String(row.userId || ''),
        username: String(row.username || 'Player').slice(0, 24),
        lane: Number(row.lane || 0),
        distance: Number(row.distance || 0),
        jump: Number(row.jump || 0),
        score: Number(row.score || 0),
        status: String(row.status || 'lobby'),
        updatedAt: String(row.updatedAt || ''),
        isSelf: row.userId === user!.userId,
      }));
    return json({ gameId, players });
  }],
  'POST /api/multiplayer/:gameId/join': [requireAuth(), requireMultiplayerSafety, async ({ params, user }) => {
    const gameId = String(params.gameId || '');
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) return error('A valid game room is required.', 400);
    if (!(await canAccessGameRoom(gameId, user!.userId))) return error('You do not have access to this game room.', 403);
    const profile = await getOrCreateProfile(user!.userId, user!.name);
    const id = safeId('mp_' + gameId + '_' + user!.userId);
    const updatedAt = new Date().toISOString();
    const player = {
      id, gameId, userId: user!.userId,
      username: String(profile.username || profile.displayName || 'Player').slice(0, 24),
      lane: 0, distance: 0, jump: 0, score: 0,
      status: 'lobby', updatedAt,
    };
    const [existing] = await db.get<Record<string, unknown>>('game_players', [id], { consistent: true });
    if (existing) {
      const [ok] = await db.tx.update('game_players', [{
        id,
        record: { username: player.username, lane: 0, distance: 0, jump: 0, score: 0, status: 'lobby', updatedAt },
        if: { userId: user!.userId, gameId },
      }], { patch: true });
      if (!ok) return error('Could not rejoin this game room. Please retry.', 409);
    } else {
      const [created] = await db.tx.add('game_players', [player]);
      if (!created) return error('Could not join this game room. Please retry.', 503);
    }
    const publicPlayer = { userId: player.userId, username: player.username, lane: 0, distance: 0, jump: 0, score: 0, status: 'lobby', updatedAt };
    await notifySubscribers('game', gameId, { type: 'player.state', player: publicPlayer });
    return json({ joined: true, player: publicPlayer }, 201);
  }],
  'POST /api/multiplayer/:gameId/state': [requireAuth(), requireMultiplayerSafety, async ({ params, body, user }) => {
    const gameId = String(params.gameId || '');
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) return error('A valid game room is required.', 400);
    if (!(await canAccessGameRoom(gameId, user!.userId))) return error('You do not have access to this game room.', 403);
    const input = (body || {}) as { lane?: unknown; distance?: unknown; jump?: unknown; score?: unknown; status?: unknown };
    const lane = Number(input.lane);
    const distance = Number(input.distance);
    const jump = Number(input.jump);
    const score = Number(input.score);
    const status = String(input.status || '');
    if (![lane, distance, jump, score].every(Number.isFinite) || lane < -1 || lane > 1 || distance < 0 || distance > 1000000 || jump < 0 || jump > 4 || score < 0 || score > 10 || !['lobby', 'playing', 'finished'].includes(status)) {
      return error('Invalid multiplayer player state.', 400);
    }
    const id = safeId('mp_' + gameId + '_' + user!.userId);
    const [previous] = await db.get<{ distance: number; score: number; status: string }>('game_players', [id], { consistent: true });
    if (!previous) return error('Join this game room before sending player updates.', 409);
    if (distance < Number(previous.distance || 0) || distance - Number(previous.distance || 0) > 100 || score < Number(previous.score || 0) || score - Number(previous.score || 0) > 2) {
      return error('Player state changed too quickly. Please retry with a valid game update.', 400);
    }
    const updatedAt = new Date().toISOString();
    const [ok] = await db.tx.update('game_players', [{
      id,
      record: { lane, distance, jump, score, status, updatedAt },
      if: { userId: user!.userId, gameId },
    }], { patch: true });
    if (!ok) return error('Join this game room before sending player updates.', 409);
    const [saved] = await db.get<Record<string, unknown>>('game_players', [id], { consistent: true });
    const publicPlayer = {
      userId: user!.userId,
      username: String(saved?.username || 'Player').slice(0, 24),
      lane, distance, jump, score, status, updatedAt,
    };
    await notifySubscribers('game', gameId, { type: 'player.state', player: publicPlayer });
    return json({ updated: true, player: publicPlayer });
  }],
  'POST /api/multiplayer/:gameId/leave': [requireAuth(), requireMultiplayerSafety, async ({ params, user }) => {
    const gameId = String(params.gameId || '');
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) return error('A valid game room is required.', 400);
    const id = safeId('mp_' + gameId + '_' + user!.userId);
    const updatedAt = new Date().toISOString();
    const [ok] = await db.tx.update('game_players', [{
      id,
      record: { status: 'offline', updatedAt },
      if: { userId: user!.userId, gameId },
    }], { patch: true });
    if (ok) await notifySubscribers('game', gameId, { type: 'player.left', userId: user!.userId, updatedAt });
    return json({ left: true });
  }],
  'GET /api/chat': [requireAuth(), requireSafety, async ({ query, user }) => {
    const [parentSettings] = await db.get<Record<string, unknown>>('parental_settings', [user!.userId], { consistent: true });
    if (parentSettings?.allowChat !== true) return error('Game chat is disabled by your guardian.', 403);
    const gameId = typeof query.gameId === 'string' ? query.gameId : '';
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) return error('A valid game room is required.', 404);
    if (!(await canAccessGameRoom(gameId, user!.userId))) return error('You do not have access to this game chat.', 403);
    const rows = await listRecent<{ id: string; gameId: string; ownerId: string; username: string; text: string; createdAt: string }>('chat_messages', 300);
    const visible = [];
    for (const row of rows.filter(item => item.gameId === gameId)) {
      if (!(await isBlockedEitherWay(user!.userId, row.ownerId))) visible.push(row);
    }
    return json({ messages: visible.slice(-60) });
  }],
  'POST /api/reports': [requireAuth(), requireSafety, async ({ body, user }) => {
    const input = (body || {}) as { targetType?: unknown; targetId?: unknown; reason?: unknown; details?: unknown };
    const targetType = String(input.targetType || '');
    const targetId = typeof input.targetId === 'string' ? input.targetId.trim() : '';
    const reason = String(input.reason || '');
    const details = typeof input.details === 'string' ? input.details.trim().slice(0, 500) : '';
    if (!['game', 'user', 'moment', 'news', 'chat'].includes(targetType) || !/^[a-zA-Z0-9_-]{1,120}$/.test(targetId) || !['bullying', 'inappropriate', 'spam', 'privacy', 'other'].includes(reason)) return error('Choose a valid item and report reason.', 400);
    const recentReports = await listRecent<{ reporterId: string; targetType: string; targetId: string; createdAt: string; status: string }>('content_reports', 1000);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    if (recentReports.filter(row => row.reporterId === user!.userId && Date.parse(row.createdAt) >= since && row.status === 'open').length >= 10) return error('You have reached the daily report limit. Try again later.', 429);
    if (recentReports.some(row => row.reporterId === user!.userId && row.targetType === targetType && row.targetId === targetId && row.status === 'open')) return error('You already have an open report for this item.', 409);
    const [id] = await db.add('content_reports', [{ reporterId: user!.userId, targetType, targetId, reason, details, status: 'open', createdAt: new Date().toISOString() }]);
    if (!id) return error('Report could not be submitted.', 503);
    return json({ submitted: true, reportId: id }, 201);
  }],
  'POST /api/chat': [requireAuth(), requireSafety, async ({ body, user }) => {
    const [parentSettings] = await db.get<Record<string, unknown>>('parental_settings', [user!.userId], { consistent: true });
    if (parentSettings?.allowChat !== true) return error('Game chat is disabled by your guardian.', 403);
    const input = (body || {}) as { gameId?: unknown; text?: unknown };
    const gameId = typeof input.gameId === 'string' ? input.gameId : '';
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) return error('A valid game room is required.', 404);
    if (!(await canAccessGameRoom(gameId, user!.userId))) return error('You do not have access to this game chat.', 403);
    if (text.length < 1 || text.length > 240) return error('Chat message must be 1–240 characters.', 400);
    const profile = await getOrCreateProfile(user!.userId, user!.name);
    const message = { gameId, ownerId: user!.userId, username: profile.username || profile.displayName, text, createdAt: new Date().toISOString() };
    const [id] = await db.add('chat_messages', [message]);
    if (!id) return error('Message could not be sent.', 503);
    const saved = { ...message, id };
    await notifySubscribers('chat', gameId, saved);
    return json({ message: saved }, 201);
  }],
  'POST /api/parental/invitations': [requireAuth(), async ({ body, user }) => {
    const email = typeof (body as { email?: unknown } | null)?.email === 'string'
      ? String((body as { email: string }).email).trim().toLowerCase()
      : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return error('Enter a valid guardian email address.', 400);
    if (email === String(user!.email || '').trim().toLowerCase()) return error('A player cannot invite their own account as guardian.', 400);
    const tokenId = randomBytes(16).toString('hex');
    const token = tokenId + '.' + randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const record = {
      id: tokenId, childUserId: user!.userId, guardianEmail: email,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      status: 'pending', createdAt: new Date().toISOString(), expiresAt,
    };
    const [id] = await db.tx.add('parental_invites', [record]);
    if (!id) return error('Could not create the guardian invitation. Please try again.', 503);
    return json({ token, guardianEmail: email, expiresAt }, 201);
  }],
  'POST /api/parental/invitations/accept': [requireAuth(), async ({ body, user }) => {
    const token = typeof (body as { token?: unknown } | null)?.token === 'string' ? String((body as { token: string }).token) : '';
    const [tokenId, secret] = token.split('.');
    if (!/^[a-f0-9]{32}$/.test(tokenId || '') || !/^[a-f0-9]{64}$/.test(secret || '')) return error('This guardian invitation link is invalid.', 400);
    const [invite] = await db.get<Record<string, unknown>>('parental_invites', [tokenId], { consistent: true });
    if (!invite || invite.status !== 'pending' || String(invite.expiresAt) < new Date().toISOString()) return error('This guardian invitation has expired or was already used.', 410);
    const email = String(user!.email || '').trim().toLowerCase();
    if (!email || email !== String(invite.guardianEmail).toLowerCase()) return error('Sign in with the exact email address this invitation was sent to.', 403);
    const expected = String(invite.tokenHash || '');
    if (createHash('sha256').update(token).digest('hex') !== expected) return error('This guardian invitation link is invalid.', 400);
    const childUserId = String(invite.childUserId || '');
    if (!childUserId || childUserId === user!.userId) return error('This guardian relationship cannot be created.', 400);
    const [settings] = await db.get<Record<string, unknown>>('parental_settings', [childUserId], { consistent: true });
    if (settings?.guardianUserId && settings.guardianUserId !== user!.userId) return error('This player already has a linked guardian. Contact Doria support if this is incorrect.', 409);
    const settingsWrite = settings
      ? db.tx.update('parental_settings', [{
          id: childUserId,
          record: { guardianUserId: user!.userId, updatedAt: new Date().toISOString() },
          if: { guardianUserId: settings.guardianUserId },
        }], { patch: true })
      : db.tx.add('parental_settings', [{
          id: childUserId, childUserId, guardianUserId: user!.userId,
          allowFriendRequests: true, allowMoments: true, allowChat: false, dailyLimit: 90,
          updatedAt: new Date().toISOString(),
        }]);
    const inviteWrite = db.tx.update('parental_invites', [{
      id: tokenId,
      record: { status: 'accepted', acceptedAt: new Date().toISOString(), guardianUserId: user!.userId },
      if: { status: 'pending', tokenHash: expected },
    }], { patch: true });
    try {
      await db.transact([settingsWrite, inviteWrite]);
    } catch {
      return error('The invitation was already used or the guardian link changed. Refresh and try again.', 409);
    }
    return json({ accepted: true, childUserId });
  }],
  'GET /api/parental/status': [requireAuth(), async ({ user }) => {
    const [settings] = await db.get<Record<string, unknown>>('parental_settings', [user!.userId], { consistent: true });
    return json({
      linked: Boolean(settings?.guardianUserId),
      settings: {
        allowFriendRequests: settings?.allowFriendRequests !== false,
        allowMoments: settings?.allowMoments !== false,
        allowChat: settings?.allowChat === true,
        dailyLimit: Number(settings?.dailyLimit || 90),
      },
    });
  }],
  'GET /api/parental/guardian/children': [requireAuth(), async ({ user }) => {
    const result = await db.list<Record<string, unknown>>('parental_settings', { limit: 100 });
    const linked = result.items.filter(item => item.guardianUserId === user!.userId);
    const children = await Promise.all(linked.map(async item => {
      const [safety] = await db.get<{ status: string; supervisedAccess?: boolean }>('safety_profiles', [String(item.childUserId)], { consistent: true });
      return {
        childUserId: item.childUserId,
        allowFriendRequests: item.allowFriendRequests !== false,
        allowMoments: item.allowMoments !== false,
        allowChat: item.allowChat === true,
        dailyLimit: Number(item.dailyLimit || 90),
        multiplayerEnabled: safety?.status === 'active' && safety.supervisedAccess === true,
        updatedAt: item.updatedAt || null,
      };
    }));
    return json({ children });
  }],
  'PUT /api/parental/children/:childId/multiplayer': [requireAuth(), async ({ params, body, user }) => {
    const childId = String(params.childId || '');
    const enabled = (body as { enabled?: unknown } | null)?.enabled;
    if (typeof enabled !== 'boolean') return error('Choose whether supervised multiplayer is enabled.', 400);
    const [settings] = await db.get<Record<string, unknown>>('parental_settings', [childId], { consistent: true });
    if (!settings || settings.guardianUserId !== user!.userId) return error('Only the linked guardian can change this multiplayer setting.', 403);
    const [existing] = await db.get<Record<string, unknown>>('safety_profiles', [childId], { consistent: true });
    const record = { status: enabled ? 'active' : 'disabled', supervisedAccess: enabled, approvedByGuardian: user!.userId, updatedAt: new Date().toISOString() };
    const result = existing
      ? await db.tx.update('safety_profiles', [{ id: childId, record }], { patch: true })
      : await db.tx.add('safety_profiles', [{ id: childId, userId: childId, ...record }]);
    if (!result[0]) return error('Could not update supervised multiplayer access. Refresh and retry.', 409);
    return json({ enabled, supervisedAccess: enabled });
  }],
  'PUT /api/parental/children/:childId/settings': [requireAuth(), async ({ params, body, user }) => {
    const childId = String(params.childId || '');
    const [settings] = await db.get<Record<string, unknown>>('parental_settings', [childId], { consistent: true });
    if (!settings || settings.guardianUserId !== user!.userId) return error('Only the linked guardian can change these controls.', 403);
    const input = (body || {}) as { allowFriendRequests?: unknown; allowMoments?: unknown; allowChat?: unknown; dailyLimit?: unknown };
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const key of ['allowFriendRequests', 'allowMoments', 'allowChat'] as const) {
      if (input[key] !== undefined) {
        if (typeof input[key] !== 'boolean') return error('Safety switches must be true or false.', 400);
        patch[key] = input[key];
      }
    }
    if (input.dailyLimit !== undefined) {
      if (![30, 60, 90, 120].includes(Number(input.dailyLimit))) return error('Choose a supported daily reminder limit.', 400);
      patch.dailyLimit = Number(input.dailyLimit);
    }
    const [updated] = await db.tx.update('parental_settings', [{ id: childId, record: patch }], { patch: true });
    if (!updated) return error('Could not save parental settings. Refresh and retry.', 503);
    return json({ saved: true, settings: { ...settings, ...patch } });
  }],
});
