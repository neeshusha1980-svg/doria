-- ============================================================================
-- Doria Security & Guardian Enforcement Migration
-- ============================================================================

ALTER TABLE "parental_settings"
  ADD COLUMN IF NOT EXISTS "allow_ai" boolean NOT NULL DEFAULT true;

ALTER TABLE "safety_profiles"
  ALTER COLUMN "status" SET DEFAULT 'standard';

CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "admin_user_id" text NOT NULL,
  "admin_email" text NOT NULL,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "admin_audit_logs_created_idx" ON "admin_audit_logs" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "admin_audit_logs_admin_idx" ON "admin_audit_logs" ("admin_user_id");
