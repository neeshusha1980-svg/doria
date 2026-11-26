CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "email_verified" boolean NOT NULL DEFAULT false,
  "image" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" ("user_id");

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamptz,
  "refresh_token_expires_at" timestamptz,
  "scope" text,
  "password" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" ("user_id");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

CREATE TABLE IF NOT EXISTS "profiles" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "username" text,
  "display_name" text NOT NULL,
  "starlits" integer NOT NULL DEFAULT 250 CHECK ("starlits" >= 0),
  "trophies" jsonb NOT NULL DEFAULT '["first-steps"]'::jsonb,
  "bio" text DEFAULT '',
  "plus_active" boolean NOT NULL DEFAULT false,
  "equipped_ugc_id" text,
  "avatar_look" jsonb DEFAULT '{"body":"#9b7bff","accent":"#7cebe5","style":"classic"}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "plan_updated_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_username_unique_idx" ON "profiles" ("username") WHERE "username" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "usernames" (
  "normalized_username" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE,
  "username" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "games" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "genre" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "creation_mode" text NOT NULL DEFAULT 'baseplate',
  "html_code" text NOT NULL DEFAULT '',
  "neo_prompt" text NOT NULL DEFAULT '',
  "scene_data" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "creator_name" text NOT NULL,
  "owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'published',
  "visibility" text NOT NULL DEFAULT 'public',
  "is_private" boolean NOT NULL DEFAULT false,
  "member_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "plays" integer NOT NULL DEFAULT 0 CHECK ("plays" >= 0),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "games_owner_id_idx" ON "games" ("owner_id");
CREATE INDEX IF NOT EXISTS "games_status_created_idx" ON "games" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "games_genre_idx" ON "games" ("genre");

CREATE TABLE IF NOT EXISTS "game_likes" (
  "id" text PRIMARY KEY NOT NULL,
  "game_id" text NOT NULL REFERENCES "games"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("game_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "game_likes_game_id_idx" ON "game_likes" ("game_id");

CREATE TABLE IF NOT EXISTS "game_play_receipts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "game_id" text NOT NULL REFERENCES "games"("id") ON DELETE CASCADE,
  "day" text NOT NULL,
  "played_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "game_id", "day")
);

CREATE TABLE IF NOT EXISTS "game_play_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "game_id" text NOT NULL REFERENCES "games"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'active',
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "game_play_sessions_user_game_idx" ON "game_play_sessions" ("user_id", "game_id", "status");

CREATE TABLE IF NOT EXISTS "game_completion_receipts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "game_id" text NOT NULL REFERENCES "games"("id") ON DELETE CASCADE,
  "score" integer NOT NULL,
  "completed_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "game_id")
);

CREATE TABLE IF NOT EXISTS "gamepasses" (
  "id" text PRIMARY KEY NOT NULL,
  "game_id" text NOT NULL REFERENCES "games"("id") ON DELETE CASCADE,
  "game" text NOT NULL,
  "owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "detail" text NOT NULL,
  "price" integer NOT NULL CHECK ("price" >= 5 AND "price" <= 5000),
  "effect_type" text NOT NULL,
  "effect_value" double precision NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "gamepasses_game_id_idx" ON "gamepasses" ("game_id");

CREATE TABLE IF NOT EXISTS "owned_gamepasses" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "pass_id" text NOT NULL REFERENCES "gamepasses"("id") ON DELETE CASCADE,
  "game" text NOT NULL,
  "game_id" text NOT NULL,
  "effect_type" text NOT NULL,
  "effect_value" double precision NOT NULL DEFAULT 1,
  "price" integer NOT NULL,
  "purchased_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("owner_id", "pass_id")
);
CREATE INDEX IF NOT EXISTS "owned_gamepasses_owner_game_idx" ON "owned_gamepasses" ("owner_id", "game_id");

CREATE TABLE IF NOT EXISTS "ugc_items" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "asset_type" text NOT NULL,
  "color" text NOT NULL,
  "price" integer NOT NULL CHECK ("price" >= 0 AND "price" <= 5000),
  "model_data" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "creator_name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'approved',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ugc_items_status_created_idx" ON "ugc_items" ("status", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "owned_ugc" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "item_id" text NOT NULL REFERENCES "ugc_items"("id") ON DELETE CASCADE,
  "price" integer NOT NULL,
  "purchased_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("owner_id", "item_id")
);

CREATE TABLE IF NOT EXISTS "badge_definitions" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "game_id" text DEFAULT '',
  "art_style" text NOT NULL DEFAULT 'creator',
  "image_path" text NOT NULL DEFAULT '',
  "creator_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "creator_name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'published',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "badge_definitions_game_status_idx" ON "badge_definitions" ("game_id", "status");

CREATE TABLE IF NOT EXISTS "earned_badges" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "badge_id" text NOT NULL REFERENCES "badge_definitions"("id") ON DELETE CASCADE,
  "game_id" text NOT NULL DEFAULT '',
  "earned_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("owner_id", "badge_id")
);

CREATE TABLE IF NOT EXISTS "reward_claims" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "reward" integer NOT NULL,
  "claimed_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "reward_claims_user_id_idx" ON "reward_claims" ("user_id");

CREATE TABLE IF NOT EXISTS "task_reward_claims" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "task_id" text NOT NULL,
  "reward" integer NOT NULL,
  "day" text NOT NULL,
  "claimed_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "task_id", "day")
);

CREATE TABLE IF NOT EXISTS "friends" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "friend_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "username" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "friend_id")
);
CREATE INDEX IF NOT EXISTS "friends_user_id_idx" ON "friends" ("user_id");

CREATE TABLE IF NOT EXISTS "friend_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "from_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "from_username" text NOT NULL,
  "to_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "to_username" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "friend_requests_to_status_idx" ON "friend_requests" ("to_user_id", "status");
CREATE INDEX IF NOT EXISTS "friend_requests_from_status_idx" ON "friend_requests" ("from_user_id", "status");

CREATE TABLE IF NOT EXISTS "user_blocks" (
  "id" text PRIMARY KEY NOT NULL,
  "blocker_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "blocked_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "blocked_username" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("blocker_id", "blocked_id")
);
CREATE INDEX IF NOT EXISTS "user_blocks_blocked_id_idx" ON "user_blocks" ("blocked_id");

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "game_id" text NOT NULL REFERENCES "games"("id") ON DELETE CASCADE,
  "owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "username" text NOT NULL,
  "text" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "chat_messages_game_created_idx" ON "chat_messages" ("game_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "game_players" (
  "id" text PRIMARY KEY NOT NULL,
  "game_id" text NOT NULL REFERENCES "games"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "username" text NOT NULL,
  "lane" double precision NOT NULL DEFAULT 0,
  "distance" double precision NOT NULL DEFAULT 0,
  "jump" double precision NOT NULL DEFAULT 0,
  "score" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'lobby',
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "game_players_game_status_updated_idx" ON "game_players" ("game_id", "status", "updated_at");

CREATE TABLE IF NOT EXISTS "moments" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "username" text NOT NULL,
  "caption" text NOT NULL DEFAULT '',
  "video_path" text NOT NULL DEFAULT '',
  "video_url" text DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "moments_created_at_idx" ON "moments" ("created_at" DESC);

CREATE TABLE IF NOT EXISTS "news_posts" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "username" text NOT NULL,
  "text" text NOT NULL DEFAULT '',
  "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "news_posts_created_at_idx" ON "news_posts" ("created_at" DESC);

CREATE TABLE IF NOT EXISTS "content_reports" (
  "id" text PRIMARY KEY NOT NULL,
  "reporter_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "reason" text NOT NULL,
  "details" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "reviewed_at" timestamptz,
  "reviewed_by" text
);
CREATE INDEX IF NOT EXISTS "content_reports_status_created_idx" ON "content_reports" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "content_reports_reporter_created_idx" ON "content_reports" ("reporter_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "privacy_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "request_type" text NOT NULL DEFAULT 'account_deletion',
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "reviewed_at" timestamptz,
  "reviewed_by" text
);
CREATE INDEX IF NOT EXISTS "privacy_requests_status_created_idx" ON "privacy_requests" ("status", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "parental_invites" (
  "id" text PRIMARY KEY NOT NULL,
  "child_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "guardian_email" text NOT NULL,
  "token_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "accepted_at" timestamptz,
  "guardian_user_id" text
);
CREATE INDEX IF NOT EXISTS "parental_invites_child_status_idx" ON "parental_invites" ("child_user_id", "status");

CREATE TABLE IF NOT EXISTS "parental_settings" (
  "child_user_id" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "guardian_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "allow_friend_requests" boolean NOT NULL DEFAULT true,
  "allow_moments" boolean NOT NULL DEFAULT true,
  "allow_chat" boolean NOT NULL DEFAULT false,
  "daily_limit" integer NOT NULL DEFAULT 90,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "parental_settings_guardian_idx" ON "parental_settings" ("guardian_user_id");

CREATE TABLE IF NOT EXISTS "safety_profiles" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'disabled',
  "supervised_access" boolean NOT NULL DEFAULT false,
  "approved_by_guardian" text,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "period" text NOT NULL,
  "plus_credits_used" integer NOT NULL DEFAULT 0 CHECK ("plus_credits_used" >= 0),
  "free_prompts_used" integer NOT NULL DEFAULT 0 CHECK ("free_prompts_used" >= 0),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "period")
);
