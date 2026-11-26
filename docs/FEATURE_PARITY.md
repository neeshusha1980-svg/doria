# Feature Parity Matrix

| Feature | Status | Notes |
| :--- | :--- | :--- |
| Discover & Genre/Search Filters | Implemented | Preserved UI, Unsplash thumbnails, like toggles, cursor pagination. |
| Doria Studio & Baseplate Editor | Implemented | Three.js 24x24 grid builder with 10 procedural object types. |
| PlayCanvas Voxel Endless Runner | Implemented | 3 lanes, 1st/3rd person camera, touch controls, gamepass modifiers, live multiplayer avatars. |
| PlayCanvas Saved Baseplate Viewer | Implemented | Renders up to 500 saved `sceneData` objects with rotating crystals. |
| CSP-Sandboxed HTML & Neo Games | Implemented | Strict `Content-Security-Policy` injected inside `<iframe sandbox="allow-scripts">`. |
| Avatar Studio & UGC Marketplace | Implemented | PlayCanvas avatar preview + Three.js 24-part 3D wearable builder & shop. |
| Badges & Trophies | Implemented | 5 account milestones + 41 SVG medals + custom badges with S3-backed uploads. |
| Friends & Bidirectional Blocking | Implemented | Consent-based friend requests, guardian switches, and mutual block enforcement. |
| In-Game Live Chat | Implemented | REST + native WebSocket room subscriptions, gated by guardian `allowChat`. |
| Doria Moments & News | Implemented | S3 signed URL video Moments ($\le 7	ext{ MB}$) and News posts with attachments. |
| Starlits & Daily Quests | Implemented | Server-validated daily missions (`daily-checkin`, `like-a-world`, `publish-a-world`, `design-ugc`). |
| Parental Controls & Guardian Dashboard | Implemented | SHA-256 single-use email invites, email-matched acceptance, supervised multiplayer toggle. |
| Moderation & Privacy Deletion Queue | Implemented | Verified-email admin allowlist, report resolution, content deletion, manual deletion requests. |
| Neo AI Game Builder | Implemented | Server-side provider adapter (`openai`, `anthropic`, `gemini`, `openai-compatible`) with usage rollback. |
