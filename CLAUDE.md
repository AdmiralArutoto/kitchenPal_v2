# CLAUDE.md — KitchenPal Living Memory

**Source of truth for product, architecture, and rules:** [.claude/plans/SESSION_2_SPEC.md](.claude/plans/SESSION_2_SPEC.md).
**Implementation roadmap:** [.claude/plans/SESSION_3_IMPLEMENTATION.md](.claude/plans/SESSION_3_IMPLEMENTATION.md).
**Setup the agent can't do (MCPs, API keys, Vercel, Figma file):** [STARTUP.md](STARTUP.md).

This file is for what doesn't belong in the spec — decisions made during implementation, errors and their fixes, undocumented dependencies, and the current state of the work. Update it the moment you learn something a future agent would have wanted to know.

---

## Current State

```
Status: Daily Recipe Rotation shipped (Stage 9). Home now hosts a "Today's Recipes" feed of 6 cards per user per UTC day, generated lazily on first GET /api/recommendations and cached in the new `daily_batches` table (unique [userId, batchDate]). Each card has Save / Modify / Dismiss actions. Replaces the mock Featured Recipes section. Reuses Stage 8 image pipeline (gpt-image-1-mini) so cards display with real food photography on first paint. Build clean; 65/65 backend tests green. Three image mutation hooks (generate/upload/remove) follow the existing cache-patch pattern. AI recipes auto-generate an image in the background after Approve; manual recipes get a picker in AddRecipeModal (Upload | Generate with AI | Skip); RecipeModal view mode has Regenerate/Upload/Remove. RecipeCard + RecipeModal hero fall back to emoji-gradient when imageUrl is null. ImageProvider interface ready for Flux 1.1 Pro swap via env var. Build clean; 59/59 backend tests green.
Last session: Session 24 — Stage 9 daily recipe rotation (TheMealDB + OpenAI normalization + auto images).
Next action: Stage 7 (Vercel deploy) still parked. No outstanding in-app TODOs; awaiting next user-proposed feature/polish.
Open questions: None active.
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

**[2026-05-24] — `RecipeEditForm` is the single recipe-form surface**
Created during combined pass 5d/6e/6f. All three editor entry points — Add Recipe (`AddRecipeModal`), Edit Recipe on Catalog (`RecipeModal` in editing mode), Edit on the inline final-recipe panel (`FinalRecipePanel` in editing mode) — render the same `<RecipeEditForm>`. The form owns its own state seeded from `initialValues: RecipeFormValues` and calls `onSave(values)` once validated. Each call site owns persistence: AddRecipeModal POSTs, RecipeModal PUTs with `source` preserved, FinalRecipePanel just mutates parent state via `onEdit` (Approve commits later). Snake_case ↔ camelCase translation happens at the call site, not in the form. Any future change to ingredient parsing, tag bulk-add, or step UX lands once.

**[2026-05-24] — `FinalRecipePanel` Edit is in-memory only**
Pass 5d: Edit on the generated final-recipe panel does NOT call the backend. It mutates the local `recipe` state in `Home.tsx` via `onEdit(updated)` and exits edit. The recipe only persists when the user clicks Approve (which still POSTs `source: 'ai_generated'`). This keeps the flow consistent — the AI flow is "generate → maybe tweak → approve to save" — and avoids creating draft DB rows.

**[2026-05-24] — `RecipeModal` Edit preserves `source`**
Pass 6e: Saving an edit in the catalog modal PUTs `/api/recipes/:id` with the recipe's existing `source` value (`ai_generated`, `ai_modified`, or `manual`). Manual edits do NOT promote a recipe to `ai_modified` — that status is reserved for AI-driven mutations via `/api/ai/modify`. The two paths are distinct in the data model and stay distinct in the UI.

**[2026-05-24] — `FilterPopover` mirrors `SortDropdown` interaction model**
Pass 6f. Outside-click + Escape close, same `useRef` + `useEffect` pattern. Multi-select listbox with checkbox icons (no extra dependency); "Clear all" footer only renders when ≥1 tag is active. OR semantics — selecting any tag includes recipes that match at least one (`hasSome` on the backend, matches `?tags=a,b` parsing). Active button gets `border-primary text-primary` so it's visually distinct from the inactive secondary state.

**[2026-05-24] — Catalog's `allTags` is cached when no filter/search is active**
The available-tags list is unioned across `recipes` from the most recent fetch AND sorted alphabetically. But it's only updated when both `selectedTags.length === 0` and `searchQuery === ''` — otherwise the popover would prune itself as the user selects (because filtering narrows the result set, and recomputing from a narrowed set would drop unselected tags from the menu). Cost: if the user adds a recipe with a new tag while a filter is active, the new tag won't appear in the popover until the filter is cleared and the next fetch completes. Acceptable for MVP.

**[2026-05-24] — AddRecipeModal tag input supports comma-separated bulk-add**
Typing "Italian, Quick" + Enter adds both pills in one go. Empty or duplicate values are filtered. Matches the Figma placeholder hint without sacrificing single-tag-at-a-time UX.

**[2026-05-24] — Recipe caching via @tanstack/react-query**
Single `['recipes']` query in [apps/web/src/hooks/useRecipes.ts](apps/web/src/hooks/useRecipes.ts) holds the full per-user recipe list. Configured in [apps/web/src/lib/queryClient.ts](apps/web/src/lib/queryClient.ts) with `staleTime: Infinity, refetchOnWindowFocus: false, refetchOnMount: false` — fetch once per session; mutations keep the cache accurate. Backend stays unchanged. Picked React Query over a hand-rolled context because the `onMutate`/`onError`/`onSuccess` triple gives us optimistic + rollback + reconcile uniformly across three mutation hooks (create/update/delete) with no bespoke snapshot/restore code to maintain.

**[2026-05-24] — Optimistic mutations: snapshot → apply → fetch → reconcile/rollback**
All recipe writes use the same pattern in [apps/web/src/hooks/useRecipes.ts](apps/web/src/hooks/useRecipes.ts):
- `onMutate` cancels in-flight queries, snapshots the cache, applies the change synchronously (insert with temp id / merge / filter), returns the snapshot in context.
- `onSuccess` reconciles by replacing the optimistic entry with the server response (picks up real `id`, `updatedAt`, normalized fields).
- `onError` restores the snapshot and surfaces a toast via [useToast()](apps/web/src/contexts/ToastContext.tsx).

Temp ids use `crypto.randomUUID()` prefixed with `temp-`. Call sites (`Home.onApprove`, `AddRecipeModal.handleSave`, `RecipeModal.handleSaveEdit`/`handleDelete`/`approveModification`) all fire the mutation **without `await`** and then close/exit-mode immediately. The mutation continues regardless of component unmount.

**[2026-05-24] — Catalog filters/sorts client-side**
[Catalog.tsx](apps/web/src/routes/Catalog.tsx) no longer sends `?search=&tags=&sort=` to the backend — it reads the full list from `useRecipes()` and applies `searchQuery` (case-insensitive name contains), `selectedTags` (`some()` match — OR semantics), and `sort` (createdAt/name) in a `useMemo`. The backend handler still accepts those params (unused; left in place). `allTags` derives directly from the unfiltered cache, so the "freeze tag list while filtering" trick is gone. Search is still debounced 300ms but the debounce now only batches state updates — there's no network call to defer.

**[2026-05-24] — RecipeModal local recipe state syncs with cache when idle**
[RecipeModal.tsx](apps/web/src/components/RecipeModal.tsx) keeps a local `recipe` state for the AI-modify flow (where the modal needs to display modifications before they're committed). Added `useEffect(() => { if (mode === 'idle') setRecipe(initialRecipe) }, [initialRecipe, mode])` so that when the cache updates (from optimistic edit save success, or rollback on failure), the modal reflects the change. Guard on `mode === 'idle'` prevents the sync from clobbering in-progress AI-modify or edit-form state.

**[2026-05-24] — Catalog re-syncs `selectedRecipe` from cache**
After a mutation updates the cache, Catalog's `selectedRecipe` (used to control which modal is open) is stale. [Catalog.tsx](apps/web/src/routes/Catalog.tsx) runs an effect: `if fresh = recipes.find(id) is undefined → close modal; else if fresh !== selectedRecipe → setSelectedRecipe(fresh)`. Together with RecipeModal's idle sync, this means the modal stays open and shows the new content after an Edit/AI-modify approve, but closes cleanly after a Delete.

**[2026-05-24] — Shared ToastProvider promoted from Home**
Toast was previously a single-toast local state in Home. Now lives at App root via [ToastProvider](apps/web/src/contexts/ToastContext.tsx) + [ToastViewport](apps/web/src/components/ToastViewport.tsx). Provider holds an array (stacks multiple toasts), auto-dismisses each after 3s, supports `success` / `error` kinds. Used by Home (approve success) and every mutation hook in `useRecipes.ts` (failure rollback). Toast.tsx kept but its positioning classes were removed; ToastViewport now owns positioning (`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2`).

**[2026-05-24] — `toRecipeBody` moved to [lib/recipe.ts](apps/web/src/lib/recipe.ts)**
Was a private helper inside RecipeModal. Now a shared utility that both RecipeModal (for AI modify input + AI-modified approve) and the hook layer reference indirectly. Exports `RecipeBody` type too — the canonical shape sent to POST/PUT.

**[2026-05-24] — Stage 7 (deployment) is parked, not cancelled**
User decision: keep focus on local dev iteration; resume deployment work later. SPEC §10 success criteria can still be ticked locally against the dev environment. The master plan's `[ ] Stage 7` stays unchecked. When ready, work through STARTUP.md items 5 (Vercel) + 6 (production SMTP) and follow `.claude/plans/SESSION_3_IMPLEMENTATION.md` Stage 7 deliverables.

**[2026-05-25] — Stage 8 image storage: public bucket + UUID keys**
Bucket `recipe-images` is **public** in Supabase Storage. Object keys are `{userId}/{recipeId}-{uuid}.{ext}` — unguessable, so the practical exposure of a "public" bucket is near zero for a private vault. Public buys permanent browser-cacheable CDN URLs with no signed-URL refresh code. Don't switch to a private bucket without first adding signed-read URL refresh logic in both `lib/storage.ts` and the frontend image consumers. Key extension is derived from MIME (`image/png|jpeg|webp` → `png|jpg|webp`; falls back to `png`).

**[2026-05-25] — Image generation timing: background after Approve**
AI recipes don't get an image during the generation flow — the FinalRecipePanel still shows emoji. `Home.onApprove` fires `useCreateRecipe.mutate(..., { onSuccess: real => generateImageMutation.mutate(real.id) })`. The recipe lands in Catalog with emoji fallback; ~15-30s later DALL-E finishes and the cache patches in the real image. Chosen over inline-before-approve to save DALL-E cost on the regen-heavy path: each regenerate of a recipe text otherwise burns another image. On-demand image regeneration is exposed via the RecipeModal view-mode action row (Regenerate/Upload/Remove).

**[2026-05-25] — `ImageProvider` interface lets us swap providers via env var**
`apps/api/src/lib/image-provider.ts` exports a one-method interface and selects the implementation via `IMAGE_PROVIDER` env var (`openai` default, `flux` is a stub that throws 501). The OpenAI provider uses `gpt-image-1-mini` at `medium` quality, `1024x1024`. When swapping to Flux 1.1 Pro (via Replicate or fal.ai), implement `fluxProvider.generate` and flip the env var. No route changes needed. Per-call timeout is overridden to 60s (image gen ≠ chat — the default 9s ceiling is too tight).

**[2026-05-25] — Use `gpt-image-1-mini` not DALL-E 3 (deprecated)**
First Stage 8 implementation used `dall-e-3` model with `response_format: 'url'` and `quality: 'standard'`. First test run hit 502s; OpenAI has deprecated DALL-E 3. Swapped to `gpt-image-1-mini` at `medium` quality. Important behavior differences from DALL-E:
- gpt-image-1 family does **NOT** support `response_format` — always returns base64 in `data[0].b64_json`. Don't pass `response_format` or the API errors.
- Quality scale is `low | medium | high | auto` (NOT `standard | hd`).
- Decoding: `Buffer.from(b64, 'base64')` directly; no URL fetch step.
Cost: ~$0.005 per medium 1024×1024 (vs DALL-E 3 standard $0.040), per OpenAI pricing late-2025. About 8× cheaper for our use case.

**[2026-05-25] — Image generation timeout is the OpenAI gpt-image-1 ceiling**
Per-call timeout in `image-provider.ts` is 60s. gpt-image-1-mini medium quality typically completes in 10-25s. The OpenAI SDK retries failed requests by default (2 retries with backoff), so a hard rejection may stretch to ~10s wall time before our 502 surfaces. Don't increase the timeout without also disabling SDK retries or you'll wait several minutes on a stuck request.

**[2026-05-25] — `req.params.id` typing pattern for shared route helpers**
Express's default `Request.params` is `ParamsDictionary` (Record<string,string>), not `{ id: string }`. Free-function helpers that take `req: Request` cannot use `Request<{ id: string }>` because Express passes the broader handler type at call sites — that produces a TS2345 mismatch. Pattern in `recipes.ts` `ownedRecipe`: take `req: Request`, then `const id = (req.params as Record<string, string>).id`. Don't try to narrow with a generic.

**[2026-05-25] — `apiFetch` skips `Content-Type` for FormData bodies**
Browser must set the multipart boundary itself. `apps/web/src/lib/api.ts` checks `init.body instanceof FormData` and omits the JSON Content-Type header in that case. Used by `useUploadImage` for recipe image uploads. Don't manually set Content-Type on FormData calls — the boundary will be missing and the backend will fail to parse.

**[2026-05-25] — Vercel deploy needs Pro tier for the image-generate route**
DALL-E 3 latency (10-30s) exceeds Vercel hobby's 10s function timeout. Local dev (`tsx watch`) has no timeout so this is invisible today. When Stage 7 unparks: either upgrade to Vercel Pro (60s default, 300s with config) for that route, or move image generation to a background worker (Inngest, QStash). Documented as a deploy-time concern in STARTUP.md item 9.

**[2026-05-25] — `RecipeEditForm` has an optional `imageSlot` override**
The form's right-column hero defaults to the emoji-gradient block (used by RecipeModal edit mode + FinalRecipePanel edit). AddRecipeModal passes an `imageSlot` ReactNode that replaces the hero with its image-picker UI (Upload/Generate with AI/Skip + preview). This avoids forking the form for "new with image picker" vs "edit without one". RecipeModal edit mode does NOT pass imageSlot because image controls live in view mode — image management is decoupled from text-field editing.

**[2026-05-26] — Daily rotation: lazy, date-keyed, 6 cards, reuses image pipeline**
`GET /api/recommendations` returns `{ batchDate, recipes[6] }`. Backend looks up `DailyBatch` for `(userId, today=UTC YYYY-MM-DD)`. Cache hit → return. Cache miss → 6 parallel slots: TheMealDB random.php → OpenAI normalize (with skip+retry on dietary conflict, max 3 retries) → gpt-image-1-mini → upload to `daily-batches/{userId}/{batchDate}-{slot}-{uuid}.png`. Persist via `dailyBatch.create`; race on the unique index falls back to re-reading the winning row (P2002 catch). First-of-day request takes ~30-60s; subsequent are instant. Cost per batch: ~6 chat + 6 images ≈ **$0.09**.

**[2026-05-26] — Daily-rotation Save reuses the batch's imageUrl (no re-upload, no copy)**
`RecommendationCard.handleSave` POSTs the recipe to `/api/recipes` with `source: 'daily_rotation'` AND passes the batch's `imageUrl` through. The new Recipe row points to the same storage blob the DailyBatch row already references. No `imageWork` is set on `useCreateRecipe` (the image is already in storage). On day rollover the DailyBatch row is replaced but the blob stays — orphaned blobs are tiny and ignored at MVP scale (Stage 9 deferred list).

**[2026-05-26] — `recipes.imageUrl` is optional on `RecipeBody` frontend type**
Added `imageUrl?: string | null` to `apps/web/src/lib/recipe.ts` `RecipeBody`. Existing call sites (AI approve, manual create, edit) don't pass it (defaults to null on the backend); daily-rotation Save does. The backend Zod `RecipeBodySchema` already accepted it from Stage 8.

**[2026-05-26] — Frontend recommendations query key embeds today's UTC date**
`useRecommendations` uses `queryKey: ['recommendations', todayUTC()]`. A new UTC day produces a different cache key → automatic refetch on the next mount. Old date entries get garbage-collected on cacheTime expiry. Trade-off: if the user keeps Home open past midnight, they need to refresh to get today's batch — acceptable for MVP. Don't add date-watching effects without a real complaint.

**[2026-05-26] — Daily rotation Modify keeps the existing image (no regen)**
When the user clicks Modify on a rotation card, the new text comes from `/api/ai/modify` but the imageUrl stays as-is. The image is now technically stale (it depicts the pre-modification recipe). Trade-off chosen for MVP: regenerating on every Modify would burn ~$0.005/modify and add 10-30s wait, for marginal gain. If the user Saves the modified card, the saved Recipe carries the stale image; they can regenerate from the recipe modal later. Documented over re-implemented.

**[2026-05-26] — DailyRotationFeed loading state is 6 skeleton cards, not a spinner**
First-of-day load is 30-60s. A centered spinner over an empty page would feel broken. The skeleton cards (animate-pulse on bg-bg-input blocks matching the eventual card layout) make the wait readable as "content is coming" rather than "is something wrong?". Same pattern other long-load Sections should use.

**[2026-05-25] — Post-create image work goes through `useCreateRecipe`'s mutation variables, NOT a per-call `onSuccess`**
First Stage 8 implementation passed `{ onSuccess: real => generateImageMutation.mutate(real.id) }` as the per-call options arg to `createMutation.mutate(...)`. This silently failed in two places: AddRecipeModal (which calls `onClose()` immediately after `mutate`, unmounting the component) and Home.onApprove (similar pattern with state reset). React Query v5 documents this: **per-call `mutate(vars, { onSuccess })` callbacks are dropped if the calling component unmounts before the mutation resolves**. Hook-level `onSuccess` defined in `useMutation({ onSuccess })` is the one that survives unmount.

Fix: `useCreateRecipe` now takes `CreateRecipeVars = { body: RecipeBody; imageWork?: ... }`. The hook's onSuccess inspects `vars.imageWork` and fires the follow-up via direct `apiFetch` (bypassing the image hooks entirely — those hooks' tear-down would otherwise cancel the work). Cache patching uses the shared `patchRecipeInCache` helper. Call sites pass `imageWork: { type: 'generate' }` (Home approve) or `{ type: 'upload', file }` (AddRecipeModal). RecipeModal's direct calls to `useGenerateImage`/`useUploadImage`/`useRemoveImage` are unchanged — they work because the modal stays mounted during those operations.

**Rule:** Don't chain mutations via per-call `onSuccess` when the caller closes/unmounts immediately. Either await `mutateAsync` before closing, or push the chain into the hook's static `onSuccess`.

**[2026-05-25] — Image controls in RecipeModal are independent of edit mode**
In RecipeModal view mode, below the image: Regenerate/Upload/Remove buttons fire the relevant mutation immediately against `recipe.id`. They do NOT live inside the edit form because images are managed independently of text fields — the modal shows the cache, the cache patches when image mutations resolve, the modal re-renders. This keeps both surfaces simple and avoids edit-mode race conditions where uploaded-but-unsaved would need its own state.

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
