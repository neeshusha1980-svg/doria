import fs from 'node:fs';
import { Pool } from 'pg';
import 'dotenv/config';

async function main() {
  const filePath = process.argv[2];
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage: npx tsx scripts/migrate-data/verify-counts.ts <path-to-export.json>');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown[]>;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const tables = [
    'profiles',
    'usernames',
    'games',
    'game_likes',
    'gamepasses',
    'owned_gamepasses',
    'ugc_items',
    'owned_ugc',
    'badge_definitions',
    'earned_badges',
    'friends',
    'friend_requests',
    'user_blocks',
    'chat_messages',
    'moments',
    'news_posts',
    'content_reports',
    'privacy_requests',
    'parental_settings',
    'safety_profiles',
  ];

  try {
    console.log('Table                     | Export Count | PostgreSQL Count | Status');
    console.log('--------------------------+--------------+------------------+-------');
    let mismatches = 0;
    for (const table of tables) {
      const expected = Array.isArray(raw[table]) ? raw[table].length : 0;
      const res = await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM "${table}"`);
      const actual = Number(res.rows[0]?.count || 0);
      const ok = actual >= expected;
      if (!ok) mismatches += 1;
      console.log(
        `${table.padEnd(25)} | ${String(expected).padEnd(12)} | ${String(actual).padEnd(16)} | ${ok ? 'OK' : 'MISMATCH'}`
      );
    }
    if (mismatches > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('[verify-counts] Failed:', err);
  process.exit(1);
});
