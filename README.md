# Doria — Independent Self-Hosted Platform

Doria is a community game creation and 3D world exploration platform migrated off AppDeploy onto a portable, self-hosted monorepo:

- **Frontend (`apps/web`):** React 19, TypeScript, Vite 8, Tailwind CSS, PlayCanvas 2.22 (voxel endless runner, saved baseplate viewer, 3D avatar preview), Three.js 0.174 (24x24 Baseplate World Builder & 3D UGC Workshop), Lucide icons, Fredoka typography, and dark purple space theme.
- **Backend (`apps/api`):** Node.js 22+, TypeScript, Fastify 5 REST API & native WebSocket gateway (`/ws`).
- **Database:** PostgreSQL 17 with Drizzle ORM and versioned SQL migrations (`0000_initial.sql`, `0001_security_hardening.sql`).
- **Authentication:** Better Auth (`/api/auth/*`) with HTTP-only `SameSite=Lax` cookies, Argon2/scrypt password hashing, optional Google OAuth, CSRF origin protection, and rate limits.
- **Object Storage:** S3-compatible storage (MinIO locally via Docker Compose; AWS S3 or Cloudflare R2 in production).
- **Neo AI:** Server-side provider-adapter architecture (`openai`, `anthropic`, `gemini`, `openai-compatible`) with server-side HTML safety sanitization and isolated server keys.
- **Reverse Proxy:** Caddy 2 with automatic HTTPS for custom domains.

## Quick Start (Docker Compose)

1. Copy `.env.example` to `.env` and replace every `CHANGE_ME_*` placeholder with strong random secrets (do not leave placeholder strings, as startup validation rejects them):
   ```bash
   cp .env.example .env
   ```
2. Start PostgreSQL 17, MinIO, the Fastify API (which automatically applies `0000_initial.sql` and `0001_security_hardening.sql`), the React/Nginx web container, and Caddy:
   ```bash
   docker compose up --build -d
   ```
3. Verify health and open `http://localhost:8080`:
   ```bash
   curl -f http://localhost:8080/api/_healthcheck
   ```

## Local Development & Automated Tests

```bash
docker compose up -d postgres minio minio-init
npm install
npm run db:migrate
npm run typecheck
npm run build
npm test
```

## Required Production Environment Variables

Configure these values in your hosting provider's secure secret manager before public launch:
- `POSTGRES_PASSWORD` & `DATABASE_URL` — PostgreSQL 17 credentials
- `BETTER_AUTH_SECRET` — Random secret (>= 32 characters; e.g. `openssl rand -base64 48`)
- `BETTER_AUTH_URL`, `PUBLIC_APP_URL`, `CORS_ORIGIN`, `VITE_APP_PUBLIC_URL` — Your custom domain URL (e.g., `https://doria.yourdomain.com`)
- `DORIA_DOMAIN` — Custom domain for Caddy automatic TLS (e.g., `doria.yourdomain.com`)
- `S3_ENDPOINT`, `S3_PUBLIC_URL`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — S3/R2 bucket credentials
- `NEO_AI_PROVIDER`, `NEO_AI_API_KEY`, `NEO_AI_MODEL` — Server-side AI provider credentials
- `ADMIN_EMAILS` — Comma-separated list of **verified** administrator email addresses (leave empty until verified admin accounts exist)
