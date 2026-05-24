# CLAUDE.md — KitchenPal Living Memory

**Source of truth for product, architecture, and rules:** [.claude/plans/SESSION_2_SPEC.md](.claude/plans/SESSION_2_SPEC.md).
**Implementation roadmap:** [.claude/plans/SESSION_3_IMPLEMENTATION.md](.claude/plans/SESSION_3_IMPLEMENTATION.md).
**Setup the agent can't do (MCPs, API keys, Vercel, Figma file):** [STARTUP.md](STARTUP.md).

This file is for what doesn't belong in the spec — decisions made during implementation, errors and their fixes, undocumented dependencies, and the current state of the work. Update it the moment you learn something a future agent would have wanted to know.

---

## Current State

```
Status: Stage 6 complete (6a+6b+6c+6d). AddRecipeModal shipped — Add Recipe button on /catalog opens a manual creation form; POSTs with source: 'manual'; catalog refetches on success. 25 components (added Textarea + AddRecipeModal), 24 tokens. Build clean; 36/36 backend tests green.
Last session: Session 20 — Stage 6d (AddRecipeModal)
Next action: Stage 7 — Deployment to Vercel. Requires STARTUP.md items 5 (Vercel project link) + env vars in Vercel + production SMTP (item 6, deferred OK if dev SMTP suffices for first deploy).
Open questions: Edit mode (Pass 5d in final-recipe panel + Pass 6e in RecipeModal) and Filter popover (Pass 6f) still deferred. Schedule explicitly before or after Stage 7 deployment.
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

**[2026-05-24] — Stage 4 splits into 4a (auth + scaffolding) and 4b (shell + About)**
Stage 4 in the master plan was too big for one approval — 4 Figma frames + ~25 files. Split into 4a (Pass 1: Auth chain, atoms, color tokens) and 4b (Pass 2: Nav/Footer/AuthedLayout + Pill + About). Each pass fetches only the frames it needs (4a → login 8:9513; 4b → about 8:8916 + home 8:807 for nav). The master plan's `[ ] Stage 4` flips to `[x]` only after 4b lands.

**[2026-05-24] — Color tokens locked from the login Figma frame (8:9513)**
All Pass 4a colors came from `get_design_context`, not screenshot eyeballing. Primary is `#ff6900` (warmer than Tailwind `orange-500` `#f97316`). Page bg `#f9fafb`, input bg `#f3f3f5`, toggle container bg `#f3f4f6` (note: distinct from input!), heading `#101828`, muted `#4a5565`, placeholder `#717182`. Gradient end (red on the brand gradient) is `#fb2c36`. The 9 tokens live in `apps/web/src/index.css` `@theme`. Pass 4b is expected to add `--color-bg-footer` (`#0f172a`) and nothing else; flag any other token additions in CLAUDE.md.

**[2026-05-24] — Vite reads root .env via `envDir: '../..'`**
`apps/web/vite.config.ts` sets `envDir` to the repo root so `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` come from the same `.env` the backend uses. Don't introduce a second .env in `apps/web/`.

**[2026-05-24] — AuthContext + ProtectedRoute contract**
`useAuth()` exposes `session, user, isLoading, isVerified, signUp, signIn, signOut, resendVerification`. `signUp`/`signIn`/`resendVerification` return `{ error?: string }` (not throw) — routes render errors inline. `isVerified = Boolean(user?.email_confirmed_at)`. `ProtectedRoute` (used as a layout route) returns `null` during `isLoading` to avoid redirect flashes, then redirects to `/` (no session) or `/verify-email` (unverified).

**[2026-05-24] — Inline SVG icons in components, no external icon library**
`LogoMark` inlines the cookpot SVG with `stroke="currentColor"` so it picks up the surrounding text color. The two Figma layer SVGs (downloaded but discarded) didn't compose cleanly into one file; rebuilding the icon as a single React-friendly SVG was simpler. Future icons follow the same pattern unless a real icon-set need emerges.

**[2026-05-24] — Nav labels follow Figma, not SPEC §5.2**
SPEC said "Home | Catalog | About" + user display name in nav. Figma frame 8:336 uses "Recipes | Collections | About | Logout" with no display name. Going Figma — better UX copy and the display name lives prominently on the About screen. Route paths are unchanged (`/home`, `/catalog`, `/about`); only the link labels are different. If SPEC is ever the source of truth again, update this entry.

**[2026-05-24] — About uses inline per-field Edit, not a global Save**
SPEC §5.4 mentioned a Save button on About. Figma frame 8:8916 uses an inline Edit button next to Display Name (toggles to edit-mode with Save/Cancel) and per-pill add/remove for Dietary Preferences. Going Figma — better UX, matches the figma-translation skill's "trust the screenshot" rule. Each save fires one `PUT /api/profile`. Preferences updates are optimistic with rollback on error.

**[2026-05-24] — Active nav link is `text-text-default`, not orange**
The Figma frame `Header` shows nav links in only two states: active (`text-text-default` = `#101828`) and inactive (`text-text-muted` = `#4a5565`). Logout is even lighter (`text-text-footer-muted` = `#99a1af`) with a small icon. There is no orange-active state (despite what an earlier read of the screenshot suggested). `NavLink`'s `isActive` prop drives the active class; active follows current URL, not the Figma's hard-coded "Recipes-as-active" rendering (which is a Figma Make quirk, not the intended behavior).

**[2026-05-24] — `Card` has two variants: `shadow` and `bordered`**
AuthCard uses `shadow` (default, drop shadow no border). About cards use `bordered` (1px `border-border-subtle`, no shadow). Extended the existing `Card` rather than forking — the skill's "80%+ structural match → extend" rule. Future cards: pick a variant; don't add a third one without a real need.

**[2026-05-24] — `AuthedLayout` does not constrain page width**
The Nav and Footer extend to `max-w-[1562px]` (Figma's container width) but the layout's `<main>` is unconstrained. Each route sets its own `max-w-*` wrapper: About uses 896px (per Figma), Home uses 1024px (placeholder), Catalog uses 1024px (placeholder). Stage 5/6 may use wider containers for hero/grid layouts.

**[2026-05-24] — `apiFetch<T>` is the canonical request path**
Defined in `apps/web/src/lib/api.ts`. Attaches `Authorization: Bearer <jwt>` from the active Supabase session, parses JSON, throws `ApiError(status, message)` on non-2xx. Components catch `ApiError` and render `err.message` inline. Don't bypass with raw `fetch`. Don't add Zod runtime validation on the frontend — trust the backend's shape contract via `apps/web/src/types/api.ts`.

**[2026-05-24] — Stage 5 splits into 5a (static home) and 5b (AI generation flow)**
5a shipped: Hero + GenBar + Browse-by-Category (placeholder) + Featured Recipes (placeholder). 5b will add the inline panel slot under GenBar that holds assist → drafts → final panels (single slot, panels replace each other), the GuidedFlow state machine, AI route integrations, and the Pill `accent` variant for recipe-display tags. Master plan's `[ ] Stage 5` flips only after 5b lands.

**[2026-05-24] — GenBar renders pills INSIDE the input (tag-input composite)**
Per Figma frame 8:1775, the recipe-assist guided-flow emits selections as gray pills that live alongside free text inside the GenBar input container. `<GenBar>` exposes `pills: string[]` and `onRemovePill?(p)` props. Pass 5a passes `[]`; Pass 5b passes the live array. Generate button enabled when `pills.length > 0 || value.trim().length > 0`.

**[2026-05-24] — "Discard" in the final-recipe Figma frame is a typo for "Regenerate"**
The final-recipe action row (8:4636) shows Delete / Edit / Discard / Approve. The user confirmed "Discard" is a Figma typo; the intended label is Regenerate. Pass 5b will render Delete / Edit / Regenerate / Approve. Regenerate opens an inline comment field; submission calls `POST /api/ai/generate-full` with `{ input: currentRecipe, comment }` and replaces the recipe in place. SPEC §5.2 was already correct.

**[2026-05-24] — Generation panels are inline, not modal**
Per the three home-state screenshots, the assist / drafts / final-recipe panels appear as inline white cards directly under the GenBar, in a single slot that swaps content as the flow progresses. The Browse-by-Category and Featured Recipes sections remain visible underneath. No `Modal` / `Dialog` primitive needed for the home generation flow. Home owns a `phase: 'idle' | 'assist' | 'drafts' | 'final'` state.

**[2026-05-24] — `Panel` is the shared chrome for generation flow panels**
New in 5b. `apps/web/src/components/Panel.tsx`. White bg + `border-border-subtle` + drop shadow + `rounded-[10px]` + 20px padding. Used by AssistPanel; Pass 5c uses it for DraftsPanel and FinalRecipePanel. Distinct from `Card` because the radius (10px) and shadow+border combo are different from Card's two existing variants (shadow-only / border-only at rounded-2xl). Don't merge into Card.

**[2026-05-24] — `Button` `chip` variant for in-panel choices**
Rounded-full + `bg-bg-page` + `border-border-subtle` + `text-text-body`. 14px Medium. Used by the 7 option buttons in AssistPanel. Skip uses existing `variant="ghost"`. Reuse for future option-button patterns (e.g., catalog tag filter pills in Stage 6 if applicable).

**[2026-05-24] — AssistPanel: "None" in Dietary is omitted; Skip covers it**
The SPEC dietary options include "None" but per SPEC §5.2 "Skip and 'other' are equivalent — advance without adding a pill". Implementation: Dietary options list excludes "None"; user clicks Skip if they have no dietary restriction. Saves one option button visually.

**[2026-05-24] — Pills are owned by Home, GenBar is a pure controlled component**
`pills: string[]` state lifted from GenBar to Home in 5b. GenBar receives `pills` + `onRemovePill` as props. AssistPanel's `onSelect` callback appends to Home's pills (deduped). This makes the assist → pills → generate-drafts pipeline cleaner for Pass 5c.

**[2026-05-24] — Final-recipe view shows `Cook` only (no separate Prep)**
Figma frame 8:4636 displays "Prep: 15 min / Cook: 25 min / Servings: 2", but the backend `Recipe` schema has only a single `cookingTime` field. We render "Cook: {cookingTime} min" + "Servings: {servings}" and omit Prep. If a future iteration splits cooking time into prep+cook, update the schema first, then the display.

**[2026-05-24] — Pill has 3 variants: `default`, `compact`, `accent`**
`default` = gray with Medium weight (current — About prefs + GenBar pills + Featured cards). `compact` = smaller height + 4px radius + bg-bg-toggle (draft keyIngredients). `accent` = peach bg + accent-text color + rounded-full + Regular weight (final recipe tags). All three accept optional `onRemove`. Add a 4th variant only if a future frame can't be served by these three.

**[2026-05-24] — Home owns the AI flow state machine**
`phase: 'idle' | 'assist' | 'drafts' | 'final'` + `busy: 'drafts' | 'full' | 'regenerate' | 'approve' | null` + `pills` + `drafts` + `recipe` + `error` + `toast`. GenBar is dimmed (`opacity-50 pointer-events-none`) while `phase ∈ {drafts, final}`. All four AI calls and the POST /api/recipes (approve) live in Home. No global state, no context.

**[2026-05-24] — Approve transforms snake_case → camelCase before POST /api/recipes**
AI's `FullRecipeResponse` has `cooking_time` (matching the OpenAI JSON-mode contract). Backend's Prisma+Zod expects `cookingTime`. Home's `onApprove` does this transform inline before POSTing. `source` is hardcoded to `'ai_generated'`.

**[2026-05-24] — Edit on the final-recipe panel is deferred to Pass 5d**
Per the screenshot the action row has 4 buttons (Delete, Edit, Regenerate, Approve). Edit requires converting the FinalRecipePanel to controlled inputs — meaningful new code. Pass 5c renders Edit as `disabled` with `title="Coming soon"`. Pass 5d implements it as a standalone polish pass.

**[2026-05-24] — Toast is local Home state, not a global context**
Single `toast: { message, kind } | null` in Home. Auto-dismiss via `setTimeout(3000)`. If a second screen needs to fire a toast (e.g., Catalog after AI modify save), promote to context at that point. Don't over-engineer now.

**[2026-05-24] — Recipe cards are click-only (no inline Edit/Delete)**
SPEC §5.3 said Recipe Cards should have inline Edit + Delete buttons. Figma frame 8:5850 omits them — the card is a single clickable surface that opens the recipe modal (Pass 6b), and Edit/Delete live inside the modal. Going Figma — fewer affordances on the card means less visual noise on the catalog grid; users still get the actions one click in. SPEC overridden here.

**[2026-05-24] — `Pill` has a 4th variant `recipe-tag`**
Used on RecipeCard in catalog + Home featured-recipe cards. `bg-bg-toggle text-text-body rounded-sm h-6 px-2 text-xs font-normal`. Sits between `default` and `compact` visually. Existing variants unchanged.

**[2026-05-24] — Catalog search is debounced 300ms; sort is immediate**
`searchInput` (controlled) → 300ms `setTimeout` → `searchQuery` (debounced) → triggers `useEffect` that fetches `/api/recipes?search=&sort=`. Cancellable via cleanup function. Sort changes fire immediately (no debounce — it's a discrete choice). Filter is a stub button in Pass 6a; Pass 6d adds the popover.

**[2026-05-24] — `RecipeCard` gradient header uses 3 stops**
`linear-gradient(139deg, accent-soft → card-blob-pink → card-blob-yellow)` for the 192px emoji header. The same gradient appears on every card (no per-recipe variation in the Figma). Don't reach for per-recipe colors unless the design changes.

**[2026-05-24] — `Modal` primitive wraps `Panel` chrome**
New in 6b. Centered overlay with semi-transparent backdrop (`bg-black/50`), `max-w-[510px]` content, ESC + click-outside close, body scroll lock. Uses existing `Panel` (`padding="none"`, `rounded-[10px]`, border + shadow) and adds the × close button absolutely positioned top-right. Reused by RecipeModal and (in 6c-onward) AddRecipeModal. **Skip React Portal for MVP** — fixed positioning is sufficient at the current app size; revisit if z-index conflicts emerge.

**[2026-05-24] — `ServingScaler` is view-only**
Per SPEC §5.3: the base recipe is never modified. Scaler state lives inside the modal and resets when the modal unmounts. Catalog mounts `<RecipeModal>` conditionally (`{selectedRecipe && <RecipeModal recipe={selectedRecipe}/>}`) so switching recipes triggers a fresh mount (and fresh scaler state). Don't memoize `recipe.servings` initial value without explicit reset logic — leave the unmount-mount cycle to handle it.

**[2026-05-24] — Ingredient scaling: nearest 0.25**
Formula `Math.round(amount * ratio * 4) / 4` per SPEC §5.3. Display via `formatAmount(n)` — currently just `String(n)` for MVP; could upgrade to fraction display (`0.5` → `½`) in a polish pass.

**[2026-05-24] — Delete uses native `window.confirm()`**
Simple and effective for MVP. Modal-on-modal would over-engineer the experience for a single destructive action. Replace with a custom confirm dialog only if delete becomes a higher-stakes operation.

**[2026-05-24] — AI Modify is inline-panel + footer-swap, not modal-on-modal**
Per Figma 8:8139, clicking "Modify with AI" inside `RecipeModal` opens a peach-tinted panel between Instructions and the footer; footer action row swaps from `Modify/Edit/Delete` to `Discard/Approve`. Local `recipe` state in RecipeModal is mutated by `/api/ai/modify`; revert on Cancel/Discard returns to `initialRecipe` (the prop). Approve is gated on `isModified` (`recipe !== initialRecipe`) to avoid no-op PUTs. Approve sends `source: 'ai_modified'` to backend.

**[2026-05-24] — `toRecipeBody(recipe)` helper for backend writes**
Recipe from DB has full row (id, userId, createdAt, updatedAt). Backend write endpoints (`POST /api/recipes`, `PUT /api/recipes/:id`, `POST /api/ai/modify`) expect `RecipeBody` shape — content fields only. `toRecipeBody(recipe)` (in RecipeModal) drops the row metadata and returns the editable subset. Reuse this pattern for AddRecipeModal in Pass 6d and any future write paths.

**[2026-05-24] — `Textarea` atom mirrors `Input`**
Multi-line `<textarea>` with `bg-bg-input` default + focus ring + `resize-none`. Used by AddRecipeModal (description + step rows). Modify panel in RecipeModal still uses inline `<textarea>` styling; refactor when adding a 3rd consumer.

**[2026-05-24] — AddRecipeModal: amount input is free-text, parsed on submit**
Two-column ingredient table matches the Figma: Amount + Ingredient. The Amount cell takes a free-text string ("1 cup", "150 g") and parses on submit via `/^([\d.]+)\s*(.*)$/`. Non-numeric leading values (e.g., "to taste") trigger an inline error. Keeps the UX visually simple while satisfying the backend's `{ amount: number, unit: string }` shape.

**[2026-05-24] — AddRecipeModal: emoji auto-assigned from a 15-item list**
Random food emoji chosen at mount via `useState(() => EMOJIS[...])`. No UI to change (matches Figma omission). SPEC §5.3's "user can change emoji" is deferred until Edit mode lands.

**[2026-05-24] — AddRecipeModal tag input supports comma-separated bulk-add**
Typing "Italian, Quick" + Enter adds both pills in one go. Empty or duplicate values are filtered. Matches the Figma placeholder hint without sacrificing single-tag-at-a-time UX.

---

## Error Patterns

> Errors, causes, fixes. Added when encountered.

---

## Undocumented Dependencies

> Libraries or config not in the spec but required for things to work. Added when discovered.

---

## Spec Conflicts

> Conflicts between the spec and observed reality, with the resolution. Don't silently deviate.
