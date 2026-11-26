# Doria Independent Platform — Test & Validation Results

## 1. Environment Capability Disclosure
- **Packaging Container Environment:** Python 3.x only (`node`, `npm`, `npx`, `tsc`, `psql`, `pg_isready`, and `docker` are not installed in the sandbox).
- **Truthful Execution Status:**
  - `npm install`: **NOT EXECUTED IN SANDBOX** (must be run on host/CI)
  - `npm run typecheck`: **NOT EXECUTED IN SANDBOX** (must be run on host/CI)
  - `npm run build`: **NOT EXECUTED IN SANDBOX** (must be run on host/CI)
  - `npm run db:migrate`: **NOT EXECUTED IN SANDBOX** (must be run against PostgreSQL 17 on host/CI)
  - `npm test` (Vitest): **NOT EXECUTED IN SANDBOX** (must be run against PostgreSQL 17 on host/CI)
  - `docker compose up --build -d`: **NOT EXECUTED IN SANDBOX** (must be run on Docker host)
  - **Static Verification Suite (Python AST/Regex/Manifest Audit):** **PASSED** (0 AppDeploy leaks in runnable monorepo, 0 broken relative imports across `apps/api` and `apps/web`, 0 hardcoded admin emails or default passwords in config/Compose, valid JSON manifests).

## 2. Automated Test Suite Inventory (Ready for `npm test`)

| Test File | Covered Security & Functional Scenarios |
| :--- | :--- |
| `apps/api/tests/auth-and-profile.test.ts` | Healthcheck (`GET /api/_healthcheck`), unauthenticated `401` rejection, Better Auth email/password registration, atomic case-insensitive username reservation (`409` on collision), profile updates, avatar color/accessory allowlist validation (`400` on invalid hex), and username search. |
| `apps/api/tests/games-and-economy.test.ts` | Baseplate 3D world publishing, `world-maker` trophy award, public Discover feed visibility filtering, unique daily play count deduplication (`game_play_receipts`), per-game gamepass creation, cross-game gamepass purchase rejection (`403`), atomic Starlits deduction, 3D UGC creation/purchase/equip, and daily task reward claims. |
| `apps/api/tests/neo-ai.test.ts` | AI usage balance inspection, successful Neo HTML generation, server-side rejection (`502`) of unsafe HTML containing `fetch()` / `document.cookie`, and automatic credit rollback on failed/unsafe generation. |
| `apps/api/tests/parental-and-multiplayer.test.ts` | Unlinked multiplayer & chat `403` locks, guardian invitation creation & email-matched acceptance (`403` on wrong account), guardian disabling Neo AI (`allowAi: false` -> `403` on `/api/neo/generate`), guardian enabling supervised multiplayer & chat, and successful room join, state update, and chat message creation. |
| `apps/api/tests/moderation-privacy-admin.test.ts` | Rejection (`403`) of unverified admin email even when listed in `ADMIN_EMAILS`, rejection (`403`) of non-admin user, cross-origin CSRF `403` blocking, verified admin granting Doria Plus, content reporting & resolution, admin safety suspension (`PUT /api/admin/users/:id/safety` -> `403` on protected routes), `admin_audit_logs` verification, bidirectional user blocking, and account deletion request recording. |
| `apps/web/src/__tests__/client-smoke.test.ts` | Typed `ApiError` status/payload propagation and `getApiErrorMessage()` error extraction. |

## 3. Host Verification Commands
Run these commands in order on your Node 22 + PostgreSQL 17 / Docker machine:
```bash
cp .env.example .env
# Edit .env with strong random secrets for POSTGRES_PASSWORD, BETTER_AUTH_SECRET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
npm install
npm run typecheck
npm run build
docker compose up -d postgres minio minio-init
npm run db:migrate
npm test
docker compose up --build -d
curl -f http://localhost:8080/api/_healthcheck
```
