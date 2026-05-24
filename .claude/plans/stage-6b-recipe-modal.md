# Stage 6b — Modal primitive + RecipeModal (view + scaler + delete)

> Second slice of Stage 6 of [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md). Pass 6c adds the AI Modify flow inside the modal. Pass 6d adds the AddRecipeModal (manual creation).

## Goal

Clicking a `RecipeCard` on `/catalog` opens a centered overlay modal showing the full recipe: title + emoji header, time + scalable servings, tags, ingredients (bulleted, with live-scaled amounts), instructions (numbered with peach bullets), and an action row. Delete is functional. Modify with AI + Edit are placeholder stubs (Pass 6c + later).

End of pass: a user can drill into any recipe from the catalog, scale servings to see ingredient amounts update live, delete a recipe with a confirmation.

## Prerequisites

- Stage 6a done — catalog grid + RecipeCard with `onClick` stub.
- Backend `DELETE /api/recipes/:id` already in place (Stage 3).

## Decisions baked in

- **New `Modal` primitive** — fixed inset-0 overlay (semi-transparent black backdrop), centered content, ESC close, click-outside close, body scroll lock on open. Renders × close button in top-right of the panel chrome.
- **`Modal` uses `Panel` chrome internally** — same `rounded-[10px]`, border, shadow. Modal wraps Panel with the overlay/backdrop/positioning behavior. Reuse-over-recreate per the skill.
- **`RecipeModal`** is a content component inside `<Modal>`. Props: `recipe`, `onClose`, `onDelete`. Owns its own `servingsOverride` state (resets on close).
- **`ServingScaler`** — new atom. Props: `value`, `min` (default 1), `onChange`. Renders − button | "N servings" | + button (matching Figma's 24×24 round-bordered buttons with 12px icons). Decrement disabled at `min`. **View-only — never writes to DB.**
- **Ingredient scaling formula:** `scaledAmount = round(ingredient.amount * (servingsOverride / baseServings) * 4) / 4` — nearest 0.25 per SPEC §5.3. Display formatting: drop trailing `.00`, show fractions where possible (`0.5` → `0.5`; `0.25` → `0.25`). For MVP, just numeric (no fraction conversion).
- **Modify with AI button → stub.** Pass 6c implements the inline comment input + `POST /api/ai/modify` + Approve/Discard state machine.
- **Edit button → stub.** Disabled with `title="Coming soon"`. Same deferral as Pass 5c's Edit on FinalRecipePanel.
- **Delete confirmation = native `window.confirm()`** — keeps the UX simple, no extra component. Per SPEC: "delete with confirmation".
- **Delete flow:** confirm → `DELETE /api/recipes/:id` → close modal → trigger catalog refresh (callback `onDeleted`). Catalog re-fetches the list.
- **Pill variant on tags inside modal** = existing `default`. Figma uses h-22px; our default is h-30px — visual difference is small enough that reuse beats adding a 5th variant.
- **Delete button red color** uses `--color-danger` (existing `#e7000b`). Figma's `#d4183d` is ~5% different; reuse rather than add a new token.
- **Ingredient bullets** use `text-primary` orange `•` — no new component, just inline markup.
- **No new color tokens.**

## Decomposition

**Modal primitive:**
- `<div role="dialog" aria-modal="true">` at fixed inset-0
- Backdrop layer: `absolute inset-0 bg-black/50` — click closes
- Centered content wrapper: `relative max-w-[510px] max-h-[90vh] overflow-y-auto` wrapping a Panel
- × close button: `absolute right-4 top-4` with X icon, opacity-70 hover:opacity-100
- ESC handler via `useEffect` listening to keydown
- Body scroll lock via `document.body.style.overflow = 'hidden'` on open + restore on close

**RecipeModal content:**
- **Header row:** title (24px Semi Bold text-default) + description (16px Regular text-placeholder) on left; 60px emoji on right
- **Meta row** (with bottom border `border-b border-black/10`):
  - Left: clock icon + `cookingTime` min (14px Regular text-body)
  - Right: users icon + `<ServingScaler>` (replaces static "N servings")
- **Tags row:** `<Pill>` for each tag (default variant)
- **Ingredients section:**
  - h3 "Ingredients" (18px Semi Bold)
  - `<ul>` with each `<li>` = "• `{scaledAmount}` `{unit} {name}`" — bullet in `text-primary`, amount in `font-medium`, rest `font-normal`, all in `text-text-body`
- **Instructions section** (only if `recipe.steps.length > 0`):
  - h3 "Instructions" (18px Semi Bold)
  - `<ol>` with peach-circle-bullets — identical pattern to `FinalRecipePanel`. Inline (not extracted yet — extract on 3rd use).
- **Action row** (`flex justify-center gap-2 pt-4 border-t border-black/10`):
  - **Modify with AI** — secondary outline with sparkle icon. Currently stub (no-op).
  - **Edit** — secondary outline with pencil icon. Disabled, `title="Coming soon"`.
  - **Delete** — secondary outline with trash icon + **red text** (`text-danger`). Functional.

## Files

### Created

| Path | Purpose |
|---|---|
| `apps/web/src/components/Modal.tsx` | Generic modal primitive. Props: `open`, `onClose`, `children`, `ariaLabel?`. Wraps content in centered Panel with × close. ESC + click-outside + scroll lock. |
| `apps/web/src/components/RecipeModal.tsx` | Recipe view content inside `<Modal>`. Props: `recipe`, `onClose`, `onDeleted`. Owns `servingsOverride` state. Renders header + meta + tags + ingredients (scaled) + instructions + action row. |
| `apps/web/src/components/ServingScaler.tsx` | View-only +/- scaler. Props: `value`, `min?`, `onChange`. Renders 24×24 round-bordered buttons with 12px icons. |

### Modified

| Path | Change |
|---|---|
| `apps/web/src/routes/Catalog.tsx` | `selectedRecipe` state; card click sets it; render `<RecipeModal>` when set; `onDeleted` callback bumps a refresh key to refetch recipes. |
| `apps/web/src/components/index.ts` | Export `Modal`, `RecipeModal`, `ServingScaler` |

## Behavior

```tsx
// Catalog state
const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
const [refreshKey, setRefreshKey] = useState(0);

// Fetch effect depends on [searchQuery, sort, refreshKey]

<RecipeCard onClick={() => setSelectedRecipe(r)} />

<RecipeModal
  recipe={selectedRecipe}
  onClose={() => setSelectedRecipe(null)}
  onDeleted={() => {
    setSelectedRecipe(null);
    setRefreshKey(k => k + 1);
  }}
/>
```

Inside RecipeModal:
```tsx
const [servingsOverride, setServingsOverride] = useState(recipe.servings ?? 1);
const baseServings = recipe.servings ?? 1;

function scaleAmount(amount: number): number {
  const ratio = servingsOverride / baseServings;
  return Math.round(amount * ratio * 4) / 4;
}

async function handleDelete() {
  if (!window.confirm(`Delete "${recipe.name}"? This cannot be undone.`)) return;
  setDeleting(true);
  try {
    await apiFetch(`/api/recipes/${recipe.id}`, { method: 'DELETE' });
    onDeleted();
  } catch (e) {
    setError(e instanceof ApiError ? e.message : 'Failed to delete');
  } finally {
    setDeleting(false);
  }
}
```

## Commands

```bash
npm run dev    # log in, /catalog, click a recipe
```

## Verification

1. `npm run build -w apps/web` clean.
2. `npm test` backend still 36/36.
3. Hex grep across `components/` and `routes/` → zero matches outside `index.css`.
4. **Flow:**
   - On `/catalog`, click any recipe card → modal opens centered, page scroll locks.
   - Modal shows: title, description, emoji, time, scalable servings, tags, ingredients with bullets, instructions with peach numbered bullets, 3-button action row.
   - Click − or + on ServingScaler → "N servings" updates; ingredient amounts re-scale (e.g., 2 → 4 servings doubles amounts).
   - Click − at 1 servings → button is disabled (no change).
   - Close: click × in corner → modal closes, page scroll unlocks. ESC also closes. Click backdrop also closes.
   - Reopen the same recipe → servings resets to original.
   - Click Delete → native confirm → confirm → recipe deleted via DELETE /api/recipes/:id → modal closes → catalog refetches → recipe no longer in grid.
   - Verify Supabase MCP `list_tables` or backend `GET /api/recipes` → recipe row gone.
   - Modify with AI button → clicking does nothing (stub).
   - Edit button → disabled, hover shows "Coming soon" tooltip.
5. **Edge:** open modal → switch routes → modal correctly cleans up scroll lock and key listeners.

## Deferred

- **AI Modify flow** inside RecipeModal → Pass 6c.
- **Edit mode** for recipe (inline editable fields in RecipeModal) → Pass 6e or later polish.
- **AddRecipeModal** for manual creation → Pass 6d.
- **Filter popover** → Pass 6f or later.
- **Fraction display** for scaled amounts (e.g., `0.5` → `½`) → polish.
- **Better delete confirm** (custom dialog instead of native `confirm()`) → polish.

## Notes for Pass 6c

- The "Modify with AI" button in the action row gets wired up. Click toggles an inline comment input below the action row (similar to Regenerate on FinalRecipePanel).
- The state machine grows inside RecipeModal: `modifying: boolean`, `modifyComment: string`, `pendingModified: FullRecipeResponse | null`. When modification arrives, RecipeModal's view switches to show the pending modified recipe with Approve/Discard buttons replacing the original 3.
- `POST /api/ai/modify` body shape: `{ recipe: <current as snake-case>, comment }` per backend Zod. Need to transform Recipe (camelCase from DB) → ModifyRequestSchema input.
- `PUT /api/recipes/:id` on Approve with `source: "ai_modified"`. Then `onModified()` callback bumps catalog refresh + closes modify state.
- Discard reverts modal to original recipe view.

## Completion

When verification is green:
- Sub-plan checked in.
- No master-plan box flip (Stage 6 only ticks after 6c + 6d at minimum).
- CLAUDE.md Current State: "Stage 6b complete — recipe modal + scaler + delete shipped. Pass 6c next: AI Modify flow."
- New Architecture Decisions: Modal primitive (wraps Panel + adds overlay/backdrop/ESC/scroll-lock); ServingScaler as view-only; nearest-0.25 scaling formula; native confirm for delete; tag pill on modal reuses `default` variant despite 8px height diff (skill tolerance).
