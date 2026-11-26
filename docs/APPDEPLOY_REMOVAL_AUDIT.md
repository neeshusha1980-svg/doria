# AppDeploy Dependency Removal Audit

Every reference to `appdeploy` or `@appdeploy/*` in the original snapshot (`revision 1795346515545`) was audited and replaced:

| Original File & Location | Original Dependency / Reference | Independent Replacement |
| :--- | :--- | :--- |
| `source/backend/index.ts:1` | `import { router, json, error, db, increment, requireAuth, requireAdminEmailAllowlist, ai, storage } from '@appdeploy/sdk'` | Modular Fastify route plugins (`apps/api/src/routes/*.ts`), Drizzle ORM + PostgreSQL 17 (`apps/api/src/db/*`), Better Auth guards (`apps/api/src/auth/guards.ts`), Neo AI server adapter (`apps/api/src/ai/neo-adapter.ts`), S3/MinIO adapter (`apps/api/src/storage/s3.ts`). |
| `source/backend/realtime-subscribers.ts:1` | `import { db, ws, json, error, requireAuth } from '@appdeploy/sdk'` | Native Fastify WebSocket room hub (`apps/api/src/realtime/hub.ts`) with optional Redis Pub/Sub and `/api/subscriptions` routes in `apps/api/src/routes/multiplayer.ts`. |
| `source/backend/realtime.ts:1-31` | AppDeploy `system.disconnected` webhook handler | Native `socket.on('close')` cleanup inside `RealtimeHub.registerConnection()` (`apps/api/src/realtime/hub.ts`). |
| `source/backend/room-access.ts:1` | `import { db } from '@appdeploy/sdk'` | `canAccessGameRoom()` in `apps/api/src/auth/guards.ts` querying PostgreSQL `games`. |
| `source/vite.config.ts:8,10` | `process.env.APPDEPLOY_VITE_OUT_DIR`, `process.env.APPDEPLOY_VITE_SOURCEMAP` | Standard Vite `outDir: 'dist'` and `sourcemap: false` in `apps/web/vite.config.ts`. |
| `source/src/App.tsx:11` | `import { auth, api } from '@appdeploy/client'` | `apps/web/src/lib/auth.ts` (Better Auth client), `apps/web/src/lib/api.ts` (typed fetch wrapper), and `apps/web/src/components/AuthDialog.tsx`. |
| `source/src/App.tsx:1224,1259,1273` | Privacy Policy mentions of AppDeploy, FreeBraavos LTD, and `https://doria-4bqrim.v2.appdeploy.ai/` | Replaced with provider-neutral self-hosted infrastructure disclosures and configurable `VITE_APP_PUBLIC_URL`. |
| `source/src/AvatarEditor.tsx:2` | `import { api } from '@appdeploy/client'` | `import { api } from './lib/api'` |
| `source/src/AvatarMarketplace.tsx:3` | `import { api } from '@appdeploy/client'` | `import { api } from './lib/api'` |
| `source/src/BadgeStudio.tsx:2` | `import { api } from '@appdeploy/client'` | `import { api } from './lib/api'` |
| `source/src/CreatorGamepasses.tsx:2` | `import { api } from '@appdeploy/client'` | `import { api } from './lib/api'` |
| `source/src/GameChat.tsx:2` | `import { api, auth, ws } from '@appdeploy/client'` | `import { api } from './lib/api'`, `import { auth } from './lib/auth'`, `import { ws } from './lib/ws'` |
| `source/src/GamePassShop.tsx:2` | `import { api } from '@appdeploy/client'` | `import { api } from './lib/api'` |
| `source/src/ThreeGame.tsx:7` | `import { api, ws } from '@appdeploy/client'` | `import { api } from './lib/api'`, `import { ws } from './lib/ws'` |
