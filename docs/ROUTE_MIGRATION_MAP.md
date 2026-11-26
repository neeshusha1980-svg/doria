# Route-by-Route Migration Map

| Method & Path | Original Source | New Handler File | Auth & Safety Guards |
| :--- | :--- | :--- | :--- |
| `GET /api/_healthcheck` | `backend/index.ts` | `apps/api/src/routes/system.ts` | Public (verifies PostgreSQL `SELECT 1`) |
| `ALL /api/auth/*` | Legacy Hosted Auth | `apps/api/src/app.ts` (`auth/better-auth.ts`) | Better Auth HTTP-only cookies + rate limiting |
| `GET /api/me` | `backend/index.ts` | `apps/api/src/routes/profile.ts` | `requireAuth` |
| `GET /api/avatar-look` | `backend/index.ts` | `apps/api/src/routes/profile.ts` | `requireAuth` |
| `PUT /api/avatar-look` | `backend/index.ts` | `apps/api/src/routes/profile.ts` | `requireAuth`, `requireSafety` |
| `PUT /api/profile` | `backend/index.ts` | `apps/api/src/routes/profile.ts` | `requireAuth` |
| `POST /api/setup-username` | `backend/index.ts` | `apps/api/src/routes/profile.ts` | `requireAuth`, `requireSafety` |
| `GET /api/users/search` | `backend/index.ts` | `apps/api/src/routes/profile.ts` | `requireAuth`, `requireSafety` |
| `GET /api/my/games` | `backend/index.ts` | `apps/api/src/routes/games.ts` | `requireAuth` |
| `GET /api/games` | `backend/index.ts` | `apps/api/src/routes/games.ts` | Public (filters private/unpublished games) |
| `POST /api/games` | `backend/index.ts` | `apps/api/src/routes/games.ts` | `requireAuth`, `requireSafety` |
| `POST /api/games/:id/like` | `backend/index.ts` | `apps/api/src/routes/games.ts` | `requireAuth`, `requireSafety`, `canAccessGameRoom` |
| `POST /api/games/:gameId/play` | `backend/index.ts` | `apps/api/src/routes/games.ts` | `requireAuth`, `canAccessGameRoom` |
| `POST /api/games/:gameId/complete` | `backend/index.ts` | `apps/api/src/routes/games.ts` | `requireAuth`, `requireSafety`, `canAccessGameRoom` |
| `GET /api/ai/usage` | `backend/index.ts` | `apps/api/src/routes/ai.ts` | `requireAuth`, `requireSafety` |
| `POST /api/neo/generate` | `backend/index.ts` | `apps/api/src/routes/ai.ts` | `requireAuth`, `requireSafety` |
| `POST /api/rewards/idea-starter` | `backend/index.ts` | `apps/api/src/routes/economy.ts` | `requireAuth`, `requireSafety` |
| `GET /api/tasks` | `backend/index.ts` | `apps/api/src/routes/economy.ts` | `requireAuth`, `requireSafety` |
| `POST /api/tasks/:id/claim` | `backend/index.ts` | `apps/api/src/routes/economy.ts` | `requireAuth`, `requireSafety` |
| `GET /api/ugc` | `backend/index.ts` | `apps/api/src/routes/economy.ts` | `requireAuth`, `requireSafety` |
| `POST /api/ugc` | `backend/index.ts` | `apps/api/src/routes/economy.ts` | `requireAuth`, `requireSafety` |
| `POST /api/ugc/:id/purchase` | `backend/index.ts` | `apps/api/src/routes/economy.ts` | `requireAuth`, `requireSafety` |
| `POST /api/ugc/:id/equip` | `backend/index.ts` | `apps/api/src/routes/economy.ts` | `requireAuth`, `requireSafety` |
| `POST /api/games/:gameId/gamepasses` | `backend/index.ts` | `apps/api/src/routes/economy.ts` | `requireAuth`, `requireSafety`, game owner check |
| `GET /api/gamepasses` | `backend/index.ts` | `apps/api/src/routes/economy.ts` | `requireAuth`, `requireSafety` |
| `POST /api/gamepasses/purchase` | `backend/index.ts` | `apps/api/src/routes/economy.ts` | `requireAuth`, `requireSafety`, `canAccessGameRoom` |
| `GET /api/badges` | `backend/index.ts` | `apps/api/src/routes/economy.ts` | `requireAuth`, `requireSafety` |
| `POST /api/badges` | `backend/index.ts` | `apps/api/src/routes/economy.ts` | `requireAuth`, `requireSafety` |
| `GET /api/blocks` | `backend/index.ts` | `apps/api/src/routes/social.ts` | `requireAuth`, `requireSafety` |
| `POST /api/blocks` | `backend/index.ts` | `apps/api/src/routes/social.ts` | `requireAuth`, `requireSafety` |
| `DELETE /api/blocks/:userId` | `backend/index.ts` | `apps/api/src/routes/social.ts` | `requireAuth`, `requireSafety` |
| `GET /api/friends` | `backend/index.ts` | `apps/api/src/routes/social.ts` | `requireAuth`, `requireSafety` |
| `POST /api/friends` | `backend/index.ts` | `apps/api/src/routes/social.ts` | `requireAuth`, `requireSafety`, guardian `allowFriendRequests` |
| `PUT /api/friend-requests/:id` | `backend/index.ts` | `apps/api/src/routes/social.ts` | `requireAuth`, `requireSafety` |
| `GET /api/moments` | `backend/index.ts` | `apps/api/src/routes/social.ts` | `requireAuth`, `requireSafety` |
| `POST /api/moments` | `backend/index.ts` | `apps/api/src/routes/social.ts` | `requireAuth`, `requireSafety`, guardian `allowMoments` |
| `GET /api/news` | `backend/index.ts` | `apps/api/src/routes/social.ts` | `requireAuth`, `requireSafety` |
| `POST /api/news` | `backend/index.ts` | `apps/api/src/routes/social.ts` | `requireAuth`, `requireSafety` |
| `GET /ws` | Legacy Hosted WS | `apps/api/src/routes/multiplayer.ts` | Authenticated session cookie/bearer |
| `POST /api/subscriptions` | `realtime-subscribers.ts` | `apps/api/src/routes/multiplayer.ts` | `requireAuth`, `requireMultiplayerSafety` |
| `POST /api/subscriptions/remove` | `realtime-subscribers.ts` | `apps/api/src/routes/multiplayer.ts` | `requireAuth`, `requireMultiplayerSafety` |
| `GET /api/multiplayer/:gameId` | `backend/index.ts` | `apps/api/src/routes/multiplayer.ts` | `requireAuth`, `requireMultiplayerSafety` |
| `POST /api/multiplayer/:gameId/join` | `backend/index.ts` | `apps/api/src/routes/multiplayer.ts` | `requireAuth`, `requireMultiplayerSafety` |
| `POST /api/multiplayer/:gameId/state` | `backend/index.ts` | `apps/api/src/routes/multiplayer.ts` | `requireAuth`, `requireMultiplayerSafety` |
| `POST /api/multiplayer/:gameId/leave` | `backend/index.ts` | `apps/api/src/routes/multiplayer.ts` | `requireAuth`, `requireMultiplayerSafety` |
| `GET /api/chat` | `backend/index.ts` | `apps/api/src/routes/multiplayer.ts` | `requireAuth`, `requireSafety`, guardian `allowChat` |
| `POST /api/chat` | `backend/index.ts` | `apps/api/src/routes/multiplayer.ts` | `requireAuth`, `requireSafety`, guardian `allowChat` |
| `POST /api/parental/invitations` | `backend/index.ts` | `apps/api/src/routes/parental.ts` | `requireAuth` |
| `POST /api/parental/invitations/accept` | `backend/index.ts` | `apps/api/src/routes/parental.ts` | `requireAuth`, exact guardian email match |
| `GET /api/parental/status` | `backend/index.ts` | `apps/api/src/routes/parental.ts` | `requireAuth` |
| `GET /api/parental/guardian/children` | `backend/index.ts` | `apps/api/src/routes/parental.ts` | `requireAuth` |
| `PUT /api/parental/children/:childId/multiplayer` | `backend/index.ts` | `apps/api/src/routes/parental.ts` | `requireAuth`, linked `guardianUserId` check |
| `PUT /api/parental/children/:childId/settings` | `backend/index.ts` | `apps/api/src/routes/parental.ts` | `requireAuth`, linked `guardianUserId` check |
| `POST /api/reports` | `backend/index.ts` | `apps/api/src/routes/safety-admin.ts` | `requireAuth`, `requireSafety` |
| `POST /api/privacy/deletion-requests` | `backend/index.ts` | `apps/api/src/routes/safety-admin.ts` | `requireAuth` |
| `GET /api/admin/overview` | `backend/index.ts` | `apps/api/src/routes/safety-admin.ts` | `requireAuth`, `requireDoriaAdmin` |
| `GET /api/admin/games` | `backend/index.ts` | `apps/api/src/routes/safety-admin.ts` | `requireAuth`, `requireDoriaAdmin` |
| `PUT /api/admin/games/:id` | `backend/index.ts` | `apps/api/src/routes/safety-admin.ts` | `requireAuth`, `requireDoriaAdmin` |
| `GET /api/admin/users` | `backend/index.ts` | `apps/api/src/routes/safety-admin.ts` | `requireAuth`, `requireDoriaAdmin` |
| `PUT /api/admin/users/:id/plus` | `backend/index.ts` | `apps/api/src/routes/safety-admin.ts` | `requireAuth`, `requireDoriaAdmin` |
| `GET /api/admin/reports` | `backend/index.ts` | `apps/api/src/routes/safety-admin.ts` | `requireAuth`, `requireDoriaAdmin` |
| `PUT /api/admin/reports/:id` | `backend/index.ts` | `apps/api/src/routes/safety-admin.ts` | `requireAuth`, `requireDoriaAdmin` |
| `GET /api/admin/privacy-requests` | `backend/index.ts` | `apps/api/src/routes/safety-admin.ts` | `requireAuth`, `requireDoriaAdmin` |
| `PUT /api/admin/privacy-requests/:id` | `backend/index.ts` | `apps/api/src/routes/safety-admin.ts` | `requireAuth`, `requireDoriaAdmin` |
| `DELETE /api/admin/content/:type/:id` | `backend/index.ts` | `apps/api/src/routes/safety-admin.ts` | `requireAuth`, `requireDoriaAdmin` |
