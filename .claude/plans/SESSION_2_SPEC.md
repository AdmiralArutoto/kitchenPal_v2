# KitchenPal — Spec

## 1. Project Purpose

KitchenPal is a personal recipe management app with an integrated AI layer. Users maintain a private recipe vault, generate new recipes through a prompt interface, and adapt existing recipes using AI. There are no social features and no public surfaces — every user sees only their own data.

The human developer's role is orchestration, judgment, and review. No code is written by hand unless there is a specific, documented reason the agent cannot handle it.

---

## 2. Architecture

```
React + Vite (Vercel CDN)
│
├── Supabase Auth JS SDK  [client-side only]
│     login / signup / session / JWT
│
└── Express Backend  [Vercel serverless]
      │
      ├── Prisma Client
      │     all recipe + profile CRUD → Supabase Postgres
      │
      ├── Supabase JS Admin Client  [backend only]
      │     JWT verification → extracts user_id
      │
      └── OpenAI API
            generate-drafts / generate-full / modify
```

### Non-negotiable rules

- React **never** calls Supabase directly for data. All DB access goes through Express. Supabase Auth SDK is the only exception — the client handles login/signup/session.
- OpenAI is called from the **backend only**. The API key is never exposed to the frontend.
- Every Express route extracts `user_id` from the verified JWT and scopes **all** Prisma queries to that `user_id`. No exceptions.
- Prisma owns the schema entirely. The Supabase dashboard is **never** used for schema changes.
- RLS is **off**. Isolation is app-layer via `user_id` scoping. Do not enable RLS without first updating every route and recording the change in CLAUDE.md.
- `auth.users` is owned by Supabase Auth and not modelled in Prisma. FK references to `auth.users.id` in `profiles` and `recipes` are plain `String @db.Uuid` — no Prisma `@relation`.

### Repo layout

- `apps/api/` — Express + Prisma. Schema and migrations live under `apps/api/prisma/`.
- `apps/web/` — React + Vite frontend.
- Root `package.json` defines npm workspaces over both.
- Root `npm run dev` spins up both via `concurrently`.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js + Express (deployed as one Vercel serverless function via adapter) |
| Database | Supabase Postgres |
| ORM | Prisma — owns schema, migrations, type-safe queries |
| Auth | Supabase Auth (email/password + email verification + JWT) |
| AI | OpenAI API — `gpt-4o-mini` for drafts, `gpt-4o` for full/modify |
| Tests | Vitest (single runner for backend and frontend) |
| Hosting | Vercel (frontend CDN + serverless functions) |

### Why Prisma, not the Supabase JS client, for DB

The Supabase JS client has no schema awareness — it cannot create migrations or diff the data model. Schema management would require manual dashboard work, which breaks the agent-owns-everything model. Prisma gives a typed, version-controlled `schema.prisma` as the single source of truth: `prisma migrate dev` generates SQL migrations locally; `prisma migrate deploy` applies them during Vercel build. The Supabase JS client is retained for **auth only** — frontend session management and backend JWT verification.

### Connection strings

Two Postgres URLs are required:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled via Supabase pgBouncer. Used by Prisma Client at runtime. Required for serverless — direct connections exhaust Postgres limits. |
| `DIRECT_URL` | Direct connection. Used by `prisma migrate deploy` only. pgBouncer does not support the session-level commands migrations require. |

---

## 4. Data Models

Defined in `apps/api/prisma/schema.prisma`. The agent owns this file entirely. `auth.users` is not modelled — Supabase Auth manages it internally.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model Profile {
  id          String   @id @db.Uuid                    // = auth.users.id, no Prisma-level FK
  name        String?
  preferences String[]                                 // e.g. ["gluten-free", "vegan"]
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt       @map("updated_at")
  recipes     Recipe[]

  @@map("profiles")
}

model Recipe {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid @map("user_id")
  name        String
  description String?
  ingredients Json                                      // [{ name, amount: number, unit }]
  steps       Json                                      // string[]
  tags        String[]
  cookingTime Int?     @map("cooking_time")
  servings    Int?
  emoji       String?
  source      String                                    // "manual" | "ai_generated" | "ai_modified"
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt       @map("updated_at")
  profile     Profile  @relation(fields: [userId], references: [id])

  @@map("recipes")
}
```

**Ingredient `amount` is a number, not a string.** Required for the serving scaler (`scaledAmount = amount * newServings / baseServings`). AI prompts must instruct this; routes must validate and reject string amounts with HTTP 500.

A profile row is created on first authenticated API call via upsert in the JWT-verification middleware — see §8 Workflow Rules.

---

## 5. Screens and User Flows

### 5.1 Auth Screen
**Route:** `/` (unauthenticated only)

- Toggle between Login and Sign Up modes
- Fields: email, password (+ confirm password on signup)
- Login success → `/home`
- Signup success → `/verify-email`

### 5.1a Email Verification Screen
**Route:** `/verify-email` (post-signup, pre-verification)

- "Check your email — we sent a verification link to [email]"
- Optional resend link (rate-limited by Supabase)
- Verified users landing here → redirect to `/home`
- Unverified users attempting any protected route → redirect here

Supabase Auth tracks verification via `auth.users.email_confirmed_at` — no extra column in `profiles`.

**SMTP:** Supabase's built-in mailer is rate-limited to 3 emails/hour — dev only. Replace with Resend (3K/month) or Brevo (300/day) before any real use. Deferred to a later session.

### 5.2 Home Screen — AI Generation
**Route:** `/home` (default after login)

**Layout**
- Top nav: **Home** | **Catalog** | **About**, persistent
- Top-right: display name + Logout
- Main: guided option flow + free-text field + Generate

**Guided option flow** — single-choice button groups, one category revealed at a time:

| Step | Label | Options |
|---|---|---|
| 1 | Meal type | Breakfast / Lunch / Dinner / Snack / Dessert / Drink / Skip |
| 2 | Cuisine | Italian / Asian / Mediterranean / Mexican / American / Middle Eastern / Indian / Skip |
| 3 | Dietary | None / Vegetarian / Vegan / Gluten-free / Dairy-free / Keto / Skip |
| 4 | Vibe | Quick (<30 min) / Budget-friendly / Kid-friendly / Meal prep / Skip |

Each non-Skip selection adds a pill to the text field. Free text and pills coexist; the user can type at any point.

**Stage 1 — Drafts**
1. User presses Generate.
2. Frontend POSTs full text-field content (pills flattened to text) to `/api/ai/generate-drafts`.
3. Backend appends user preferences silently, calls OpenAI.
4. 3 draft cards appear inline below the field (title, description, key ingredients, estimated time).
5. **Regenerate** button re-runs with the same prompt.

**Stage 2 — Full Recipe**
1. User clicks a draft card.
2. Frontend POSTs the selected draft to `/api/ai/generate-full`.
3. Full recipe replaces the draft area inline.
4. Four action buttons:
   - **Delete** — discard, reset to generation state
   - **Edit** — inline manual edit
   - **Regenerate** — reveal comment field; user types instruction; resend to `/api/ai/generate-full` with `{ input: currentRecipe, comment }`; result replaces current
   - **Approve** — save via `POST /api/recipes` with `source: "ai_generated"`; success toast

### 5.3 Catalog Screen
**Route:** `/catalog`

**Layout**
- Header: "My Recipe Collection" + count
- Top-right: **+ Add Recipe**
- Search bar + Sort dropdown (Newest / Oldest / A–Z / Z–A) + Filter button (by tags)
- Recipe grid (2 columns)

**Recipe card**
- Emoji on colored background
- Name, truncated description
- Cooking time, servings
- Tags as pills
- Inline **Edit** (opens manual edit modal) and **Delete** (confirms then deletes)

**Recipe Detail Modal** — opened by clicking the card body
- Full recipe content
- **Serving Scaler** — +/- buttons next to servings count
  - Minimum: 1, no maximum
  - Rounding: nearest 0.25 — `Math.round(value * 4) / 4`
  - Formula: `scaledAmount = round(ingredient.amount * (newServings / baseServings))`
  - **View-only.** Base recipe is never modified. Modal resets to original amounts on close.
- Actions: **Edit** (inline edit), **Delete** (with confirm), **Modify with AI** (see below)

**AI Modifier flow** (inside the modal)
1. User clicks Modify with AI.
2. Inline comment field appears.
3. User types (e.g. "make it dairy-free", "double the servings", "simplify the steps").
4. Frontend POSTs `{ recipe, comment }` to `/api/ai/modify`.
5. Modal content updates in place with the modified recipe — user stays in the modal.
6. Two new actions appear:
   - **Approve** → `PUT /api/recipes/:id` with `source: "ai_modified"`; modal reflects saved state
   - **Discard** → revert modal content to the original recipe; no DB change

**Add Recipe Modal** — opened by **+ Add Recipe**
- Name (required), description, ingredients (repeatable name/amount/unit rows), steps (repeatable ordered), tags, cooking time, servings, emoji (auto-assigned, user can change)
- Submit → `POST /api/recipes` with `source: "manual"`

### 5.4 About Screen
**Route:** `/about`

**Account Info** — display name (editable), email (read-only from `auth.users`), dietary preferences (tag-style add/remove), Save → `PUT /api/profile`. Logout button.

**About KitchenPal** — static product description.

---

## 6. API Routes

Base path: `/api`. All non-auth routes require `Authorization: Bearer <JWT>`.

### Profile

| Method | Route | Description |
|---|---|---|
| GET | `/api/profile` | Logged-in user's profile. Returns `{ name, preferences, email }` (email pulled from `auth.users`, not stored in `profiles`). |
| PUT | `/api/profile` | Update `name` and/or `preferences`. |

### Recipes

| Method | Route | Description |
|---|---|---|
| GET | `/api/recipes` | All recipes for the authenticated user. Query params below. |
| GET | `/api/recipes/:id` | Single recipe. 404 if not owned by the user. |
| POST | `/api/recipes` | Create. Body matches the full recipe object + `source`. |
| PUT | `/api/recipes/:id` | Update. Accepts a partial body + `source`. |
| DELETE | `/api/recipes/:id` | Delete. 404 if not owned by the user. |

**`GET /api/recipes` query semantics**
- `search=foo` — case-insensitive substring match on `name` only.
- `tags=quick,vegan` — comma-separated list. **OR** semantics: recipes matching any of the listed tags.
- `sort` — enum: `newest` (default) | `oldest` | `name_asc` | `name_desc`.
- Filters compose: `search` and `tags` are ANDed together; `sort` applies last.

### AI

| Method | Route | Body | Description |
|---|---|---|---|
| POST | `/api/ai/generate-drafts` | `{ prompt: string }` | Returns array of 3 draft recipe objects. |
| POST | `/api/ai/generate-full` | `{ input: Draft \| Recipe, comment?: string }` | Returns one full recipe object. Same route covers first-pass (draft → full) and pre-save refinement (recipe + comment → full). |
| POST | `/api/ai/modify` | `{ recipe: Recipe, comment: string }` | Returns the modified recipe object. For **saved** recipes only. |

**Prompt construction**
- `generate-drafts` and `generate-full` silently append `"\nUser dietary preferences: ${preferences.join(', ')}"` (omitted if preferences is empty).
- `modify` operates on the recipe as-is — preferences are **not** appended. Intentional: the user is targeting a specific recipe, not generating new content.
- All three routes use OpenAI **JSON mode** (`response_format: { type: "json_object" }`). The prompt still says "return JSON only" as belt-and-suspenders.
- All three routes set OpenAI client `timeout: 9000` (1s under Vercel's 10s ceiling). Timeouts return HTTP 504 with a clear message.

**Validation**
- Parse with `JSON.parse()` inside try/catch. On parse failure → HTTP 500 with a clear error message; never crash the server.
- Validate the response against the expected shape (§7) before returning. Reject and 500 on shape mismatch.

---

## 7. AI Prompt Design

### Response shapes

**Draft object:**
```json
{
  "title": "string",
  "description": "string (1-2 sentences)",
  "keyIngredients": ["string"],
  "estimatedTime": "number (minutes)"
}
```

**Full recipe object** (matches DB schema):
```json
{
  "name": "string",
  "description": "string",
  "ingredients": [{ "name": "string", "amount": "number", "unit": "string" }],
  "steps": ["string"],
  "tags": ["string"],
  "cooking_time": "number",
  "servings": "number",
  "emoji": "string (single emoji)"
}
```

### Model selection

| Route | Model | Reason |
|---|---|---|
| `generate-drafts` | `gpt-4o-mini` | Drafts are short, just need to be plausible. ~2-3s typical. |
| `generate-full` | `gpt-4o` | Recipe coherence and step quality matter. ~5-8s typical. |
| `modify` | `gpt-4o` | Modifications must respect the rest of the recipe. ~5-8s typical. |

---

## 8. Workflow Rules

Project-specific only. Generic engineering hygiene (linting, conventional commits, etc.) is assumed and not repeated here.

### Schema changes
1. Edit `apps/api/prisma/schema.prisma`.
2. `npx prisma migrate dev --name <descriptive-name>` (lowercase, underscores).
3. Commit `schema.prisma` and the generated migration file **together**.
4. Never run `prisma migrate reset` without explicit human approval — wipes the DB.
5. Never edit an applied migration — create a new one.

### Profile row creation
The JWT-verification middleware runs `prisma.profile.upsert({ where: { id: userId }, create: { id: userId, preferences: [] }, update: {} })` on every authenticated request before handing off to the route. Guarantees the row exists without out-of-band Supabase SQL or a database trigger.

### Testing
- Vitest, single config story across both packages.
- At least one test per Express route — happy path + missing-auth case.
- Frontend tests: component-level for non-trivial logic (serving scaler, guided-flow state machine). Pure render does not need a test.

### Supabase MCP rules
Read access only during development. Never use the MCP to create/alter/drop tables, run migrations, or modify data. All schema work goes through Prisma. The MCP is for inspecting state and debugging — nothing else.

---

## 9. Environment & Infrastructure

### Environment variables

| Variable | Location | Source |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend (build time) | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend (build time) | Supabase → Settings → API → anon key |
| `SUPABASE_URL` | Backend | Same as `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_KEY` | Backend | Supabase → Settings → API → service role key |
| `DATABASE_URL` | Backend | Supabase → Settings → Database → Transaction (pooled), append `?pgbouncer=true` |
| `DIRECT_URL` | Backend | Supabase → Settings → Database → Direct, append `?connection_limit=1` |
| `OPENAI_API_KEY` | Backend | OpenAI dashboard |

`VITE_`-prefixed variables are bundled into the frontend at build time. **Never** prefix backend secrets with `VITE_`.

### Vercel build command

```
prisma generate && prisma migrate deploy && vite build
```

`prisma migrate deploy` uses `DIRECT_URL` to apply pending migrations on every deploy — schema stays in sync with deployed code. Exact path resolution under the workspaces layout lands during the project restructure pass.

### Serverless constraints

- 10s function timeout on Vercel hobby. OpenAI client `timeout: 9000` accounts for this.
- No persistent in-memory state. `DATABASE_URL` pgBouncer pooling is mandatory.
- Cold starts are expected. No mitigation needed for MVP.

---

## 10. Success Criteria

Verifiable before MVP is considered done:

**Auth**
- [ ] User can sign up with email and password
- [ ] After signup, user is shown the email verification screen
- [ ] Unverified users cannot access protected routes — redirected to verification screen
- [ ] User can log in after verifying their email and is redirected to Home
- [ ] Unauthenticated users cannot access any route other than `/` and `/verify-email`
- [ ] Logout clears session and redirects to auth screen

**Profile**
- [ ] User's display name appears in the top-right nav after login
- [ ] User can set and update their name on the About screen
- [ ] Email is displayed as read-only on About
- [ ] User can add and remove dietary preferences on About
- [ ] Preferences persist across sessions

**Recipe Generation**
- [ ] Guided flow reveals one category at a time and adds pills to the text field
- [ ] Free text can be typed alongside pills
- [ ] Clicking Generate returns 3 draft cards inline below the text field
- [ ] Clicking a draft generates a full recipe in place of the drafts
- [ ] Regenerate with comment produces a new version of the full recipe via `generate-full`
- [ ] Approve saves the recipe with `source: "ai_generated"` and shows a success toast
- [ ] Approved recipe appears in the Catalog
- [ ] User preferences are silently appended to `generate-drafts` and `generate-full` prompts only — never to `modify`

**Recipe Vault (Catalog)**
- [ ] All user recipes appear as cards in the catalog grid
- [ ] Search filters recipes by name (case-insensitive substring)
- [ ] Filter by tag returns recipes matching any of the selected tags (OR)
- [ ] Sort by Newest / Oldest / A–Z / Z–A works correctly
- [ ] Clicking a card opens the recipe detail modal with full content
- [ ] Edit opens editable fields within the modal; saving updates the DB
- [ ] Delete removes the recipe from the DB and the catalog
- [ ] Add Recipe form creates a new recipe with `source: "manual"`

**AI Modifier**
- [ ] Modify with AI reveals an inline comment field in the recipe modal
- [ ] Submitting sends the recipe and comment to the AI and updates the modal in place
- [ ] Approve replaces the original recipe in the DB with `source: "ai_modified"`
- [ ] Discard reverts the modal to the original recipe with no DB change
- [ ] User stays in the modal throughout the entire modifier flow

**Serving Scaler**
- [ ] +/- buttons appear next to servings count in the recipe detail modal
- [ ] Ingredient amounts update live as servings change
- [ ] Amounts round to nearest 0.25
- [ ] Servings cannot go below 1
- [ ] Closing the modal resets amounts to original — no DB change ever occurs

**Data integrity**
- [ ] Ingredient amounts stored as numbers, not strings
- [ ] `source` field set correctly on every recipe (`manual`, `ai_generated`, `ai_modified`)
- [ ] No user can read or modify another user's data (verified by manual cross-user test)

---

## 11. Out of Scope

- Social features, public profiles, sharing, community browsing
- Recipe import via URL or image (stretch — only after all MVP criteria pass)
- User-uploaded recipe images (emoji placeholder for MVP)
- Rating system
- Social platform scraping

**Deferred (not out of scope):** production SMTP provider for email verification.
