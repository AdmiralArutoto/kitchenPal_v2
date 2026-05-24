# Stage 6a — Catalog list (read-only)

> First slice of Stage 6 of [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md). Pass 6b adds the recipe modal + scaler + AI modifier; 6c adds the manual Add Recipe modal.

## Goal

`/catalog` becomes a real page: header with recipe count + Add Recipe button (stub), search input + Sort dropdown + Filter button (stub), and a 3-column grid of `RecipeCard`s populated from `GET /api/recipes`. Card click is a stub (`console.log`) — Pass 6b wires the recipe modal.

End of pass: user can land on `/catalog` after approving a recipe in Home, see it in the grid, type to search by name, sort by Newest/Oldest/A-Z/Z-A.

## Prerequisites

- Stage 5 complete — approvals from Home save to `/api/recipes`.
- Backend Stage 3 endpoint `GET /api/recipes` already supports `search` (case-insensitive name substring), `tags` (CSV OR), and `sort` (`newest | oldest | name_asc | name_desc`).

## Decisions baked in

- **2 new color tokens** for the card emoji-header gradient:
  - `--color-card-blob-pink: #ffe2e2` (mid stop)
  - `--color-card-blob-yellow: #fef9c2` (end stop)
  - Start stop reuses existing `--color-accent-soft: #ffedd4`.
- **New `Pill` variant `recipe-tag`** — `bg-bg-toggle`, `text-text-body`, `rounded-sm`, `h-6`, `px-2 py-1`, 12px Regular. Used by RecipeCard in catalog **and** by the Featured Recipes section on Home (small retrofit). Existing `default` / `compact` / `accent` variants unchanged.
- **No inline Edit/Delete on cards** — Figma omits them; actions live in the modal (Pass 6b). SPEC §5.3 conflict logged in CLAUDE.md.
- **Search:** debounced 300ms; sends `?search=` query param to `GET /api/recipes` on each change.
- **Sort dropdown:** custom dropdown component (small popover triggered by the button). Options: Newest / Oldest / A-Z / Z-A (mapped to backend's `newest`, `oldest`, `name_asc`, `name_desc`).
- **Filter button:** stub for 6a — clickable but no popover yet. Pass 6d adds the multi-select tag UI.
- **Add Recipe button:** stub — `console.log('Add Recipe clicked')`. Pass 6c adds the manual form modal.
- **Loading + empty + error states:** Loading = "Loading recipes…" centered. Empty (no recipes match) = "No recipes yet — generate one from Home or click Add Recipe." Empty (search/filter returns 0) = "No recipes match your search." Error = inline red text.
- **Card click** = `console.log(recipe.name)` placeholder. Pass 6b wires it to open the modal.

## Decomposition (from Figma `8:5850`)

**Page layout:**
- Outer: `bg-bg-page` (already inherited from AuthedLayout), content max-w `[1024px]`, `mx-auto`, `pt-12 px-6 pb-12`
- Inside: `flex flex-col gap-8`

**Header row** (flex justify-between):
- Left column:
  - `<h1>` "My Recipe Collection" — `text-3xl font-medium text-text-default leading-9` (30px Medium)
  - `<p>` "{N} recipes in your collection" — `text-base text-text-muted` (16px Regular)
- Right: `<Button>` primary with leading + icon — "Add Recipe"

**Search + Sort + Filter row** (flex gap-2):
- Search `<Input>` variant with search icon prefix:
  - Currently `Input` has no icon prop; either extend it or compose `<div className="relative"><Icon className="absolute"/> <Input className="pl-10"/></div>` inline
  - I'll go with **composing inline** (keep Input simple). Width `w-[448px] max-w-full`.
- Right group `flex gap-2`:
  - **Sort dropdown** — new mini-component or inline. Button label = current sort label, with sort icon + chevron-down. Clicking shows a small popover with 4 options.
  - **Filter button** (stub) — `<Button variant="secondary">` with filter icon + "Filter".

**RecipeCard** (`8:6412`):
- `bg-bg-card border border-border-subtle rounded-[14px] overflow-hidden`
- Top section (h-48, 192px): gradient bg `linear-gradient(139deg, var(--color-accent-soft), var(--color-card-blob-pink), var(--color-card-blob-yellow))`, centered emoji at `text-7xl`
- Body (`p-4`, `flex flex-col gap-3`):
  - Title `text-base font-semibold text-text-default` (line-clamp-1)
  - Description `text-sm text-text-muted` (line-clamp-2, fixed h-10 for consistent card heights)
  - Meta row (`flex gap-3 text-sm text-text-muted`): clock icon + cookingTime min, people icon + servings
  - Tags row (`flex flex-wrap gap-1`): `<Pill variant="recipe-tag">` for each tag
- `<button>` wrapper makes the card clickable; `hover:shadow-md` for affordance

**Empty state** — centered in grid area:
- "No recipes yet" + small subtitle prompting to add one

## Files

### Created

| Path | Purpose |
|---|---|
| `apps/web/src/components/RecipeCard.tsx` | Clickable card with gradient emoji header + title + description + meta + tags. Props: `recipe: Recipe`, `onClick: () => void`. |
| `apps/web/src/components/SortDropdown.tsx` | Mini popover-style dropdown for sort options. Props: `value, onChange, options`. Closes on outside click and Escape. |

### Modified

| Path | Change |
|---|---|
| `apps/web/src/index.css` | Add 2 new tokens (`--color-card-blob-pink`, `--color-card-blob-yellow`) |
| `apps/web/src/components/Pill.tsx` | Add `recipe-tag` variant: `bg-bg-toggle text-text-body rounded-sm h-6 px-2 text-xs font-normal` |
| `apps/web/src/routes/Catalog.tsx` | Rewrite from placeholder to full impl. Owns search/sort/recipes state; `useEffect` fetches `/api/recipes` on mount + when search/sort changes (debounced). |
| `apps/web/src/routes/Home.tsx` | Update Featured Recipes pills to `variant="recipe-tag"` for consistency |
| `apps/web/src/components/index.ts` | Export `RecipeCard`, `SortDropdown` |

## Commands

```bash
npm run dev    # log in, /catalog
```

## Verification

1. `npm run build -w apps/web` clean.
2. `npm test` backend still 36/36.
3. Hex grep across `components/` and `routes/` → zero matches outside `index.css`.
4. **Flow:**
   - Approve a recipe on `/home` (or use existing ones) → navigate to `/catalog` → see the recipe(s) in the grid.
   - Type "pasta" in search → grid filters to matching recipes after 300ms debounce.
   - Click Sort → popover opens with 4 options → click "A-Z" → recipes re-sort alphabetically.
   - Click a card → console logs the recipe name (stub).
   - Click Add Recipe → console logs (stub).
   - Click Filter → no visible action (stub).
5. **Empty states:**
   - Fresh account with no recipes → shows "No recipes yet" message.
   - Search for nonsense → shows "No recipes match your search."
6. **Cross-user isolation:** second account sees only its own recipes (verifies backend scoping still works).
7. Visual fidelity to Figma `8:5850` at desktop: header layout, search/sort row, card grid, gradient emoji headers, gray tag pills.

## Deferred

- **Recipe modal** (card click) → Pass 6b.
- **Modal/Dialog primitive component** → Pass 6b.
- **Serving scaler** → Pass 6b.
- **AI modifier flow** → Pass 6b.
- **Delete recipe (with confirm)** → Pass 6b (inside modal).
- **Add Recipe modal (manual form)** → Pass 6c.
- **Filter UI (multi-select tag popover)** → Pass 6d.
- **Inline Edit on the card** → Per Figma, deferred indefinitely (no inline edit; Edit happens in modal). Pass 5d-style polish if ever needed.

## Notes for Pass 6b

- The card click handler in 6a is a stub. 6b replaces it with `setSelectedRecipe(recipe)` and renders a `<RecipeModal recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} />` overlay.
- Modal needs a new primitive `<Modal>` component — fixed overlay + backdrop + centered content. Reusable for AddRecipeModal in 6c.
- `RecipeCard` in 6a is read-only display. In 6b the inline emoji header gradient stays unchanged; modal expands it to full recipe view.
- After modal Delete or AI Modify completes, the Catalog page needs to refetch. Either expose `onRefresh` callback or use a key bump.

## Completion

When verification is green:
- Sub-plan checked in.
- No master-plan box flip (Stage 6 only ticks after the modal + add flows land).
- CLAUDE.md Current State: "Stage 6a complete — catalog list shipped. Pass 6b next: recipe modal."
- New Architecture Decisions: 2 new tokens; Pill 4th variant `recipe-tag`; Figma omits inline card actions (no Edit/Delete on the card itself); search debounced 300ms.
