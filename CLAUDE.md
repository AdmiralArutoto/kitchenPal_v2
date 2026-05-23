# CLAUDE.md — KitchenPal Living Memory

**Source of truth for product, architecture, and rules:** [.claude/plans/SESSION_2_SPEC.md](.claude/plans/SESSION_2_SPEC.md).
**Implementation roadmap:** [.claude/plans/SESSION_3_IMPLEMENTATION.md](.claude/plans/SESSION_3_IMPLEMENTATION.md).
**Setup the agent can't do (MCPs, API keys, Vercel, Figma file):** [STARTUP.md](STARTUP.md).

This file is for what doesn't belong in the spec — decisions made during implementation, errors and their fixes, undocumented dependencies, and the current state of the work. Update it the moment you learn something a future agent would have wanted to know.

---

## Current State

```
Status: Stage 3 complete. Backend feature-complete (36/36 tests). Figma translation skill in place; component barrel created; Figma file URL recorded.
Last session: Session 11 — figma-translation skill + component barrel
Next action: Begin Stage 4 (Frontend scaffold + auth + About). The skill fires automatically on the first component.
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

Figma file URL: https://www.figma.com/design/PmyY8PrGtVZ0QvsiFigRGU/Kitchenpal_design

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

**[2026-05-23] — Zod schemas in `apps/api/src/schemas/` are the source of truth**
Request bodies and AI response shapes are defined as Zod schemas. TS types are derived via `z.infer<typeof Schema>` — never declared as a separate interface. Adding a field means editing one schema; the type updates everywhere.

**[2026-05-23] — `generate-drafts` wraps its OpenAI response as `{ drafts: [...] }`**
OpenAI JSON mode requires a top-level object, not an array. The system prompt asks for `{ "drafts": [...] }`; the route validates that shape and unwraps to a bare `Draft[]` before responding. Frontend gets a plain array.

**[2026-05-23] — `req.userEmail` is populated by `authMiddleware` from the verified JWT**
Saves a per-request `auth.admin.getUserById()` lookup. The `Request` type augmentation lives in `auth.ts` alongside `userId`. Routes that need the email read `req.userEmail` directly; the `GET /api/profile` response includes it.

**[2026-05-23] — Vitest `beforeEach` uses `vi.resetAllMocks()`, not `vi.clearAllMocks()`**
`clearAllMocks` only clears call history; it does NOT drain `mockResolvedValueOnce` queues. Tests that don't consume all their queued values (e.g. a 400 case where Zod rejects before Prisma is touched) leak the unused value into the next test. `resetAllMocks` clears the queue too. Use this pattern in all backend tests.

**[2026-05-23] — Frontend implementation goes through the `figma-translation` skill**
Auto-fires on any frontend implementation task. Lives at `.claude/skills/figma-translation/SKILL.md`. Enforces (1) read `apps/web/src/components/index.ts` and `apps/web/src/index.css` first, (2) decompose the frame and map every element to an existing component or justify "new:", (3) hex literals belong in `@theme` only — never in JSX. Created before Stage 4 because the Figma file is Figma Make output with no components/variables; without this skill the codebase will fork buttons and hardcode colors across stages.

---

## Error Patterns

> Errors, causes, fixes. Added when encountered.

---

## Undocumented Dependencies

> Libraries or config not in the spec but required for things to work. Added when discovered.

---

## Spec Conflicts

> Conflicts between the spec and observed reality, with the resolution. Don't silently deviate.
