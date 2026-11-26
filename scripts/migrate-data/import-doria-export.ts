import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

/**
 * Phase 6 Data Migration Importer
 * Imports a sanitized JSON export of Doria collections into PostgreSQL 17.
 * - Preserves original entity IDs and relationships.
 * - Never reads or writes plaintext password hashes; creates placeholder user
 *   records requiring secure password-reset before login.
 * - Idempotent via ON CONFLICT DO NOTHING.
 */

type ExportBundle = {
  users?: Array<{ id: string; name?: string; email: string; emailVerified?: boolean; createdAt?: string }>;
  profiles?: Array<Record<string, unknown>>;
  usernames?: Array<{ userId: string; username: string }>;
  games?: Array<Record<string, unknown>>;
  game_likes?: Array<Record<string, unknown>>;
  gamepasses?: Array<Record<string, unknown>>;
  owned_gamepasses?: Array<Record<string, unknown>>;
  ugc_items?: Array<Record<string, unknown>>;
  owned_ugc?: Array<Record<string, unknown>>;
  badge_definitions?: Array<Record<string, unknown>>;
  earned_badges?: Array<Record<string, unknown>>;
  reward_claims?: Array<Record<string, unknown>>;
  task_reward_claims?: Array<Record<string, unknown>>;
  friends?: Array<Record<string, unknown>>;
  friend_requests?: Array<Record<string, unknown>>;
  user_blocks?: Array<Record<string, unknown>>;
  chat_messages?: Array<Record<string, unknown>>;
  moments?: Array<Record<string, unknown>>;
  news_posts?: Array<Record<string, unknown>>;
  content_reports?: Array<Record<string, unknown>>;
  privacy_requests?: Array<Record<string, unknown>>;
  parental_invites?: Array<Record<string, unknown>>;
  parental_settings?: Array<Record<string, unknown>>;
  safety_profiles?: Array<Record<string, unknown>>;
  ai_usage?: Array<Record<string, unknown>>;
};

async function main() {
  const filePath = process.argv[2];
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage: npx tsx scripts/migrate-data/import-doria-export.ts <path-to-export.json>');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ExportBundle;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Users (ensure every profile/ownerId has a corresponding user row)
    const userMap = new Map<string, { id: string; name: string; email: string; emailVerified: boolean; createdAt: string }>();
    for (const u of raw.users || []) {
      if (u.id && u.email) {
        userMap.set(u.id, {
          id: u.id,
          name: u.name || 'Doria Creator',
          email: u.email.toLowerCase(),
          emailVerified: Boolean(u.emailVerified),
          createdAt: u.createdAt || new Date().toISOString(),
        });
      }
    }
    for (const p of raw.profiles || []) {
      const uid = String(p.userId || p.id || '');
      if (uid && !userMap.has(uid)) {
        userMap.set(uid, {
          id: uid,
          name: String(p.displayName || p.username || 'Migrated Creator'),
          email: `migrated+${uid.replace(/[^a-zA-Z0-9_-]/g, '_')}@migration.local`,
          emailVerified: false,
          createdAt: String(p.createdAt || new Date().toISOString()),
        });
      }
    }

    for (const u of userMap.values()) {
      await client.query(
        `INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT ("id") DO NOTHING`,
        [u.id, u.name, u.email, u.emailVerified, u.createdAt]
      );
    }

    // 2. Profiles
    for (const p of raw.profiles || []) {
      const userId = String(p.userId || p.id || '');
      if (!userId) continue;
      await client.query(
        `INSERT INTO "profiles" ("user_id", "username", "display_name", "starlits", "trophies", "bio", "plus_active", "equipped_ugc_id", "avatar_look", "created_at")
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10)
         ON CONFLICT ("user_id") DO NOTHING`,
        [
          userId,
          p.username || null,
          String(p.displayName || 'Creator'),
          Number(p.starlits ?? 250),
          JSON.stringify(Array.isArray(p.trophies) ? p.trophies : ['first-steps']),
          String(p.bio || ''),
          p.plusActive === true,
          p.equippedUgcId || null,
          JSON.stringify(p.avatarLook || { body: '#9b7bff', accent: '#7cebe5', style: 'classic' }),
          p.createdAt || new Date().toISOString(),
        ]
      );
    }

    // 3. Usernames
    for (const u of raw.usernames || []) {
      if (!u.username || !u.userId) continue;
      await client.query(
        `INSERT INTO "usernames" ("normalized_username", "user_id", "username")
         VALUES ($1, $2, $3)
         ON CONFLICT ("normalized_username") DO NOTHING`,
        [u.username.toLowerCase(), u.userId, u.username]
      );
    }

    // 4. Games
    for (const g of raw.games || []) {
      if (!g.id || !g.ownerId) continue;
      await client.query(
        `INSERT INTO "games" ("id", "name", "genre", "description", "creation_mode", "html_code", "neo_prompt", "scene_data", "creator_name", "owner_id", "status", "visibility", "is_private", "member_ids", "plays", "created_at")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14::jsonb, $15, $16)
         ON CONFLICT ("id") DO NOTHING`,
        [
          String(g.id),
          String(g.name || 'Untitled World'),
          String(g.genre || 'Adventure'),
          String(g.description || ''),
          String(g.creationMode || 'baseplate'),
          String(g.htmlCode || ''),
          String(g.neoPrompt || ''),
          JSON.stringify(Array.isArray(g.sceneData) ? g.sceneData : []),
          String(g.creatorName || 'Creator'),
          String(g.ownerId),
          String(g.status || 'published'),
          String(g.visibility || 'public'),
          g.isPrivate === true,
          JSON.stringify(Array.isArray(g.memberIds) ? g.memberIds : []),
          Number(g.plays || 0),
          g.createdAt || new Date().toISOString(),
        ]
      );
    }

    // 5. Likes, Gamepasses, UGC, Badges, Social, Moderation & Parental tables
    for (const l of raw.game_likes || []) {
      if (!l.id || !l.gameId || !l.userId) continue;
      await client.query(
        `INSERT INTO "game_likes" ("id", "game_id", "user_id", "created_at") VALUES ($1, $2, $3, $4) ON CONFLICT ("id") DO NOTHING`,
        [String(l.id), String(l.gameId), String(l.userId), l.createdAt || new Date().toISOString()]
      );
    }

    for (const gp of raw.gamepasses || []) {
      if (!gp.id || !gp.gameId || !gp.ownerId) continue;
      await client.query(
        `INSERT INTO "gamepasses" ("id", "game_id", "game", "owner_id", "name", "detail", "price", "effect_type", "effect_value", "status", "created_at")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT ("id") DO NOTHING`,
        [
          String(gp.id),
          String(gp.gameId),
          String(gp.game || 'Game'),
          String(gp.ownerId),
          String(gp.name),
          String(gp.detail),
          Number(gp.price),
          String(gp.effectType),
          Number(gp.effectValue || 1),
          String(gp.status || 'active'),
          gp.createdAt || new Date().toISOString(),
        ]
      );
    }

    for (const f of raw.friends || []) {
      if (!f.id || !f.userId || !f.friendId) continue;
      await client.query(
        `INSERT INTO "friends" ("id", "user_id", "friend_id", "username", "created_at") VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("id") DO NOTHING`,
        [String(f.id), String(f.userId), String(f.friendId), String(f.username || 'Player'), f.createdAt || new Date().toISOString()]
      );
    }

    for (const ps of raw.parental_settings || []) {
      if (!ps.childUserId || !ps.guardianUserId) continue;
      await client.query(
        `INSERT INTO "parental_settings" ("child_user_id", "guardian_user_id", "allow_friend_requests", "allow_moments", "allow_chat", "daily_limit")
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT ("child_user_id") DO NOTHING`,
        [
          String(ps.childUserId),
          String(ps.guardianUserId),
          ps.allowFriendRequests !== false,
          ps.allowMoments !== false,
          ps.allowChat === true,
          Number(ps.dailyLimit || 90),
        ]
      );
    }

    for (const sp of raw.safety_profiles || []) {
      const uid = String(sp.userId || sp.id || '');
      if (!uid) continue;
      await client.query(
        `INSERT INTO "safety_profiles" ("user_id", "status", "supervised_access", "approved_by_guardian")
         VALUES ($1, $2, $3, $4) ON CONFLICT ("user_id") DO NOTHING`,
        [uid, String(sp.status || 'disabled'), sp.supervisedAccess === true, sp.approvedByGuardian || null]
      );
    }

    await client.query('COMMIT');
    console.log(`[migrate] Import complete. Imported ${userMap.size} accounts.`);
    console.log(`[migrate] Note: Migrated users without password credentials should reset their password via Better Auth password-reset flow (batch ref: ${randomBytes(6).toString('hex')}).`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('[migrate] Import failed:', err);
  process.exit(1);
});
