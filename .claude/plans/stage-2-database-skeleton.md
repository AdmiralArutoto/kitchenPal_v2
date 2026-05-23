# Stage 2 — Database & backend skeleton

> Sub-plan for Stage 2 of [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md). Stage 1 (Foundation) is complete.

## Goal

Stand up the data layer (Prisma schema + initial migration) and the Express skeleton every Stage-3 route will plug into: JWT-verifying middleware that upserts a profile row, centralized error handling, request logging. A single placeholder route (`/api/me`, authed) proves the chain end-to-end.

## Prerequisites

From [STARTUP.md](../../STARTUP.md):

- **Done:** Item 1 (Supabase project + credentials in `.env`), Item 2 (Supabase MCP installed).
- **Not required for this stage:** Items 3-7. OpenAI key and Figma file come in later stages.

Verified at start of stage:
- `.env` exists at repo root with the four backend Supabase vars (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DATABASE_URL`, `DIRECT_URL`).
- Supabase public schema is empty; no prior Prisma-managed migrations.

## Decisions baked in this stage

- **`/api/health` stays public** (true liveness). **`/api/me` is the authed placeholder.** Returns `{ userId }`. Stage 3 routes follow the same shape.
- **`dotenv-cli` wraps backend scripts** so the root `.env` stays the single source of truth. Backend `dev` / `test` / `prisma:*` scripts use `dotenv -e ../../.env --`.
- **Pino + pino-http** for structured logging. JSON output in prod; `pino-pretty` available as devDep for human-readable dev logs.
- **Tests mock both Supabase admin and Prisma.** Keeps unit tests fast and independent of network/DB. Real DB verification is a one-time manual MCP check after the initial migration runs.
- **Vercel handler export pattern unchanged** — `src/index.ts` keeps `export default createApp()`; `@vercel/node` invokes the Express app as a request handler.

## Dependencies added

Root `package.json` devDeps:
- `dotenv-cli`

`apps/api/package.json`:
- dep: `@prisma/client`, `@supabase/supabase-js`, `pino`, `pino-http`
- devDep: `prisma`, `pino-pretty`, `supertest`, `@types/supertest`

## Files created

### `apps/api/prisma/schema.prisma`
Matches SPEC §4 exactly: `Profile` and `Recipe` models, dual connection strings, no Prisma `@relation` to `auth.users`.

### `apps/api/src/lib/prisma.ts`
PrismaClient singleton with `globalThis` caching outside of production (avoids hot-reload reconnect loops).

### `apps/api/src/lib/supabase.ts`
Supabase admin client bound to `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. Throws at import time if env vars are missing (fail-fast).

### `apps/api/src/middleware/errors.ts`
`HttpError(status, message)` class + `errorHandler` Express error middleware + `notFoundHandler`. Routes throw `HttpError`; never write `res.status().json()` ad-hoc.

### `apps/api/src/middleware/auth.ts`
Verifies `Authorization: Bearer <jwt>` via `supabaseAdmin.auth.getUser`, upserts the `profiles` row for `data.user.id`, attaches `req.userId`. Failure paths throw `HttpError(401, ...)`. Augments `express-serve-static-core`'s `Request` interface with `userId?: string`.

### `apps/api/src/tests/auth.test.ts`
Four cases:
1. `GET /api/me` no header → 401.
2. Malformed header (no `Bearer ` prefix) → 401.
3. `Bearer x` where `supabaseAdmin.auth.getUser` returns `{ error }` → 401.
4. `Bearer x` where `getUser` returns a user → 200 with `{ userId }`, and `prisma.profile.upsert` called once with the upsert shape from the middleware.

Uses inline `vi.mock('../lib/supabase.js')` + `vi.mock('../lib/prisma.js')`.

## Files modified

### `apps/api/src/app.ts`
Replaces the Stage 1 placeholder. Adds `pino-http`, `express.json()`, public `/api/health`, authed `/api/me`, `notFoundHandler`, `errorHandler` (in that order).

### `apps/api/package.json`
Adds the dependencies above and updates scripts to wrap with `dotenv-cli`:
- `dev`: `dotenv -e ../../.env -- tsx watch src/dev.ts`
- `test`: `dotenv -e ../../.env -- vitest run --passWithNoTests`
- `prisma:generate` / `prisma:migrate` / `prisma:studio`: same `dotenv` wrap

### Root `package.json`
Adds `dotenv-cli` to devDependencies.

## Commands

```bash
# Install new deps
npm install

# Initial migration — generates client + creates migration SQL + applies to Supabase
npm run prisma:migrate -w apps/api -- --name init

# Run tests
npm test
```

## Verification

1. **Migration file committed.** `apps/api/prisma/migrations/<ts>_init/migration.sql` exists with `CREATE TABLE "profiles"` and `CREATE TABLE "recipes"`.
2. **Supabase MCP confirms tables.** `mcp__supabase__list_tables` returns `profiles` and `recipes` in `public` with expected columns.
3. **Supabase MCP confirms migration tracked.** `mcp__supabase__list_migrations` shows the Prisma-applied entry.
4. **Tests pass.** All four `auth.test.ts` cases green.
5. **Dev server still works.** `npm run dev` from root spins both up. `curl localhost:3001/api/health` → `{"ok":true}`. `curl localhost:3001/api/me` → 401. `curl localhost:5173/api/me` (through Vite proxy) → 401.

## Deferred to later stages

- Real Express routes (profile / recipes / AI) → Stage 3.
- Zod schemas → Stage 3 (with the first real request body).
- OpenAI client + AI route handlers → Stage 3.
- Per-route `userId`-scoped Prisma queries → Stage 3.
- Real-user integration tests against Supabase Auth → not planned; mocking covers the unit-level contract. Cross-user manual check lands in Stage 6.

## Notes for the next agent (Stage 3)

- `req.userId` is always populated when a request reaches a route guarded by `authMiddleware`. Type augmentation lives in `auth.ts`.
- Fail routes by throwing `HttpError(status, message)` — don't write `res.status().json()` ad-hoc. Keeps logs consistent.
- All backend npm scripts that need env vars must wrap with `dotenv -e ../../.env --`. Don't drop the prefix.
- Vitest mocks: inline `vi.mock` is fine for middleware tests. If shared mocks emerge across multiple test files, move to `__mocks__/` or a `setupFiles` config.

## Completion

When verification is green:
- Tick `[ ] Stage 2 — Database & backend skeleton` → `[x]` in [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md).
- Update [CLAUDE.md](../../CLAUDE.md) Current State.
- Log any non-obvious choices that emerged during execution in CLAUDE.md Architecture Decisions.
