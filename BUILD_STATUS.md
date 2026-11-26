# Doria Independent Migration — Build & Security Status

## 1. Completed Work
- **Complete AppDeploy Removal:** Zero `@appdeploy/sdk`, `@appdeploy/client`, `APPDEPLOY_VITE_*`, or hardcoded `doria-4bqrim.v2.appdeploy.ai` references remain in `apps/`, `scripts/`, or root deployment files. (The unmodified original snapshot is preserved under `reference/original-doria-source/` for archival comparison only.)
- **Security Hardening Complete:**
  - `requireDoriaAdmin` enforces **both** `emailVerified === true` and membership in `ADMIN_EMAILS`.
  - All hardcoded personal admin emails and weak default passwords/secrets have been removed from `apps/api/src/config/env.ts`, `.env.example`, and `docker-compose.yml`.
  - `requireSafety` initializes and enforces `safety_profiles.status` (`'standard'` / `'active'` vs `'suspended'`), while `requireGuardianPermission` and `requireMultiplayerSafety` enforce guardian-controlled `allowFriendRequests`, `allowMoments`, `allowChat`, `allowAi`, and `supervisedAccess` on both REST and WebSocket delivery paths.
  - Added CSRF `Origin`/`Referer` verification, HTTP-only `SameSite=Lax` session cookies with disabled cookie cache, granular route rate limiting, Neo AI HTML safety sanitization with automatic credit rollback, and persistent `admin_audit_logs` (`0001_security_hardening.sql`).
- **Complete Feature & UI Preservation:** All 15 Doria views, dark purple theme, Fredoka typography, Lucide icons, PlayCanvas 2.22 voxel games/avatars, and Three.js 0.174 Baseplate/UGC editors remain intact.

## 2. Unverified Items (Pending Host Execution)
- Because `node`, `npm`, `tsc`, `psql`, and `docker` are unavailable in the archive packaging environment, runtime compilation (`npm run typecheck`, `npm run build`), database migration execution (`npm run db:migrate`), Vitest integration tests (`npm test`), and Docker Compose health checks have not yet been executed and must be run on your target host.
