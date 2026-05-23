# Stage 3 — Backend API routes

> Sub-plan for Stage 3 of [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md). Stages 1-2 complete.

## Goal

Implement every Express route the MVP needs: profile (2), recipes (5), AI (3). Each route is `userId`-scoped, validated with Zod, fails via `HttpError`. AI routes use OpenAI JSON mode with a 9s client timeout and Zod-validated response shapes. End of stage: backend is feature-complete from an API perspective; only the frontend remains.

## Prerequisites

- Stage 2 done — Prisma schema applied, `authMiddleware`, `HttpError`, `/api/me` placeholder.
- `OPENAI_API_KEY` set in `.env` (STARTUP.md item 3 — confirmed by user before this stage).

## Decisions baked in this stage

- **Email via `req.userEmail`.** Extend `authMiddleware` to attach `req.userEmail` from `data.user.email`. Additive — Stage 2 tests still pass. Saves a per-request Supabase admin call from the profile route.
- **OpenAI JSON mode + 9s client timeout** on all three AI routes. `response_format: { type: 'json_object' }`. Single `OpenAI` client instance in `lib/openai.ts`.
- **`generate-drafts` response wrapped as `{ drafts: [...] }`.** JSON mode requires a top-level object. Server unwraps to `Draft[]` before responding.
- **Zod schemas as the source of truth** for request bodies AND AI response shapes. TS types are `z.infer<typeof Schema>` — never declare a second interface.
- **Mocked OpenAI + Prisma in tests.** No live API calls during `npm test`. Real verification is manual via curl/Postman.
- **Recipe `source` is route-controlled, not client-controlled.** `POST /api/recipes` accepts `source` (`manual` | `ai_generated`) but validates the enum. `PUT /api/recipes/:id` accepts `ai_modified` or unset. We trust the client because every request is already auth-scoped to that user — this matches SPEC §6.
- **`GET /api/recipes` query parsing:** `search` is case-insensitive substring on `name` (Prisma `contains` + `mode: 'insensitive'`); `tags` is CSV → `hasSome` (OR); `sort` enum maps to `orderBy`.

## Dependencies to add

`apps/api/package.json`:
- dep: `openai`, `zod`

## Files to create

### `apps/api/src/schemas/recipe.ts`
Zod schemas — single source for TS types.

```ts
import { z } from 'zod';

export const IngredientSchema = z.object({
  name: z.string().min(1),
  amount: z.number(),         // SPEC §4: number, not string
  unit: z.string(),
});

export const SourceSchema = z.enum(['manual', 'ai_generated', 'ai_modified']);

export const RecipeBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  ingredients: z.array(IngredientSchema),
  steps: z.array(z.string()),
  tags: z.array(z.string()).default([]),
  cookingTime: z.number().int().nullable().optional(),
  servings: z.number().int().nullable().optional(),
  emoji: z.string().nullable().optional(),
  source: SourceSchema,
});

export const RecipeUpdateSchema = RecipeBodySchema.partial();

export const RecipeListQuerySchema = z.object({
  search: z.string().optional(),
  tags: z.string().optional(),  // CSV
  sort: z.enum(['newest', 'oldest', 'name_asc', 'name_desc']).default('newest'),
});

export type RecipeBody = z.infer<typeof RecipeBodySchema>;
export type RecipeUpdate = z.infer<typeof RecipeUpdateSchema>;
export type Ingredient = z.infer<typeof IngredientSchema>;
```

### `apps/api/src/schemas/ai.ts`
Request + AI-response schemas.

```ts
import { z } from 'zod';
import { IngredientSchema, RecipeBodySchema } from './recipe.js';

// Request bodies
export const GenerateDraftsRequestSchema = z.object({
  prompt: z.string().min(1),
});

export const DraftSchema = z.object({
  title: z.string(),
  description: z.string(),
  keyIngredients: z.array(z.string()),
  estimatedTime: z.number(),
});

export const GenerateFullRequestSchema = z.object({
  input: z.union([DraftSchema, RecipeBodySchema.partial()]),
  comment: z.string().optional(),
});

export const ModifyRequestSchema = z.object({
  recipe: RecipeBodySchema.partial(),
  comment: z.string().min(1),
});

// AI response shapes
export const DraftsResponseSchema = z.object({
  drafts: z.array(DraftSchema).length(3),
});

export const FullRecipeResponseSchema = z.object({
  name: z.string(),
  description: z.string(),
  ingredients: z.array(IngredientSchema),
  steps: z.array(z.string()),
  tags: z.array(z.string()),
  cooking_time: z.number(),
  servings: z.number(),
  emoji: z.string(),
});

export type Draft = z.infer<typeof DraftSchema>;
export type FullRecipeResponse = z.infer<typeof FullRecipeResponseSchema>;
```

### `apps/api/src/lib/openai.ts`
Client + helpers. Prompts are constants in this file — tunable but not over-abstracted.

```ts
import OpenAI from 'openai';
import type { ZodSchema } from 'zod';
import { HttpError } from '../middleware/errors.js';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY must be set');

export const openai = new OpenAI({ apiKey, timeout: 9000 });

export const MODEL_DRAFTS = 'gpt-4o-mini';
export const MODEL_FULL = 'gpt-4o';

export function appendPreferences(prompt: string, preferences: string[]): string {
  if (!preferences.length) return prompt;
  return `${prompt}\nUser dietary preferences: ${preferences.join(', ')}`;
}

export async function callOpenAIJson<T>(opts: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodSchema<T>;
}): Promise<T> {
  let raw: string | null = null;
  try {
    const completion = await openai.chat.completions.create({
      model: opts.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userPrompt },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? null;
  } catch (err: unknown) {
    if (err instanceof OpenAI.APIError && err.name === 'APIConnectionTimeoutError') {
      throw new HttpError(504, 'AI request timed out');
    }
    if (err instanceof OpenAI.APIError) {
      throw new HttpError(502, `OpenAI error: ${err.message}`);
    }
    throw err;
  }

  if (!raw) throw new HttpError(500, 'AI returned empty response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(500, 'AI returned invalid JSON');
  }

  const result = opts.schema.safeParse(parsed);
  if (!result.success) {
    throw new HttpError(500, 'AI returned unexpected shape');
  }
  return result.data;
}

export const DRAFTS_SYSTEM_PROMPT = `You generate recipe drafts.
Return a JSON object of shape { "drafts": [{ "title": string, "description": string, "keyIngredients": string[], "estimatedTime": number }, ...] }.
Always return exactly 3 drafts. Return ONLY valid JSON. No markdown, no preamble.`;

export const FULL_SYSTEM_PROMPT = `You generate full recipes.
Return a JSON object of shape { "name": string, "description": string, "ingredients": [{ "name": string, "amount": number, "unit": string }], "steps": string[], "tags": string[], "cooking_time": number, "servings": number, "emoji": string }.
Ingredient "amount" MUST be a number, not a string. "emoji" is a single emoji character. Return ONLY valid JSON. No markdown, no preamble.`;

export const MODIFY_SYSTEM_PROMPT = `You modify an existing recipe based on a user comment, preserving the rest of the recipe.
Return a JSON object of shape { "name": string, "description": string, "ingredients": [{ "name": string, "amount": number, "unit": string }], "steps": string[], "tags": string[], "cooking_time": number, "servings": number, "emoji": string }.
Ingredient "amount" MUST be a number. Return ONLY valid JSON.`;
```

### `apps/api/src/routes/profile.ts`

```ts
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';

const ProfileUpdateSchema = z.object({
  name: z.string().nullable().optional(),
  preferences: z.array(z.string()).optional(),
});

export const profileRouter = Router();
profileRouter.use(authMiddleware);

profileRouter.get('/', async (req, res) => {
  const profile = await prisma.profile.findUnique({ where: { id: req.userId! } });
  if (!profile) throw new HttpError(404, 'Profile not found');
  res.json({
    name: profile.name,
    preferences: profile.preferences,
    email: req.userEmail ?? null,
  });
});

profileRouter.put('/', async (req, res) => {
  const parsed = ProfileUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map(i => i.message).join('; '));
  const updated = await prisma.profile.update({
    where: { id: req.userId! },
    data: parsed.data,
  });
  res.json({
    name: updated.name,
    preferences: updated.preferences,
    email: req.userEmail ?? null,
  });
});
```

### `apps/api/src/routes/recipes.ts`

Five endpoints, all `userId`-scoped. GET list parses query params with `RecipeListQuerySchema`; sort enum maps to Prisma `orderBy`.

```ts
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import {
  RecipeBodySchema,
  RecipeUpdateSchema,
  RecipeListQuerySchema,
} from '../schemas/recipe.js';

export const recipesRouter = Router();
recipesRouter.use(authMiddleware);

const SORT_MAP = {
  newest:    { createdAt: 'desc' as const },
  oldest:    { createdAt: 'asc' as const },
  name_asc:  { name: 'asc' as const },
  name_desc: { name: 'desc' as const },
};

recipesRouter.get('/', async (req, res) => {
  const q = RecipeListQuerySchema.safeParse(req.query);
  if (!q.success) throw new HttpError(400, q.error.issues.map(i => i.message).join('; '));
  const { search, tags, sort } = q.data;

  const where: Record<string, unknown> = { userId: req.userId! };
  if (search) where.name = { contains: search, mode: 'insensitive' };
  if (tags) {
    const list = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (list.length) where.tags = { hasSome: list };
  }

  const recipes = await prisma.recipe.findMany({
    where,
    orderBy: SORT_MAP[sort],
  });
  res.json(recipes);
});

recipesRouter.get('/:id', async (req, res) => {
  const recipe = await prisma.recipe.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!recipe) throw new HttpError(404, 'Recipe not found');
  res.json(recipe);
});

recipesRouter.post('/', async (req, res) => {
  const parsed = RecipeBodySchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map(i => i.message).join('; '));
  const created = await prisma.recipe.create({
    data: { ...parsed.data, userId: req.userId! },
  });
  res.status(201).json(created);
});

recipesRouter.put('/:id', async (req, res) => {
  const parsed = RecipeUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map(i => i.message).join('; '));
  const existing = await prisma.recipe.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    select: { id: true },
  });
  if (!existing) throw new HttpError(404, 'Recipe not found');
  const updated = await prisma.recipe.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  res.json(updated);
});

recipesRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.recipe.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    select: { id: true },
  });
  if (!existing) throw new HttpError(404, 'Recipe not found');
  await prisma.recipe.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
```

### `apps/api/src/routes/ai.ts`

Three endpoints. Drafts + full append preferences; modify does not.

```ts
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import {
  GenerateDraftsRequestSchema,
  GenerateFullRequestSchema,
  ModifyRequestSchema,
  DraftsResponseSchema,
  FullRecipeResponseSchema,
} from '../schemas/ai.js';
import {
  callOpenAIJson,
  appendPreferences,
  MODEL_DRAFTS,
  MODEL_FULL,
  DRAFTS_SYSTEM_PROMPT,
  FULL_SYSTEM_PROMPT,
  MODIFY_SYSTEM_PROMPT,
} from '../lib/openai.js';

export const aiRouter = Router();
aiRouter.use(authMiddleware);

async function getPreferences(userId: string): Promise<string[]> {
  const p = await prisma.profile.findUnique({ where: { id: userId }, select: { preferences: true } });
  return p?.preferences ?? [];
}

aiRouter.post('/generate-drafts', async (req, res) => {
  const parsed = GenerateDraftsRequestSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map(i => i.message).join('; '));
  const prefs = await getPreferences(req.userId!);
  const userPrompt = appendPreferences(parsed.data.prompt, prefs);

  const result = await callOpenAIJson({
    model: MODEL_DRAFTS,
    systemPrompt: DRAFTS_SYSTEM_PROMPT,
    userPrompt,
    schema: DraftsResponseSchema,
  });
  res.json(result.drafts);
});

aiRouter.post('/generate-full', async (req, res) => {
  const parsed = GenerateFullRequestSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map(i => i.message).join('; '));
  const prefs = await getPreferences(req.userId!);
  const { input, comment } = parsed.data;
  const base = `Input recipe or draft (JSON): ${JSON.stringify(input)}`;
  const withComment = comment ? `${base}\nRefinement comment: ${comment}` : base;
  const userPrompt = appendPreferences(withComment, prefs);

  const result = await callOpenAIJson({
    model: MODEL_FULL,
    systemPrompt: FULL_SYSTEM_PROMPT,
    userPrompt,
    schema: FullRecipeResponseSchema,
  });
  res.json(result);
});

aiRouter.post('/modify', async (req, res) => {
  const parsed = ModifyRequestSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map(i => i.message).join('; '));
  const { recipe, comment } = parsed.data;
  // NOTE: no preference injection — see SPEC §6 / CLAUDE.md
  const userPrompt = `Recipe (JSON): ${JSON.stringify(recipe)}\nModification: ${comment}`;

  const result = await callOpenAIJson({
    model: MODEL_FULL,
    systemPrompt: MODIFY_SYSTEM_PROMPT,
    userPrompt,
    schema: FullRecipeResponseSchema,
  });
  res.json(result);
});
```

### Tests

**`apps/api/src/tests/profile.test.ts`** — 4 cases
1. `GET /api/profile` no auth → 401.
2. `GET /api/profile` authed, profile exists → 200 + `{ name, preferences, email }`.
3. `PUT /api/profile` no auth → 401.
4. `PUT /api/profile` authed with valid body → 200 + updated values.

**`apps/api/src/tests/recipes.test.ts`** — ~10 cases
1. Each of GET / GET:id / POST / PUT:id / DELETE returns 401 without auth.
2. GET list authed → 200 + recipes array. Asserts the where clause includes userId scoping.
3. GET list with `?search=x&tags=a,b&sort=name_asc` → asserts the Prisma call shape (where + orderBy).
4. GET :id authed, found → 200.
5. GET :id authed, not found → 404.
6. POST authed valid body → 201 + recipe (userId injected).
7. POST authed bad body (missing required field) → 400.
8. PUT :id authed, partial body → 200 + updated.
9. DELETE :id authed, found → 204.
10. DELETE :id authed, not found → 404.

**`apps/api/src/tests/ai.test.ts`** — ~8 cases
1. Each of the 3 AI routes returns 401 without auth.
2. `generate-drafts` happy → 200 + array of 3 drafts (OpenAI mocked to return `{ drafts: [d1, d2, d3] }`). Asserts preferences appended.
3. `generate-full` with `{ input, comment }` → 200 + full recipe.
4. `modify` happy → 200. Asserts preferences NOT appended (prompt does not include "User dietary preferences").
5. AI route on OpenAI timeout → 504. (Mock the client to throw `APIConnectionTimeoutError`.)
6. AI route on bad JSON → 500.
7. AI route on shape mismatch → 500.

Tests use `vi.mock` for `../lib/openai.js`, `../lib/supabase.js`, `../lib/prisma.js`.

## Files to modify

### `apps/api/src/middleware/auth.ts`
Additive change: attach `req.userEmail = data.user.email ?? undefined`. Extend the `Request` augmentation with `userEmail?: string`. Existing Stage 2 tests still pass (they only check `userId`).

### `apps/api/src/app.ts`
Mount the three routers under their base paths and remove the `/api/me` placeholder.

```ts
import express from 'express';
import pinoHttp from 'pino-http';
import { profileRouter } from './routes/profile.js';
import { recipesRouter } from './routes/recipes.js';
import { aiRouter } from './routes/ai.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';

export function createApp() {
  const app = express();
  app.use(pinoHttp());
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/profile', profileRouter);
  app.use('/api/recipes', recipesRouter);
  app.use('/api/ai', aiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
```

### `apps/api/src/tests/auth.test.ts`
The `/api/me` route is gone. Repoint the test to a still-protected route — `GET /api/profile` is the natural successor (its first action is the auth chain). Adjust the happy-path assertion (response body is now `{ name, preferences, email }`, not `{ userId }`) and add a mocked `prisma.profile.findUnique` return.

### `apps/api/package.json`
Add `openai` and `zod` to dependencies.

## Commands

```bash
# Install
npm install

# Tests
npm test

# Manual smoke (needs a real Supabase user JWT — see "Manual smoke" below)
npm run dev
```

## Verification

1. **All Vitest tests pass.** Profile (4) + recipes (~10) + AI (~8) + the updated auth test (4) — ~26 cases.
2. **Manual smoke test against `npm run dev`** (with a real JWT for an authenticated user — obtain via Supabase dashboard or by signing up through Stage 4's auth flow; alternatively, generate a service-role JWT for a test user):
   - `POST /api/recipes` with a valid body → 201.
   - `GET /api/recipes` → returns the created recipe.
   - `GET /api/recipes?search=foo&sort=name_asc` → filtered + sorted.
   - `PUT /api/recipes/:id` → 200.
   - `DELETE /api/recipes/:id` → 204.
   - `POST /api/ai/generate-drafts` with `{ prompt: "quick pasta" }` → 200 + array of 3 drafts (live OpenAI call).
   - `POST /api/ai/generate-full` with one of those drafts → 200 + full recipe.
   - `POST /api/ai/modify` with the full recipe + comment "make it vegan" → 200 + modified.
3. **Cross-user isolation** verified by manual test: create recipes as user A, list as user B → empty array.
4. **Supabase MCP confirms no schema drift.** `mcp__supabase__list_tables` is unchanged from Stage 2.

Manual smoke against live OpenAI may be deferred until Stage 4 when there's a UI to sign up through. Tests + curl-with-mock-JWT are sufficient to mark Stage 3 complete.

## Deferred to later stages

- Live OpenAI smoke test through the UI → covered in Stage 5 verification.
- Rate limiting on AI routes → not in MVP scope.
- Cursor-based pagination on `GET /api/recipes` → not needed at MVP volumes; revisit if any user crosses a few hundred recipes.
- Codegen of `apps/web/src/types/api.ts` from Zod schemas → Stage 4 will hand-maintain; future pass.

## Notes for the next agent (Stage 4)

- `apps/web/src/lib/api.ts` will hit these routes via `Authorization: Bearer <jwt>`. Response shapes are stable per the Zod schemas in `apps/api/src/schemas/`. Mirror those types by hand in `apps/web/src/types/api.ts`.
- `GET /api/profile` returns `{ name, preferences, email }`. Don't expect anything else.
- `GET /api/recipes` returns the full recipe row (matching Prisma's `Recipe` model). Frontend list cards consume the same shape that the detail modal does — no two-shape mismatch.
- `POST /api/ai/generate-drafts` returns a bare `Draft[]` array (unwrapped from the `{ drafts: [...] }` AI response).
- All AI routes can return 504 (timeout) or 500 (parse/shape failure). Frontend should show a friendly error toast on either.

## Completion

When verification is green:
- Tick `[ ] Stage 3 — Backend API routes` → `[x]` in [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md).
- Update CLAUDE.md Current State + any new Architecture Decisions.
