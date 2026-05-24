# 🍳 KitchenPal

> A personal recipe management app where users build and manage a private recipe catalog, with an AI layer that generates, adapts, and discovers recipes on their behalf.

Built end-to-end with [Claude Code](https://claude.com/claude-code) 🤖 as the primary engineering collaborator — see [Agentic Workflow](#-agentic-workflow) below.

---

## ✨ Features

🗄️ **Vault** — searchable recipe catalog with full CRUD, manual creation, tag filtering, and a live serving scaler that adjusts ingredient amounts proportionally.

🤖 **AI Layer** — a unified generation and modification pipeline powered by the OpenAI API. On the home screen, users generate recipes via a guided option flow or free text. In the catalog, the same pipeline applies to any existing recipe. Both surfaces use a two-stage flow — lightweight drafts first, full recipe on selection — with approve, edit, or discard before anything hits the database.

🗓️ **Daily Rotation** *(planned)* — recipe cards refreshed daily, seeded from TheMealDB and normalized by AI into the app's schema. AI acts here as a data transformer rather than a generator, with results filtered against the user's dietary profile.

📥 **Recipe Import** *(planned)* — paste a URL or upload a screenshot; AI extracts and structures the content directly into the vault.

---

## 🧰 Stack & Infrastructure

- ⚛️ **Frontend** — React 18 + Vite 5, Tailwind v4 (via `@tailwindcss/vite`, no `tailwind.config`), React Router 6, TanStack Query 5 for caching + optimistic mutations
- 🛠️ **Backend** — Node.js + Express 5, deployed as Vercel serverless functions
- 🗄️ **Database / Auth / Storage** — Supabase (Postgres, email verification, file storage)
- 🧬 **ORM** — Prisma 6 — schema-as-code, migrations run automatically on every deployment
- 🧠 **AI** — OpenAI API, backend only (`gpt-4o-mini` for drafts, `gpt-4o` for full recipes and modifications)
- ✅ **Validation** — Zod schemas as the single source of truth; TS types are derived via `z.infer`
- 🧪 **Testing** — Vitest across both packages; backend covered with supertest integration tests
- 🧹 **Tooling** — npm workspaces, ESLint v9 flat config, Prettier, `dotenv-cli` to share one root `.env`

---

## 🤖 Agentic Workflow

This project was built as an exercise in agentic engineering. The headline shape:

- 📝 **Four planning sessions** produced a full spec before any implementation — user flows, architecture, data models, API routes, and prompt design. The spec ([.claude/plans/SESSION_2_SPEC.md](.claude/plans/SESSION_2_SPEC.md)) is the source of truth; the implementation roadmap ([.claude/plans/SESSION_3_IMPLEMENTATION.md](.claude/plans/SESSION_3_IMPLEMENTATION.md)) breaks it into approvable stages.
- 🧑‍💻 **Claude Code drives implementation** through tailored instructions, plugins, and skills. [CLAUDE.md](CLAUDE.md) is the project's living memory 🧠 — every non-obvious decision, error pattern, and spec deviation is logged there so future agent sessions don't silently undo prior work.
- 🎨 **Figma MCP handles design handoff.** Frontend stages read screens and tokens directly from Figma; a custom [.claude/skills/figma-translation/](.claude/skills/figma-translation/) skill enforces component reuse and design-token discipline so the codebase doesn't fork buttons or hardcode colors across stages.
- 🔌 **Supabase MCP** gives the agent read-only inspection of the live DB during development. Schema changes still go through Prisma migrations.
- ✅ **Stage-by-stage approval.** Each stage in [.claude/plans/](.claude/plans/) is a self-contained, reviewable unit. The agent works one stage at a time, updates CLAUDE.md, and waits for go-ahead before the next.

---

## 📁 Project Structure

```
kp/
├── apps/
│   ├── api/                    # Express backend (serverless on Vercel)
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Profile + Recipe models
│   │   │   └── migrations/
│   │   └── src/
│   │       ├── app.ts          # Express app factory
│   │       ├── dev.ts          # Local dev server entry
│   │       ├── index.ts        # Vercel serverless entry
│   │       ├── routes/         # ai.ts, profile.ts, recipes.ts
│   │       ├── middleware/     # auth.ts (JWT verify), errors.ts (HttpError)
│   │       ├── schemas/        # Zod schemas (source of truth for types)
│   │       ├── lib/            # prisma client, openai client + prompts
│   │       └── tests/          # Vitest + supertest integration tests
│   └── web/                    # React + Vite frontend
│       └── src/
│           ├── routes/         # Auth, VerifyEmail, Home, Catalog, About
│           ├── components/     # Atoms + composites (Button, Modal, RecipeCard, ...)
│           ├── contexts/       # AuthContext, ToastContext
│           ├── hooks/          # useRecipes (React Query + optimistic mutations)
│           ├── lib/            # apiFetch, queryClient, recipe helpers, supabase client
│           ├── types/          # API response shapes
│           └── index.css       # Tailwind v4 @theme tokens
├── .claude/
│   ├── plans/                  # SESSION_2_SPEC, SESSION_3_IMPLEMENTATION, stage-*.md
│   ├── skills/                 # figma-translation/ (auto-fires on frontend tasks)
│   └── settings.json           # Project-level Claude Code config
├── CLAUDE.md                   # Living memory: decisions, errors, deviations
├── STARTUP.md                  # Human prerequisites (Supabase, OpenAI, Vercel, Figma)
└── package.json                # npm workspaces root
```

---

## 🏗️ Architecture at a glance

- 🔐 **Auth.** Supabase Auth (email + password, email verification on). The client SDK holds the session; every backend request carries `Authorization: Bearer <jwt>` and is verified by `authMiddleware`, which also performs a `profile.upsert` so a profile row always exists for the authenticated user.
- 👥 **Tenancy.** App-layer only. Every route extracts `req.userId` from the verified JWT and scopes all Prisma queries to that user. RLS is intentionally **off** — see CLAUDE.md for the reasoning and how to enable it safely.
- 🧠 **AI routes.** All three use OpenAI JSON mode with a 9s per-request timeout (under Vercel's 10s ceiling). `generate-drafts` and `generate-full` silently append the user's dietary preferences to the prompt; `modify` does not — it operates on the recipe as-is.
- ⚡ **Frontend data layer.** A single `['recipes']` TanStack Query holds the full per-user recipe list (`staleTime: Infinity`, fetched once per session). Create / update / delete mutations are optimistic — apply synchronously, fetch in the background, reconcile on success or roll back + toast on failure. Catalog filtering and sorting are entirely client-side over the cached list.

---

## 🛰️ API surface

All routes are mounted under `/api` and require a Supabase JWT, except `/api/health`.

| Method     | Path                       | Purpose                                            |
| ---------- | -------------------------- | -------------------------------------------------- |
| 🟢 GET     | `/api/health`              | Public liveness probe                              |
| 🟢 GET     | `/api/me`                  | Returns `{ userId }` from the verified JWT         |
| 🟢 GET     | `/api/profile`             | Returns the authenticated user's profile + email   |
| 🟡 PUT     | `/api/profile`             | Update display name / dietary preferences          |
| 🟢 GET     | `/api/recipes`             | List the user's recipes (supports search/sort)     |
| 🟢 GET     | `/api/recipes/:id`         | Fetch a single recipe                              |
| 🔵 POST    | `/api/recipes`             | Create a recipe                                    |
| 🟡 PUT     | `/api/recipes/:id`         | Update a recipe                                    |
| 🔴 DELETE  | `/api/recipes/:id`         | Delete a recipe                                    |
| 🔵 POST    | `/api/ai/generate-drafts`  | 3 lightweight draft cards from input + preferences |
| 🔵 POST    | `/api/ai/generate-full`    | Full recipe from a draft (or refine an existing)   |
| 🔵 POST    | `/api/ai/modify`           | Modify a saved recipe via natural-language comment |

---

## 💻 Local dev

### 📋 Prerequisites

Some setup steps are out-of-band (Supabase project, OpenAI key, Figma file, optionally Vercel). They're all in [STARTUP.md](STARTUP.md). Quick checklist:

1. 🟢 Node 18+ and npm 9+
2. 🗄️ A Supabase project (URL, anon key, service key, DB connection strings)
3. 🧠 An OpenAI API key with access to `gpt-4o` and `gpt-4o-mini`
4. 🎨 A Figma file URL — required for the agent during frontend stages, optional for running the app

### ⚙️ Setup

```bash
git clone <repo-url> kp && cd kp
cp .env.example .env          # then fill in real values from STARTUP.md
npm install
npm run -w apps/api prisma:migrate   # apply migrations to your Supabase DB
npm run dev                          # 🚀 api on :3001, web on :5173 (proxied)
```

🌐 Open <http://localhost:5173>.

### 🧪 Useful scripts

| Command                                | What it does                                    |
| -------------------------------------- | ----------------------------------------------- |
| `npm run dev`                          | 🚀 Run api + web concurrently                   |
| `npm run build`                        | 📦 Build both packages                          |
| `npm run test`                         | 🧪 Run Vitest across both packages              |
| `npm run lint`                         | 🧹 ESLint over the workspace                    |
| `npm run format`                       | 🎨 Prettier write                               |
| `npm run -w apps/api prisma:migrate`   | 🧬 Create + apply a new migration               |
| `npm run -w apps/api prisma:studio`    | 🔍 Open Prisma Studio against the configured DB |

---

## 🔑 Environment variables

Single root `.env` shared by both apps via `dotenv-cli`. See `.env.example` for the template.

| Variable                  | Used by  | Purpose                                       |
| ------------------------- | -------- | --------------------------------------------- |
| `VITE_SUPABASE_URL`       | ⚛️ web   | Supabase project URL (client SDK)             |
| `VITE_SUPABASE_ANON_KEY`  | ⚛️ web   | Supabase anon key (client SDK)                |
| `SUPABASE_URL`            | 🛠️ api   | Supabase project URL (admin SDK)              |
| `SUPABASE_SERVICE_KEY`    | 🛠️ api   | 🔒 Service-role key — backend only, never ship |
| `DATABASE_URL`            | 🛠️ api   | Prisma pooled connection (pgbouncer)          |
| `DIRECT_URL`              | 🛠️ api   | Prisma direct connection (migrations)         |
| `OPENAI_API_KEY`          | 🛠️ api   | 🧠 OpenAI API key                              |

---

## 🚀 Deployment

▲ Vercel, single project. Build command `npm run build` (runs per-app builds + `prisma migrate deploy`), output `apps/web/dist`. Backend ships as serverless functions from `apps/api/src/index.ts`. All env vars from the table above must be configured in Vercel for Production / Preview / Development.

Full walk-through in [STARTUP.md §5](STARTUP.md).

---

## 🗺️ Roadmap

- 🛡️ Rate limiting and per-user usage tracking
- 🥗 Nutrition estimation via follow-up AI call, stored alongside the recipe
- 🥫 Pantry mode — generation constrained to ingredients on hand
- 🕰️ Recipe versioning — every AI modification creates a new version row with full revert
- 🖼️ Image uploads — Supabase Storage bucket `recipe-images`, signed upload URLs, delete-on-recipe-delete (path documented in CLAUDE.md)
- 🗓️ Daily Rotation + 📥 Recipe Import (see [Features](#-features))

---

## 📚 Further reading

- 🚀 [STARTUP.md](STARTUP.md) — human prerequisites the agent can't do
- 🧠 [CLAUDE.md](CLAUDE.md) — living memory: architecture decisions, error patterns, spec conflicts
- 📝 [.claude/plans/SESSION_2_SPEC.md](.claude/plans/SESSION_2_SPEC.md) — product + technical spec
- 🗺️ [.claude/plans/SESSION_3_IMPLEMENTATION.md](.claude/plans/SESSION_3_IMPLEMENTATION.md) — implementation roadmap, stage by stage
- 🎨 [.claude/skills/figma-translation/SKILL.md](.claude/skills/figma-translation/SKILL.md) — the skill that gates frontend implementation on component reuse + design-token discipline
