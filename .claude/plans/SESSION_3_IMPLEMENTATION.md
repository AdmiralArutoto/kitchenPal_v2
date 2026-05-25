# KitchenPal — Implementation Plan

## Purpose

This is the master roadmap for building KitchenPal. The product spec, architecture, and non-negotiable rules live in [.claude/plans/SESSION_2_SPEC.md](.claude/plans/SESSION_2_SPEC.md) — read that first; this document does not repeat it.

This file: implementation stages, project structure, tooling choices, and pointers to per-stage sub-plans.

**How sub-plans work.** When a stage is ready to execute, a sibling sub-plan file is added at `.claude/plans/stage-N-name.md` with concrete code-level steps (file paths, exact commands, snippet sketches). Sub-plans are written and approved one stage at a time — don't pre-write Stage 4 while Stage 1 is still in progress.

---

## Prerequisites

Setup the agent can't do itself (Supabase project, MCP installs, API keys, Figma file, Vercel) lives in [STARTUP.md](../../STARTUP.md). Each item there is tagged with the stage that needs it.

**Hard blockers:**
- Stage 1 needs Supabase project credentials in `.env`.
- Stage 2 needs the Supabase MCP installed and authenticated.
- Stage 3 needs an OpenAI API key with `gpt-4o` / `gpt-4o-mini` access.
- Stages 4-6 need the Figma MCP installed and the Figma file URL recorded in CLAUDE.md.
- Stage 7 needs the Vercel project linked.

---

## Stack & Tooling

| Concern | Choice |
|---|---|
| Language | TypeScript everywhere (backend + frontend) |
| Package manager | npm with workspaces |
| Backend runtime | Node 18+, Express 5, deployed as a single Vercel serverless function via `@vercel/node` |
| Frontend | React 18 + Vite + React Router v6 |
| Styling | Tailwind CSS (no UI component library) |
| ORM | Prisma 6+ |
| Validation | Zod (request bodies + AI response shapes) |
| Tests | Vitest (single config story for both packages) |
| Lint / format | ESLint + Prettier (shared config at root) |
| Logging | Pino + pino-http (backend) |
| Design source | Figma file accessed via Figma MCP (reference-only — agent reads frames and tokens, writes Tailwind by eye; no codegen) |
| AI SDK | `openai` (official Node SDK) |

---

## Project Structure

```
kp/
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── src/
│   │       ├── index.ts            # Vercel handler entry
│   │       ├── app.ts              # Express app factory
│   │       ├── lib/
│   │       │   ├── prisma.ts       # PrismaClient singleton (serverless-safe)
│   │       │   ├── supabase.ts     # Supabase admin client (JWT verify)
│   │       │   └── openai.ts       # OpenAI client + prompt helpers
│   │       ├── middleware/
│   │       │   ├── auth.ts         # JWT verify + profile upsert
│   │       │   └── errors.ts       # Centralized error handler + HttpError
│   │       ├── routes/
│   │       │   ├── profile.ts
│   │       │   ├── recipes.ts
│   │       │   └── ai.ts
│   │       ├── schemas/            # Zod schemas (req bodies + AI responses)
│   │       │   ├── recipe.ts
│   │       │   └── ai.ts
│   │       └── tests/
│   │           ├── profile.test.ts
│   │           ├── recipes.test.ts
│   │           └── ai.test.ts
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── vitest.config.ts
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx             # Router root + auth provider
│           ├── index.css           # Tailwind directives
│           ├── lib/
│           │   ├── supabase.ts     # Supabase Auth (browser)
│           │   └── api.ts          # typed fetch wrapper, attaches JWT
│           ├── contexts/
│           │   └── AuthContext.tsx
│           ├── routes/
│           │   ├── Auth.tsx
│           │   ├── VerifyEmail.tsx
│           │   ├── Home.tsx
│           │   ├── Catalog.tsx
│           │   └── About.tsx
│           ├── components/
│           │   ├── Nav.tsx
│           │   ├── ProtectedRoute.tsx
│           │   ├── GuidedFlow.tsx
│           │   ├── DraftCard.tsx
│           │   ├── RecipeCard.tsx
│           │   ├── RecipeModal.tsx
│           │   ├── ServingScaler.tsx
│           │   ├── AddRecipeModal.tsx
│           │   └── Toast.tsx
│           ├── hooks/
│           │   └── useApi.ts
│           └── types/
│               └── api.ts          # request/response type contracts
├── .claude/
│   └── plans/
│       ├── SESSION_2_SPEC.md       # product + architecture spec
│       ├── SESSION_3_IMPLEMENTATION.md   # this file
│       └── stage-N-name.md         # added per stage as work begins
├── .env.example
├── .gitignore
├── .eslintrc.cjs                   # shared root config
├── .prettierrc
├── package.json                    # workspaces root + dev scripts
├── tsconfig.base.json              # shared TS compiler options
├── README.md
└── CLAUDE.md                       # living memory
```

---

## Cross-cutting conventions

Things that apply across every stage and should not be re-decided per sub-plan.

### Type contracts
- `apps/web/src/types/api.ts` mirrors backend request/response shapes (Recipe, Draft, ProfileResponse, etc.). For MVP it is hand-maintained; a later pass can codegen it from Zod schemas.
- Zod schemas in `apps/api/src/schemas/` are the source of truth for request bodies AND AI response shapes. Use `z.infer<typeof Schema>` to derive the TS type — never declare a second interface alongside.

### Auth + tenancy enforcement
- Every protected route uses the `authMiddleware` from `apps/api/src/middleware/auth.ts`, which (1) verifies the JWT via the Supabase admin client, (2) upserts the profile row for the user, (3) attaches `req.userId: string` to the request object.
- Every Prisma query against `Recipe` MUST include `where: { userId: req.userId }` (extending it with the resource ID for single-record routes). There is no shortcut. Reviews check this explicitly.

### Error handling
- Routes throw `HttpError(status, message)` from `apps/api/src/middleware/errors.ts`. The error middleware catches and serializes to `{ error: string }`.
- Zod parse failure → HTTP 400 with the Zod issue summary.
- OpenAI client timeout → HTTP 504. JSON-parse failure or shape-mismatch → HTTP 500. The server never crashes on AI output.

### Testing
- One Vitest config story across the repo; individual `vitest.config.ts` per app inherits root defaults.
- Express routes: spin up the app via `supertest` against the Express factory in `app.ts`. One happy-path test + one missing-auth test per route minimum.
- Frontend: component tests with `@testing-library/react` for non-trivial logic (GuidedFlow state machine, ServingScaler rounding). Pure render does not need a test.
- AI route tests mock the OpenAI client — never call live.

### Logging
- `pino-http` attaches a request logger to every Express request. Routes use `req.log.info(...)` for structured logs.
- No `console.log` in committed code.

---

## Implementation Stages

Each stage gets its own sub-plan at `.claude/plans/stage-N-name.md`. Mark a stage complete by checking its box below and updating CLAUDE.md.

Each sub-plan must include: goal, file-by-file changes with exact paths, commands to run, the verification check that proves the stage works, and a note on what is deliberately deferred to a later stage.

### [x] Stage 1 — Foundation
**Goal:** Replace the current `backend/` scaffold with the workspaces layout above; install all top-level tooling.

**Deliverables:**
- Delete `backend/` entirely. Replace with `apps/api/` (empty `src`, `package.json` with the deps in §Stack) and `apps/web/` (Vite + React + TS scaffold).
- Root `package.json` with `"workspaces": ["apps/*"]` and dev scripts (`dev`, `build`, `test`, `lint`).
- `tsconfig.base.json` with strict mode on; per-app tsconfigs extend it.
- Tailwind installed and a smoke-test `index.css` proving Tailwind compiles in `apps/web`.
- `.env.example` listing every variable from SPEC §9 with placeholder values.
- `.gitignore` covers `node_modules/`, `.env`, `dist/`, `.vercel/`.
- `concurrently` set up so `npm run dev` at root spins up both servers.

**Verification:**
- `npm install` at root succeeds.
- `npm run dev` starts both servers; Vite serves a blank Tailwind-styled page; Express responds 200 on `/api/health` (single placeholder route).
- `npm test` runs (empty test suite passes).

**Sub-plan:** `.claude/plans/stage-1-foundation.md`

### [x] Stage 2 — Database & backend skeleton
**Goal:** Prisma owns the schema; Express has auth + profile-upsert middleware; nothing app-specific yet.

**Deliverables:**
- `apps/api/prisma/schema.prisma` matching SPEC §4 exactly.
- Initial migration committed.
- `apps/api/src/lib/prisma.ts` exports a PrismaClient singleton (serverless-safe — cache on `globalThis` in dev to avoid reconnect loops).
- `apps/api/src/lib/supabase.ts` exports the admin client.
- `apps/api/src/middleware/auth.ts` verifies the JWT, upserts the profile row, attaches `req.userId`.
- `apps/api/src/middleware/errors.ts` provides `HttpError` and the error middleware.
- `apps/api/src/app.ts` wires Express + middleware + a single `/api/health` placeholder behind auth.
- `apps/api/src/index.ts` exports the Vercel handler.
- One integration test: unauthenticated request → 401; authenticated request → 200 and profile row exists in DB.

**Verification:**
- `npx prisma migrate dev` from `apps/api/` creates `profiles` and `recipes` tables in Supabase.
- Supabase MCP confirms both tables exist with expected columns.
- The integration test passes.

**Sub-plan:** `.claude/plans/stage-2-database-skeleton.md`

### [x] Stage 3 — Backend API routes
**Goal:** All Express routes implemented and tested. Backend is feature-complete from an API perspective.

**Deliverables:**
- `apps/api/src/routes/profile.ts` — GET, PUT.
- `apps/api/src/routes/recipes.ts` — GET (with `search`/`tags`/`sort` per SPEC §6), GET :id, POST, PUT :id, DELETE :id. All scoped by `req.userId`.
- `apps/api/src/routes/ai.ts` — `generate-drafts`, `generate-full` (accepts optional `comment`), `modify`. Each uses OpenAI JSON mode, 9s timeout, Zod validation of OpenAI response, 504/500 error mapping.
- `apps/api/src/lib/openai.ts` — client + small helpers for "append preferences to prompt" and "validate JSON response against schema".
- Zod schemas in `apps/api/src/schemas/`.
- Vitest tests: happy-path + missing-auth for each route. AI route tests mock the OpenAI client.

**Verification:**
- All Vitest tests pass.
- Manual smoke test via curl/Postman against `npm run dev`: create a recipe, list with each query combo, modify via AI (with mock or live key), delete.

**Sub-plan:** `.claude/plans/stage-3-backend-routes.md`

### [x] Stage 4 — Frontend scaffold + auth + About
**Goal:** Minimum viable authenticated experience. User can sign up, verify email, log in, see their name, edit their profile, log out.

**Deliverables:**
- **Design source:** the Figma file linked from CLAUDE.md. Use the Figma MCP to fetch the relevant frames before implementing each screen/component. Read tokens (colors, spacing, fonts) from Figma, write idiomatic Tailwind.
- React Router v6 routes per SPEC §5 (Auth, VerifyEmail, Home placeholder, Catalog placeholder, About).
- `apps/web/src/contexts/AuthContext.tsx` — Supabase Auth state + `useAuth` hook.
- `apps/web/src/components/ProtectedRoute.tsx` — redirects unauthenticated → `/`; unverified → `/verify-email`.
- `apps/web/src/components/Nav.tsx` — top nav with display name + Logout, persistent.
- `apps/web/src/lib/api.ts` — typed `apiFetch<T>(path, init?)` that attaches `Authorization: Bearer <jwt>`.
- Auth screen with login/signup toggle.
- VerifyEmail screen with resend button.
- About screen with name + preferences + Logout, hitting GET/PUT `/api/profile`.

**Verification:**
- Sign up → verify email screen → click link → log in → land on `/home` (placeholder).
- About screen reads and writes profile data; reload preserves changes.
- Logout returns to `/`.

**Sub-plan:** `.claude/plans/stage-4-frontend-scaffold.md`

### [x] Stage 5 — Frontend Home: generation flow
**Goal:** End-to-end recipe generation. User can prompt, see drafts, pick a draft, see a full recipe, regenerate with a comment, and approve to save.

**Deliverables:**
- **Design source:** the Figma file linked from CLAUDE.md. Use the Figma MCP to fetch the relevant frames before implementing each screen/component. Read tokens (colors, spacing, fonts) from Figma, write idiomatic Tailwind.
- `apps/web/src/routes/Home.tsx` — page layout.
- `apps/web/src/components/GuidedFlow.tsx` — sequential single-choice state machine (Meal type → Cuisine → Dietary → Vibe), emitting pills.
- Text field with pills + free text; Generate button.
- `apps/web/src/components/DraftCard.tsx`.
- Full-recipe display + action buttons (Delete, Edit, Regenerate, Approve).
- Regenerate-with-comment inline flow calling `generate-full` with `{ input: currentRecipe, comment }`.
- `apps/web/src/components/Toast.tsx` for the Approve success toast.

**Verification:**
- Generate produces 3 drafts; clicking one shows a full recipe; Regenerate-with-comment refines it; Approve saves it to the catalog.
- Preferences from About screen are reflected in generation results (manual eyeball check).

**Sub-plan:** `.claude/plans/stage-5-frontend-home.md`

### [x] Stage 6 — Frontend Catalog: vault, scaler, modifier
**Goal:** Full catalog with all interactions: list, search/sort/filter, view, edit, scale, modify with AI, add manually, delete.

**Deliverables:**
- **Design source:** the Figma file linked from CLAUDE.md. Use the Figma MCP to fetch the relevant frames before implementing each screen/component. Read tokens (colors, spacing, fonts) from Figma, write idiomatic Tailwind.
- `apps/web/src/routes/Catalog.tsx` — grid layout, search bar, sort dropdown, filter button.
- `apps/web/src/components/RecipeCard.tsx` — emoji, name, description, tags, inline Edit/Delete.
- `apps/web/src/components/RecipeModal.tsx` — full recipe display + Edit / Delete / Modify with AI actions.
- `apps/web/src/components/ServingScaler.tsx` — +/- buttons, live amount updates, nearest-0.25 rounding, view-only.
- AI Modifier flow inside `RecipeModal`: comment field, in-place update, Approve / Discard.
- `apps/web/src/components/AddRecipeModal.tsx` — manual creation form, all fields per SPEC §5.3.

**Verification:**
- Every SPEC §10 "Recipe Vault", "AI Modifier", and "Serving Scaler" checkbox can be ticked locally.
- Cross-user check: a second user account does not see the first user's recipes.

**Sub-plan:** `.claude/plans/stage-6-frontend-catalog.md`

### [x] Stage 8 — Recipe Images (DALL-E 3 + Supabase Storage)
**Goal:** AI-generated recipes auto-get a DALL-E 3 image after Approve. Manual recipes get an upload-or-generate picker. Storage in Supabase Storage `recipe-images` (public, UUID keys). Provider abstraction ready for Flux 1.1 Pro swap.

**Deliverables shipped:**
- Schema: `imageUrl String? @map("image_url")` on Recipe (migration `add_recipe_image_url`).
- `apps/api/src/lib/storage.ts` — Supabase Storage upload/delete + key helpers.
- `apps/api/src/lib/image-provider.ts` — `ImageProvider` interface, DALL-E 3 impl, Flux stub.
- `apps/api/src/lib/openai.ts` — `buildImagePrompt` helper.
- Three new routes under `/api/recipes/:id/image/{generate,upload}` + `DELETE /api/recipes/:id/image`. Existing recipe DELETE cleans up the storage object too.
- `multer` for multipart parsing (5MB cap, MIME allowlist).
- Frontend: `useGenerateImage` / `useUploadImage` / `useRemoveImage` hooks. RecipeCard + RecipeModal render `imageUrl` with emoji-gradient fallback. AddRecipeModal grows an image picker (Upload / Generate with AI / Skip). RecipeModal view mode has Regenerate/Upload/Remove action row. Home.onApprove fires `generateImageMutation` on success.
- `apiFetch` skips `Content-Type` for `FormData` bodies.

**Deferred:**
- Flux 1.1 Pro impl (interface ready; env var `IMAGE_PROVIDER=flux` throws 501 until built).
- Vercel deploy timeout workaround (Pro tier or worker queue) — out of scope while Stage 7 is parked.
- "Generating image…" status indicator on cards.

**Sub-plan:** `C:\Users\Admiral\.claude\plans\review-plans-session-2-merry-alpaca.md`

### [x] Stage 9 — Daily Recipe Rotation
**Goal:** Replace the mock Featured Recipes section with a real daily-discovery feed: 6 recipes per user per UTC day, generated lazily by combining TheMealDB random meals + OpenAI normalization + auto-generated images. Cards have Save / Modify / Dismiss.

**Deliverables shipped:**
- Schema: new `DailyBatch` model with `@@unique([userId, batchDate])` (migration `add_daily_batches`); `daily_rotation` added to source enum (Zod + frontend types).
- `apps/api/src/lib/themealdb.ts` — `fetchRandomMeal()` with 5s timeout.
- `apps/api/src/lib/openai.ts` — `NORMALIZE_MEAL_SYSTEM_PROMPT` + `buildNormalizePrompt` (handles skip-on-prefs-conflict).
- `apps/api/src/lib/storage.ts` — `buildDailyBatchKey()` for `daily-batches/{userId}/{batchDate}-{slot}-{uuid}.png`.
- `apps/api/src/routes/recommendations.ts` + mount in `app.ts`. Parallel 6-slot generation with skip+retry (max 3 per slot) and best-effort image gen (null on failure). P2002 race fallback.
- `apps/api/src/tests/recommendations.test.ts` — 7 new tests; 65/65 backend total.
- Frontend: `useRecommendations` hook (date-in-key strategy), `RecommendationCard` (Save/Modify/Dismiss + inline modify panel), `DailyRotationFeed` (6 skeleton cards while loading), Home.tsx swaps Featured Recipes for the feed.

**Deferred:**
- Persistent dismissal (local-only by user decision).
- Pre-warm next day's batch (no cron).
- Cleanup of orphaned daily-batch image blobs after rollover (~600KB/day/user — negligible).
- Past-rotations history view (rows are kept, data is there if a future feature needs it).
- Image regeneration on Modify (saves ~$0.005 + 10-30s per Modify; user can regen from recipe modal after save).

**Sub-plan:** `C:\Users\Admiral\.claude\plans\review-plans-session-2-merry-alpaca.md`

### [ ] Stage 7 — Deployment
**Goal:** Live on Vercel. All MVP success criteria pass against the deployed app.

**Deliverables:**
- Vercel project configured (root directory = repo root; build command per SPEC §9 adapted for workspaces).
- All env vars from SPEC §9 set in Vercel for Production/Preview/Development.
- `vercel.json` if needed to route `/api/*` to the API handler and serve `apps/web/dist` as static.
- Real SMTP provider configured in Supabase Auth (Resend or Brevo).
- README updated with: local dev setup, how to deploy, how to add a migration.

**Verification:**
- Every checkbox in SPEC §10 ticked against the live deployment.
- Cold-start latency on first AI route call is under 10s (or move to Pro and document the decision in CLAUDE.md).

**Sub-plan:** `.claude/plans/stage-7-deployment.md`

---

## Done

The MVP is **done** when every box in [.claude/plans/SESSION_2_SPEC.md](.claude/plans/SESSION_2_SPEC.md) §10 is checked against the deployed app, and every stage above is checked. Tag the commit `v0.1.0-mvp`.

Out-of-scope work (per SPEC §11) is not done — explicitly. Recipe import via URL or image is the only stretch that may follow.

---

## Post-MVP: Image uploads

User-uploaded recipe images are out of MVP scope (SPEC §11), but the technical path is pre-decided so the migration is mechanical when the feature lands:

- Bucket: Supabase Storage `recipe-images`. Configure via `SUPABASE_STORAGE_BUCKET` env var.
- Schema: add `imageUrl String?` to `Recipe`. New Prisma migration, no breaking change.
- Backend: two new routes — `POST /api/storage/upload-url` (returns signed upload URL) and `DELETE /api/storage/:objectKey`. Recipe DELETE also deletes the object.
- Frontend: AddRecipeModal and RecipeModal Edit mode grow an image picker; RecipeCard and RecipeModal display `imageUrl` when present, fall back to emoji-on-background otherwise.
- Estimated effort: ~half a stage. Slot between Stage 6 and Stage 7 when scoped.

See also: [STARTUP.md](../../STARTUP.md) → "Post-MVP: Supabase Storage".
