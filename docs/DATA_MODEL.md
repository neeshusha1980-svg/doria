# PostgreSQL 17 Data Model

The relational schema is defined in `apps/api/src/db/schema.ts` and applied via `apps/api/src/db/migrations/0000_initial.sql`:

1. **Authentication (`user`, `session`, `account`, `verification`):** Managed by Better Auth with `ON DELETE CASCADE` foreign keys from `session` and `account` to `user(id)`.
2. **Identity & Profiles (`profiles`, `usernames`):** `profiles.user_id` references `user(id)` 1:1 with non-negative `starlits` check constraint (`default 250`). `usernames.normalized_username` enforces globally unique case-insensitive usernames.
3. **Worlds & Telemetry (`games`, `game_likes`, `game_play_receipts`, `game_play_sessions`, `game_completion_receipts`):** `games` stores `creation_mode`, `html_code`, `neo_prompt`, and `scene_data` (`jsonb`). Unique composite constraints on `(game_id, user_id)` and `(user_id, game_id, day)` guarantee idempotent likes, unique daily play counts, and single-award completions.
4. **Virtual Economy (`gamepasses`, `owned_gamepasses`, `ugc_items`, `owned_ugc`, `badge_definitions`, `earned_badges`, `reward_claims`, `task_reward_claims`):** Atomic PostgreSQL transactions deduct `profiles.starlits` (`WHERE starlits >= price`) before inserting ownership rows.
5. **Social & Safety (`friends`, `friend_requests`, `user_blocks`, `chat_messages`, `game_players`, `moments`, `news_posts`, `content_reports`, `privacy_requests`):** Cascade deletes on `user(id)` and `games(id)` maintain referential integrity; `user_blocks` prevents interaction in either direction.
6. **Guardian & AI Metering (`parental_invites`, `parental_settings`, `safety_profiles`, `ai_usage`):** `parental_invites` stores SHA-256 token hashes with 7-day expiry; `safety_profiles.supervised_access` gates multiplayer access; `ai_usage` enforces atomic `free_prompts_used` (10/day) and `plus_credits_used` (1,000/month) counters.
