import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { aiUsage, games, profiles, rewardClaims, type AvatarLookJson } from '../db/schema.js';
import { ensureSafetyProfile, safeId } from '../auth/guards.js';

export type PublicProfile = {
  userId: string;
  username?: string;
  displayName: string;
  starlits: number;
  trophies: string[];
  bio?: string;
  plusActive?: boolean;
  equippedUgcId?: string;
  avatarLook?: AvatarLookJson;
  createdAt?: string;
};

export const DEFAULT_AVATAR_LOOK: AvatarLookJson = {
  body: '#9b7bff',
  accent: '#7cebe5',
  style: 'classic',
};

export const AVATAR_BODY_COLORS = new Set([
  '#9b7bff',
  '#ff7db7',
  '#55d6be',
  '#f4c000',
  '#69a8ff',
  '#f0f0f7',
]);

export const AVATAR_ACCENT_COLORS = new Set([
  '#7cebe5',
  '#ffe37b',
  '#ff8ed5',
  '#a6f2a6',
  '#ffffff',
]);

export const ALLOWED_GENRES = new Set([
  'Adventure',
  'Obby',
  'Roleplay',
  'Simulator',
  'Racing',
  'Puzzle',
  'Social',
]);

function mapProfileRow(row: typeof profiles.$inferSelect): PublicProfile {
  return {
    userId: row.userId,
    username: row.username || undefined,
    displayName: row.displayName,
    starlits: row.starlits,
    trophies: Array.isArray(row.trophies) ? row.trophies : ['first-steps'],
    bio: row.bio || '',
    plusActive: row.plusActive === true,
    equippedUgcId: row.equippedUgcId || undefined,
    avatarLook: row.avatarLook || DEFAULT_AVATAR_LOOK,
    createdAt: row.createdAt ? row.createdAt.toISOString() : undefined,
  };
}

export async function getOrCreateProfile(userId: string, name?: string): Promise<PublicProfile> {
  const [existing] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (existing) {
    await ensureSafetyProfile(userId);
    return mapProfileRow(existing);
  }

  const displayName = (name || 'Creator').slice(0, 48);
  await db
    .insert(profiles)
    .values({
      userId,
      displayName,
      starlits: 250,
      trophies: ['first-steps'],
      avatarLook: DEFAULT_AVATAR_LOOK,
    })
    .onConflictDoNothing();

  await ensureSafetyProfile(userId);
  const [created] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (created) return mapProfileRow(created);

  return {
    userId,
    displayName,
    starlits: 250,
    trophies: ['first-steps'],
    avatarLook: DEFAULT_AVATAR_LOOK,
  };
}

export async function syncEarnedTrophies(
  userId: string,
  currentProfile?: PublicProfile
): Promise<PublicProfile> {
  const profile = currentProfile || (await getOrCreateProfile(userId));
  const [userGames, ideaClaim] = await Promise.all([
    db.select({ status: games.status }).from(games).where(eq(games.ownerId, userId)),
    db
      .select({ id: rewardClaims.id })
      .from(rewardClaims)
      .where(eq(rewardClaims.id, `${userId}_ideaStarter`))
      .limit(1),
  ]);

  const publishedCount = userGames.filter(game => game.status === 'published').length;
  const earned = new Set(Array.isArray(profile.trophies) ? profile.trophies : []);
  earned.add('first-steps');
  if (publishedCount >= 1) earned.add('world-maker');
  if (publishedCount >= 5) earned.add('rising-creator');
  if (publishedCount >= 10) earned.add('studio-veteran');
  if (ideaClaim.length > 0) earned.add('idea-starter');

  const trophies = Array.from(earned);
  const previous = Array.isArray(profile.trophies) ? profile.trophies : [];
  if (trophies.length === previous.length && trophies.every(id => previous.includes(id))) {
    return { ...profile, trophies };
  }

  const [updated] = await db
    .update(profiles)
    .set({ trophies, updatedAt: new Date() })
    .where(eq(profiles.userId, userId))
    .returning();

  return updated ? mapProfileRow(updated) : { ...profile, trophies };
}

export const FREE_DAILY_LIMIT = 10;
export const PLUS_MONTHLY_CREDITS = 1000;

export function usagePeriod(isPlus: boolean, now = new Date()): string {
  return isPlus
    ? `month_${now.getUTCFullYear()}_${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    : `day_${now.toISOString().slice(0, 10)}`;
}

export type AiReservation = {
  id: string;
  cost: number;
  isPlus: boolean;
  period: string;
  usedAfter: number;
};

export async function reserveAiUsage(
  userId: string,
  isPlus: boolean,
  cost: number
): Promise<AiReservation> {
  const period = usagePeriod(isPlus);
  const id = safeId(`ai_${userId}_${period}`);
  const limit = isPlus ? PLUS_MONTHLY_CREDITS : FREE_DAILY_LIMIT;

  await db
    .insert(aiUsage)
    .values({
      id,
      userId,
      period,
      plusCreditsUsed: 0,
      freePromptsUsed: 0,
    })
    .onConflictDoNothing();

  const updated = isPlus
    ? await db
        .update(aiUsage)
        .set({
          plusCreditsUsed: sql`${aiUsage.plusCreditsUsed} + ${cost}`,
          updatedAt: new Date(),
        })
        .where(
          sql`${aiUsage.id} = ${id} AND ${aiUsage.plusCreditsUsed} + ${cost} <= ${limit}`
        )
        .returning()
    : await db
        .update(aiUsage)
        .set({
          freePromptsUsed: sql`${aiUsage.freePromptsUsed} + ${cost}`,
          updatedAt: new Date(),
        })
        .where(
          sql`${aiUsage.id} = ${id} AND ${aiUsage.freePromptsUsed} + ${cost} <= ${limit}`
        )
        .returning();

  if (updated.length === 0) {
    const [current] = await db.select().from(aiUsage).where(eq(aiUsage.id, id)).limit(1);
    const used = isPlus
      ? Number(current?.plusCreditsUsed || limit)
      : Number(current?.freePromptsUsed || limit);
    const remaining = Math.max(0, limit - used);
    throw Object.assign(new Error('AI_LIMIT_REACHED'), {
      code: 'AI_LIMIT_REACHED',
      remaining,
      limit,
      isPlus,
    });
  }

  const row = updated[0];
  return {
    id,
    cost,
    isPlus,
    period,
    usedAfter: isPlus ? row.plusCreditsUsed : row.freePromptsUsed,
  };
}

export async function releaseAiUsage(reservation: AiReservation): Promise<void> {
  if (reservation.isPlus) {
    await db
      .update(aiUsage)
      .set({
        plusCreditsUsed: sql`GREATEST(0, ${aiUsage.plusCreditsUsed} - ${reservation.cost})`,
        updatedAt: new Date(),
      })
      .where(eq(aiUsage.id, reservation.id));
  } else {
    await db
      .update(aiUsage)
      .set({
        freePromptsUsed: sql`GREATEST(0, ${aiUsage.freePromptsUsed} - ${reservation.cost})`,
        updatedAt: new Date(),
      })
      .where(eq(aiUsage.id, reservation.id));
  }
}

export async function getAiUsage(userId: string, isPlus: boolean) {
  const period = usagePeriod(isPlus);
  const id = safeId(`ai_${userId}_${period}`);
  const [usage] = await db.select().from(aiUsage).where(eq(aiUsage.id, id)).limit(1);

  if (isPlus) {
    const used = Number(usage?.plusCreditsUsed || 0);
    return {
      plan: 'plus' as const,
      period,
      monthlyAllowance: PLUS_MONTHLY_CREDITS,
      creditsUsed: used,
      creditsRemaining: Math.max(0, PLUS_MONTHLY_CREDITS - used),
    };
  }

  const used = Number(usage?.freePromptsUsed || 0);
  return {
    plan: 'free' as const,
    period,
    dailyAllowance: FREE_DAILY_LIMIT,
    promptsUsed: used,
    promptsRemaining: Math.max(0, FREE_DAILY_LIMIT - used),
  };
}
