# CLAUDE.md — KitchenPal Living Memory

**Source-of-truth specs:** base architecture [.claude/plans/SESSION_2_SPEC.md](.claude/plans/SESSION_2_SPEC.md) · roadmap [.claude/plans/SESSION_3_IMPLEMENTATION.md](.claude/plans/SESSION_3_IMPLEMENTATION.md) · import feature [.claude/plans/IMPORT_FEATURE_SPEC.md](.claude/plans/IMPORT_FEATURE_SPEC.md) · setup the agent can't do [STARTUP.md](STARTUP.md).
**Decision log (the dated "why"):** [.claude/DECISIONS.md](.claude/DECISIONS.md).

This file is the **current state** of the work + the live **architecture** (kept accurate by editing in place), plus error patterns and gotchas. It is NOT a changelog — dated history lives in the decision log.

---

## Maintaining this memory (read first)

**After any notable change or decision, before ending the turn:**
1. **Append a dated entry to [.claude/DECISIONS.md](.claude/DECISIONS.md)** — template `**[YYYY-MM-DD] — Short title**` then the *why*: what was chosen, the alternative rejected, and how to apply / what not to undo. Append at the bottom; never rewrite past entries.
2. **If the change alters the architecture, update the matching `## Architecture` bullet below IN PLACE** to reflect reality — do NOT append a dated block to this file.
3. **Refresh `## Current State`** (status / last session / next action) each session.
4. Record new gotchas under `Error Patterns` / `Undocumented Dependencies` / `Spec Conflicts`.

"Notable" = anything a future agent could undo by accident, any non-obvious trade-off, any new dependency/route/pattern. Skip trivial/self-evident changes. (These are model-followed conventions, not harness-enforced.)

---

## Current State

```
Status: Recipe Import — Phase 1 shipped (websites + manual paste). PRODUCT SHIFT: center of gravity moving from AI-generation toward import-and-store; Import is now the headline feature, generation/modification secondary. "+ Add Recipe" on Catalog now opens an intake chooser (Import / Create / Generate, import-first) instead of jumping straight to the manual form. Import flow: paste URL → POST /api/import (Node-only) classifies the host, fetches HTML, parses schema.org JSON-LD (with @graph walk) → maps to KitchenPal draft; ingredient strings parsed regex-first → gpt-4o-mini fallback. No JSON-LD → strips chrome and sends cleaned text to gpt-4o-mini extraction. VIDEO URLs: YouTube → extractFromVideo (Supadata transcript API, mode=auto, text=true → extraction LLM). Instagram/TikTok → Apify (scrapes caption + comments — where the recipe usually is) run ASYNC: /api/import starts the Apify run + returns {runId,datasetId} (202), the client polls /api/import/poll (no DB; stateless), and on SUCCEEDED the server runs a LAZY CASCADE (link in caption/creator-comment → extractFromWebsite | else caption+top-5-comments → LLM | else Supadata transcript merge), stopping at the first complete recipe (≥2 ingredients + ≥1 step). Comments are authoritative over transcript (IMPORT_SOCIAL_SYSTEM_PROMPT). Failures (no transcript, blocked, async >~40s budget) surface as 422 → UI auto-switches to the manual fallback. The fallback view (ImportModal `paste` phase) is a TabToggle: "Paste text" (POST /api/import/text, works for every platform) and "Screenshot" (POST /api/import/image — multipart upload → gpt-4o-mini VISION extraction with an optional user note, image never stored). Draft is reviewed in the shared RecipeEditForm and saved via the existing POST /api/recipes with source:'imported' + sourceUrl/sourcePlatform/sourceCreator. Attribution strip ("From {creator} · {host}") shows in the import draft and in RecipeModal view mode for imported recipes. Progress UX shows REAL server-driven stages: website/YouTube STREAM stages over SSE (POST /api/import → text/event-stream: fetching → reading-structured|ai-extracting → parsing-ingredients; fetching-transcript → transcribing → extracting), and IG/TikTok report real coarse stages via the poll (queued/scraping → extracting → done, cascade runs on a finalize:true poll). lib/sse.ts + an onStage callback threaded through the extractors; ImportModal renders the live stages (see .claude/stages/stage-import-progress.md). Build clean (api + web); 100/100 backend tests green.
STAGE 7 (Vercel deploy) DONE & WORKING: single Vercel project — Vite SPA static + the Express app as ONE serverless function (`api/index.ts`), Hobby, `maxDuration: 60`, prod DB = same Supabase project as dev (build runs `prisma generate` only). Four cold-start blockers fixed in order (see DECISIONS [2026-05-29]): Vercel Root Directory, ESM/CJS dynamic-import shim, Node 22 for Supabase WebSocket, Prisma engine includeFiles. WORKFLOW: develop on `dev` branch → pushes auto-build PROTECTED previews (Vercel Standard Protection, free); `main` is the promote-when-ready production branch (NOT pushed yet). Production protection is Pro-only on Hobby, so we stay preview-only (private) until launch; at launch, set the Supabase signup policy.
Last session: Session 30 — docs refactor (split CLAUDE.md: current-state Architecture here, dated decision log → .claude/DECISIONS.md).
Next action: Push `dev` to the Vercel preview and VERIFY SSE STREAMS INCREMENTALLY there (the open risk — Vercel/proxy buffering; locally it streams fine). Confirm website/YouTube show live stages and IG/TikTok show scraping→extracting→done. Daily rotation under 60s still NOT proven under load (likely a shared-DB cache hit) — watch the first-of-day cold generation. DEFERRED: granular IG/TikTok cascade sub-stages; SSE for paste/screenshot; YouTube creator-metadata enrichment.
Open questions: None active.
```

---

## Architecture

> How the system works **now**. Edit in place as it changes. Rationale/history → [.claude/DECISIONS.md](.claude/DECISIONS.md).

### Stack & layout
- **npm workspaces** monorepo: `apps/api` (Express 5, ESM — imports use `.js` extensions) + `apps/web` (Vite + React 18 + react-router-dom). Root `npm run dev` runs both via `concurrently` (tsx watch on :3001 + Vite, `/api/*` proxied to :3001).
- **Tailwind v4** via `@tailwindcss/vite`; theme tokens live in `apps/web/src/index.css` `@theme` (no `tailwind.config`, no hex literals in JSX). ESLint v9 flat config at repo root.
- **Env:** root `.env` is the single source; backend scripts wrapped with `dotenv -e ../../.env`; Vite reads it via `envDir: '../..'`. Core keys (`SUPABASE_*`, `OPENAI_API_KEY`) throw at module import; service keys (`SUPADATA_API_KEY`, `APIFY_TOKEN`) are read **at call time / fail-soft** — a missing one disables only that feature, not the whole function.

### Backend (`apps/api/src`)
- Routes throw `HttpError(status, msg)` → error middleware → `{ error }`. `authMiddleware` verifies the Supabase JWT, upserts the `Profile`, sets `req.userId` / `req.userEmail`; every route except `GET /api/health` is authed.
- **Tenancy is app-layer; Supabase RLS is OFF** — every query is scoped to `req.userId`. Don't enable RLS without updating every route + a DECISIONS entry.
- **Zod schemas in `schemas/` are the source of truth** — types via `z.infer`, never hand-declared interfaces.
- **OpenAI** via `lib/openai.ts` `callOpenAIJson` / `callOpenAIVisionJson` (share a private `completeJson`, JSON mode). Client `timeout: 30_000, maxRetries: 1`; import calls pass an explicit `timeoutMs` (→ single attempt, bounded). Model split: `gpt-4o-mini` (drafts, import extraction, vision) vs `gpt-4o` (generate-full, modify, daily-rotation normalize).

### Data model (Prisma → Supabase Postgres)
- `Recipe` (content fields + `source` ∈ `manual|ai_generated|ai_modified|daily_rotation|imported` + `source_url/platform/creator` + `image_url`), `Profile` (preferences), `DailyBatch` (per-user per-UTC-day cache). Migrations are applied **locally** (`prisma migrate dev`) against the shared cloud DB (dev and prod share one Supabase project).

### Recipe import — the headline feature → [IMPORT_FEATURE_SPEC.md](.claude/plans/IMPORT_FEATURE_SPEC.md)
- "+ Add Recipe" → `AddRecipeChooser` (Import / Create / Generate). `classifyUrl` routes:
  - **website** → JSON-LD (schema.org, `@graph` walk) else strip-chrome → LLM; **YouTube** → Supadata transcript → LLM. Both **synchronous** and **stream real stages over SSE**.
  - **Instagram / TikTok** → Apify, **async start + client poll** (no DB; Apify holds the run), then a **lazy cascade** — link in caption/creator-comment → `extractFromWebsite` | caption + top-5 comments → LLM | Supadata transcript merge — stopping at the first complete recipe (≥2 ingredients + ≥1 step). IG recipe lives in the pinned comment; TikTok in the description.
  - **paste text** / **screenshot (vision)** = manual fallbacks (offered automatically on any failure).
- Drafts are **never persisted by import routes** — reviewed in `RecipeEditForm`, saved via `POST /api/recipes` (`source:'imported'` + `source_*`). `SourceAttribution` strip shows on imported recipes.

### AI generation & daily rotation
- Home GenBar: `generate-drafts → generate-full → modify` (now **secondary** to import). Daily rotation: `GET /api/recommendations` — lazy per-UTC-day `DailyBatch` (TheMealDB → normalize LLM → image), cached; first-of-day ~30–60s, then instant.
- **Images:** `lib/image-provider.ts` (`IMAGE_PROVIDER` env, `gpt-image-1-mini`), public `recipe-images` bucket with unguessable keys; generated in the background after save.

### Frontend (`apps/web/src`)
- `lib/api.ts` `apiFetch` / `authedFetch` attach the JWT and throw `ApiError`. **React Query** single `['recipes']` cache + optimistic mutations (snapshot → apply → reconcile/rollback) in `hooks/useRecipes.ts`. `ToastProvider` at the app root. **`RecipeEditForm` is THE single recipe form** (add / edit / import-review all render it). New UI goes through the `figma-translation` skill (reuse `components/index.ts`, `@theme` tokens, no hex in JSX).

### Deployment → DECISIONS [2026-05-29], [stages/stage-import-progress.md](.claude/stages/stage-import-progress.md)
- **One Vercel project:** Vite SPA static (`apps/web/dist`) + the Express app as a **single serverless function** (`api/index.ts` dynamic-imports the built ESM app — CJS-can't-require-ESM shim). Hobby, `maxDuration: 60`, **Node 22** (Supabase needs a global WebSocket), Prisma `binaryTargets` incl. `rhel-openssl-3.0.x` + `vercel.json` `includeFiles`. Prod DB = dev DB → build runs `prisma generate` only. `vercel.json` rewrites `/api/(.*) → /api/index` + SPA fallback.
- **Workflow:** develop on `dev` → auto-built **protected previews**; `main` = promote-when-ready production (not pushed). Hobby has no production protection, so we stay preview-only/private until launch (then set the Supabase signup policy). Env vars must be enabled for the **Preview** environment too.

---

## Error Patterns

> Errors, causes, fixes. Added when encountered.

**Prisma `EPERM ... rename ... query_engine-windows.dll.node` on Windows**
The VSCode TypeScript Server (a `node.exe` child) loads the Prisma client DLL for IntelliSense and holds an exclusive Windows file lock. `prisma generate` writes to a `.tmp` then renames over the existing DLL — the rename fails. Reloading the VSCode window does NOT release the lock because the new TS Server respawns and re-opens the DLL immediately. Fix: find the holding PID with `Get-Process node | Where-Object Modules.FileName -like '*query_engine-windows*'` and `taskkill //PID <pid> //F` (Git Bash needs double slashes); the TS server respawns on demand and IntelliSense is unaffected. The migration itself always applies regardless — only the generated client code is blocked.

---

## Undocumented Dependencies

> Libraries or config not in the spec but required for things to work. Added when discovered.

---

## Spec Conflicts

> Conflicts between the spec and observed reality, with the resolution. Don't silently deviate.
