# CLAUDE.md — KitchenPal Living Memory

**Source of truth for product, architecture, and rules:** [.claude/plans/SESSION_2_SPEC.md](.claude/plans/SESSION_2_SPEC.md).
**Implementation roadmap:** [.claude/plans/SESSION_3_IMPLEMENTATION.md](.claude/plans/SESSION_3_IMPLEMENTATION.md).
**Setup the agent can't do (MCPs, API keys, Vercel, Figma file):** [STARTUP.md](STARTUP.md).

This file is for what doesn't belong in the spec — decisions made during implementation, errors and their fixes, undocumented dependencies, and the current state of the work. Update it the moment you learn something a future agent would have wanted to know.

---

## Current State

```
Status: Stage 2 complete. Prisma schema + initial migration applied to Supabase (profiles + recipes tables). Auth middleware verifies JWT + upserts profile; centralized error handling; /api/health public, /api/me authed. 4/4 unit tests green.
Last session: Session 9 — Stage 2 (Database & backend skeleton)
Next action: Begin Stage 3 (Backend API routes). Requires OPENAI_API_KEY in .env (STARTUP.md item 3) before AI routes can be smoke-tested live.
Open questions: None.
```

---

## Architecture Decisions

> Decisions not obvious from the spec, with the reason. A future agent reads this before silently undoing one.

**[2026-05-23] — Profile row creation = backend middleware upsert**
Every authenticated request runs `prisma.profile.upsert` for the JWT's `user_id` before reaching route logic. Alternative was a Supabase database trigger (no backend round-trip on signup), rejected because triggers require out-of-band SQL applied through the dashboard or CLI — breaks the "agent owns everything via Prisma" model and introduces a race where the first API call could land before the trigger fires.

**[2026-05-23] — Pre-save regenerate reuses `generate-full`**
The Stage-2 Regenerate button (refining a full recipe before save) calls `POST /api/ai/generate-full` with `{ input: currentRecipe, comment }`. Same route as first-pass draft-to-full generation. Reason: prompt template is nearly identical, and pre-save refinement is still in the "generate" flow where preferences should be appended. `/api/ai/modify` stays distinct for saved-recipe modification (no preferences, post-save only).

**[2026-05-23] — OpenAI JSON mode + per-route timeout**
All three AI routes use `response_format: { type: "json_object" }` and OpenAI client `timeout: 9000` (under Vercel's 10s ceiling). JSON mode eliminates markdown-fence parsing failures; the explicit timeout returns HTTP 504 cleanly instead of letting Vercel kill the function.

**[2026-05-23] — Model split: mini for drafts, 4o for full/modify**
`generate-drafts` runs on `gpt-4o-mini` (drafts are short, just need to be plausible). `generate-full` and `modify` run on `gpt-4o` (coherence matters more than speed). Balances cost against quality under the 10s ceiling.

**[2026-05-23] — `modify` route does not append user preferences**
`generate-drafts` and `generate-full` silently append the user's dietary preferences to the prompt. `modify` does not — it operates on the recipe as-is with only the modification comment. The user is targeting a specific recipe, not generating something new. Do not add preference injection to the modify route.

**[2026-05-23] — npm workspaces over `apps/api/` + `apps/web/`**
Root `package.json` with workspaces. Single test runner (Vitest) across both packages. Root `npm run dev` uses `concurrently` to run the Express dev server and Vite dev server in parallel.

**[2026-05-23] — Supabase Storage is the chosen path for post-MVP image uploads**
User-uploaded recipe images are out of MVP scope. When/if added: bucket `recipe-images`, `imageUrl String?` column on `Recipe`, backend issues signed upload URLs, recipe delete also deletes the object. Recorded so the migration path is consistent when the feature is scoped. See [.claude/plans/SESSION_3_IMPLEMENTATION.md](.claude/plans/SESSION_3_IMPLEMENTATION.md) → "Post-MVP: Image uploads".

**[2026-05-23] — Figma MCP is the design source for frontend stages**
Stages 4-6 fetch screens and tokens from a Figma file via the Figma MCP (reference-only — agent reads, then writes idiomatic Tailwind; no codegen). The Figma file URL is the single canonical reference and lives in this decisions log once available. Without it, frontend stages cannot start.

Figma file URL: _[to be filled in once the file exists — see STARTUP.md item 4]_

**[2026-05-23] — Stage 1 bake-ins worth remembering**
- Tailwind v4 via `@tailwindcss/vite` plugin. No `tailwind.config.ts`, no `postcss.config.js`. Theme/customizations go in `apps/web/src/index.css` via `@theme` (when needed).
- Backend dev runner is `tsx watch src/dev.ts`. Backend uses ESM (`"type": "module"`) — imports use `.js` extension even for TS files (e.g. `import { createApp } from './app.js'`).
- Frontend TS imports must NOT include the `.tsx` extension (`allowImportingTsExtensions` is off). Use `import App from './App'`.
- Vitest scripts use `--passWithNoTests` so empty test suites don't fail CI. Drop once real tests exist.
- Vite proxy: `/api/*` → `http://localhost:3001` (configured in `apps/web/vite.config.ts`).
- ESLint v9 flat config at root (`eslint.config.js`); no per-app configs.

**[2026-05-23] — `dotenv-cli` wraps every backend script that needs env**
Root `.env` is the single source of truth. Backend scripts (`dev`, `test`, `prisma:*` in `apps/api/package.json`) are prefixed with `dotenv -e ../../.env --`. Don't drop the prefix when adding new scripts — Prisma and tsx look in `apps/api/` by default and would silently fail without env vars.

**[2026-05-23] — `/api/me` is the authed placeholder, `/api/health` stays public**
Master plan said "single /api/health behind auth"; we split for cleaner conventions. `/api/health` is a true public liveness probe (returns `{ok:true}`); `/api/me` is the authed placeholder that returns `{userId}` from the verified JWT. Every Stage-3 route follows the `/api/me` shape (mounted with `authMiddleware`).

**[2026-05-23] — Tenancy is app-layer only; RLS stays off**
Supabase MCP flagged "RLS disabled" as critical on `profiles`, `recipes`, and `_prisma_migrations`. This is intentional per SPEC §2 — isolation is enforced by every route extracting `req.userId` from the verified JWT and scoping all Prisma queries to that user. The anon key is never used for data (only for client-side Auth SDK), so the practical exposure of the disabled RLS is contained. Do not enable RLS without first updating every route and recording the change here.

**[2026-05-23] — Routes throw `HttpError`, not `res.status().json()`**
Defined in `apps/api/src/middleware/errors.ts`. Routes throw `HttpError(status, message)`; the error middleware serializes to `{ error: string }`. Keeps logs consistent (pino-http captures status + responseTime per request) and avoids handler-control-flow bugs.

---

## Error Patterns

> Errors, causes, fixes. Added when encountered.

---

## Undocumented Dependencies

> Libraries or config not in the spec but required for things to work. Added when discovered.

---

## Spec Conflicts

> Conflicts between the spec and observed reality, with the resolution. Don't silently deviate.
