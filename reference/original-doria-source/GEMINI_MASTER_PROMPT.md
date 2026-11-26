# GEMINI MASTER TASK — MAKE DORIA FULLY INDEPENDENT

You are receiving the complete available Doria source tree in this archive. The source was exported from Doria app `doria-4bqrim`, archive source revision `1795346515545`. This is the revision supplied by the owner; it is not claimed to be the separately requested older revision `1795012215870`.

## Mission
Convert this exact Doria project into a fully independent, production-oriented application with NO AppDeploy dependency, SDK, hosted backend, authentication, database, AI service, storage, build variables, domain, branding, or legal-policy references. Preserve the existing Doria product and user experience. Do not redesign it or remove features merely because they are difficult to migrate.

## Non-negotiable preservation rules
1. Preserve the existing visual design, page structure, copy, responsive behavior, dark purple space theme, Fredoka typography, Lucide icons, and no-emoji Doria UI.
2. Preserve all existing gameplay, PlayCanvas voxel engine, Three.js experiences, avatar/editor flows, creator tools, chat, friends, profiles, games, Starlits, trophies, Doria Plus entitlements, reports, privacy controls, parental/supervised-access controls, and admin functionality.
3. Keep safety protections. In particular, do not weaken guardian-linked supervised multiplayer access, report/block/moderation features, age-appropriate safeguards, rate limits, or privacy controls. Do not add unrequested identity checks or payment processing.
4. Do not invent functionality or claim something works unless implemented and tested. Where a source feature is incomplete, document it honestly and preserve the existing behavior where possible.
5. Do not modify or delete the original hosted Doria deployment. This is a separate replacement project.

## AppDeploy removal requirements
Search the entire project for `appdeploy`, `@appdeploy`, AppDeploy client/SDK APIs, injected environment variables, hosted AI/storage/database/auth/realtime assumptions, and provider-specific privacy-policy wording. Remove all runtime/build dependence on them.

The current source imports `@appdeploy/sdk` in:
- `source/backend/index.ts`
- `source/backend/realtime-subscribers.ts`
- `source/backend/room-access.ts`

The current frontend imports `@appdeploy/client` in:
- `source/src/App.tsx`
- `source/src/AvatarEditor.tsx`
- `source/src/AvatarMarketplace.tsx`
- `source/src/BadgeStudio.tsx`
- `source/src/CreatorGamepasses.tsx`
- `source/src/GameChat.tsx`
- `source/src/GamePassShop.tsx`
- `source/src/ThreeGame.tsx`

`source/vite.config.ts` has AppDeploy-specific output/sourcemap environment variables. The privacy/legal text in `source/src/App.tsx` also names AppDeploy and the old hosted URL. Replace those with accurate, provider-neutral text and configurable deployment details; do not invent a company address or legal entity.

## Target architecture
Use a portable monorepo:
- `apps/web`: React 19 + TypeScript + Vite; retain PlayCanvas and Three.js.
- `apps/api`: Node.js + TypeScript + Fastify REST API.
- PostgreSQL 17 with Drizzle ORM and checked-in migrations for every collection/table used by the backend.
- Better Auth (or another well-maintained self-hostable auth system) with secure HTTP-only cookies, password hashing, rate limits, CSRF/origin protections, and session revocation.
- Native WebSocket support through Fastify for realtime chat/game rooms/subscriptions; Redis may be used for pub/sub and scaling.
- S3-compatible object storage (MinIO locally; S3/R2-compatible configuration for production).
- A server-side Neo AI provider adapter with credentials read only from server environment variables. Never expose AI keys in browser code.
- Docker Compose for local development, with health checks and persistent volumes. Provide `.env.example` with placeholders only, never secrets.
- Reverse-proxy/deployment example (Caddy or equivalent), HTTPS guidance, backups, migrations, and operational README.

## Backend migration
The existing `source/backend/index.ts` is the authoritative route/behavior source and uses the AppDeploy router/database/auth/AI/storage abstractions. Migrate every route and behavior into Fastify handlers and service modules. Also migrate realtime subscription routes and disconnect handling from the existing realtime files. Do not silently drop routes. Produce a route-by-route mapping table from old handler to new handler and tests for each route. Recreate the existing data model and constraints in PostgreSQL. Use transactions and correct concurrency handling for counters/AI usage/claims. Preserve authorization checks on every protected route.

## Frontend migration
Replace the AppDeploy client SDK with a typed first-party API client under the web app. Keep existing endpoint paths where practical, or update all call sites consistently. Implement auth/session handling, REST errors, websocket connection/reconnection, and loading/error states. Do not leave mock endpoints or placeholder actions in production paths.

## Required outputs
1. A complete updated project tree, not just snippets or a plan.
2. All source/config/schema/migration/test files required to run it.
3. `README.md` with exact setup/development/build/test/deploy steps.
4. `.env.example` containing names and safe placeholder values only.
5. `docs/APPDEPLOY_REMOVAL_AUDIT.md`: every AppDeploy reference found and how it was replaced; final search should show zero runtime/build references.
6. `docs/ROUTE_MIGRATION_MAP.md`: every original API route mapped to its new handler, including realtime routes.
7. `docs/DATA_MODEL.md`: all collections/tables, fields, indexes, relations, constraints, retention/deletion behavior.
8. `docs/FEATURE_PARITY.md`: each original feature marked implemented, partially implemented, or blocked, with reasons.
9. Automated tests for auth, permissions, route behavior, privacy deletion, moderation/blocking, AI usage limits, and multiplayer guardian gates.
10. Docker Compose and deployment configuration.

## Work method
First inspect every file in the archive. Do not rely on filenames or this prompt alone. Then produce a complete implementation in coherent stages. If the environment cannot output all files at once, create downloadable ZIP artifacts for each stage and maintain a manifest so no files are omitted. Do not ask the owner to install tools or run PowerShell. Do not ask for secrets in chat. Clearly list any credentials/configuration the owner must later add through the hosting provider's secure environment settings.

## Acceptance criteria
- `npm install`/the documented package-manager install completes without any AppDeploy package.
- Frontend production build succeeds.
- Backend typecheck/build succeeds.
- Database migrations apply cleanly to an empty PostgreSQL database.
- Automated tests pass.
- A repository-wide search finds no AppDeploy SDK/runtime/build dependencies or obsolete provider-specific legal text.
- Existing Doria screens and gameplay remain intact.
- The original AppDeploy-hosted Doria remains untouched until the owner explicitly approves a later cutover.

Begin by listing the full file tree you received and auditing the AppDeploy dependencies. Then implement; do not stop after giving advice.
