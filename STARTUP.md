# KitchenPal — Startup Guide

Prerequisites you (the human) need to set up. The agent can't do these — they require dashboards, OAuth approvals, API keys, or out-of-band software installs.

Each item is tagged with the implementation stage that first needs it. Stage 1 can start as soon as items marked `[Stage 1]` are done; everything else can land before its stage begins.

---

## 1. Supabase project   `[Stage 1+]`

Required for: DB, Auth, future Storage.

- [ ] Create a Supabase project at <https://supabase.com> → New Project. Pick a region near you.
- [ ] From **Settings → API**, copy and stash:
  - Project URL → `SUPABASE_URL` and `VITE_SUPABASE_URL`
  - `anon` public key → `VITE_SUPABASE_ANON_KEY`
  - `service_role` key → `SUPABASE_SERVICE_KEY` (secret — backend only)
- [ ] From **Settings → Database → Connection string**, copy:
  - "Transaction" pooled string → `DATABASE_URL` (append `?pgbouncer=true` if not present)
  - "Direct" string → `DIRECT_URL` (append `?connection_limit=1`)
- [ ] **Settings → Authentication** → confirm "Confirm email" is on (default).
- [ ] RLS stays **off** — isolation is app-layer per SPEC §2. Don't enable RLS without coordinating with the agent (see CLAUDE.md).

## 2. Supabase MCP (for the agent)   `[Stage 2+]`

Required for: agent inspection of the live DB during development. Read-only. Schema changes still go through Prisma.

- [ ] In a regular terminal (not inside the VS Code extension), run:
  ```
  claude mcp add --scope project --transport http supabase "<your-mcp-url>"
  ```
  The MCP URL is in your Supabase dashboard under **Connect → Claude Code**.
- [ ] In Claude Code: `/mcp` → select the supabase server → Authenticate.
- [ ] Leave read-only off during active development; flip it on for debugging sessions.

## 3. OpenAI API key   `[Stage 3+]`

Required for: the three AI routes (`generate-drafts`, `generate-full`, `modify`).

- [ ] Create an OpenAI account → API Keys → **New secret key**.
- [ ] Stash as `OPENAI_API_KEY`.
- [ ] Verify the account has billing enabled and the API key has access to `gpt-4o` and `gpt-4o-mini`.

## 4. Figma file + Figma MCP   `[Stage 4+]`

Required for: the agent to read screen designs while building the frontend.

- [ ] Confirm a Figma file exists with KitchenPal screens (Auth, VerifyEmail, Home, Catalog, About) and reusable components (recipe card, recipe modal, serving scaler, draft card, add-recipe modal).
- [ ] Install the Figma MCP server. Two paths:
  - **Figma Dev Mode MCP** (official) — enable in Figma desktop app under Preferences → Enable Dev Mode MCP Server.
  - **Community Figma MCP** — `claude mcp add --scope project --transport sse figma "<figma-mcp-url>"` (pick one of the community servers and follow its README).
- [ ] In Claude Code: `/mcp` → Authenticate Figma.
- [ ] Record the Figma file URL in CLAUDE.md (Architecture Decisions log) so the agent has one canonical reference. **Without this URL, Stages 4-6 cannot start.**

## 5. Vercel project   `[Stage 7]`

Required for: deploying.

- [ ] Create a Vercel account, link to the GitHub repo.
- [ ] Import the repo as a new project. Framework preset: "Other" (we use a custom build command).
- [ ] **Settings → Environment Variables** — add every variable from SPEC §9 for Production / Preview / Development:
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DATABASE_URL`, `DIRECT_URL`, `OPENAI_API_KEY`.
- [ ] Build command: `npm run build` (the root script orchestrates per-app builds + `prisma migrate deploy`).
- [ ] Output directory: `apps/web/dist`.

## 6. Production SMTP   `[Pre-launch, deferred]`

Required for: real-world email verification beyond Supabase's 3-emails/hour built-in mailer.

- [ ] Pick a provider — Resend (3K/month free) or Brevo (300/day free).
- [ ] Create the account, verify a sending domain, get an API key.
- [ ] In Supabase: **Authentication → SMTP Settings** → enter provider credentials.

Skip until you're about to invite real users.

## 7. Local `.env` file   `[Stage 1]`

After items 1 and 3 are filled in:

- [ ] Copy `.env.example` to `.env` at the repo root.
- [ ] Paste in every value collected above.
- [ ] Confirm `.env` is gitignored. **Never** commit it.

## 8. Local prerequisites

- [ ] Node 18 or higher — `node -v`
- [ ] npm 9 or higher — `npm -v`
- [ ] Claude Code installed (VS Code extension or CLI)

## Post-MVP: Supabase Storage

Not part of the MVP. When the time comes:

- Create a Storage bucket (likely `recipe-images`) in the Supabase dashboard.
- Add `SUPABASE_STORAGE_BUCKET=recipe-images` to env vars.
- Add an `imageUrl String?` column to `Recipe` via a Prisma migration.
- Add backend routes for signed upload URLs and object deletion (deletion fires on recipe delete).
- Frontend Add/Edit modal grows an image picker; cards and modal swap emoji-on-bg for the uploaded image when present.

Recorded as a decision in CLAUDE.md so the migration path stays consistent when it lands.
