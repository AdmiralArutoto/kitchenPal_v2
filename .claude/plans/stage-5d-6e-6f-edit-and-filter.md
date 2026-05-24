# Stage 5d + 6e + 6f — Edit Modes & Filter Popover (combined pass)

## Context

Three deferred polish items rolled into a single pass per user request ("excute 5d, 6e and 6f in a single pass. dont ask for plan confiramtions"):

- **5d** — Edit mode on `FinalRecipePanel` (the inline final-recipe panel inside the Home AI flow). Previously the Edit button was disabled with `title="Coming soon"`. Now it swaps the panel content to a controlled form; Save returns a mutated `FullRecipeResponse` via `onEdit` and exits edit mode without touching the backend (Approve commits as before).
- **6e** — Edit mode on `RecipeModal` (catalog detail modal). Previously the Edit button toggled the modal to a controlled form (already drafted in 6c) — Pass 6e wires it to the new shared `RecipeEditForm` and `PUT /api/recipes/:id`, preserving the recipe's existing `source`.
- **6f** — Replace the stub Filter button on the Catalog with a tag multi-select `FilterPopover`. Selecting tags fires `/api/recipes?tags=a,b` (OR semantics — backend uses `hasSome`). Available tags pulled from the user's recipes; cached when no filter/search is active so the menu doesn't prune itself as selections accumulate.

The Edit forms in `FinalRecipePanel`, `RecipeModal`, and `AddRecipeModal` are now all the same component (`RecipeEditForm`), so any future change to ingredient parsing, tag input, or validation lands in one place.

## Files

### Created

| Path | Purpose |
|---|---|
| `apps/web/src/components/RecipeEditForm.tsx` | Shared recipe editor — name + description + cook time + servings + ingredient table (Amount + Ingredient columns, repeatable rows, parses `"1 cup"` → `{amount:1, unit:"cup"}`) + step list with peach-numbered bullets + tag pills with comma-bulk-add. Exposes `RecipeFormValues` type; `onSave(values)` callback owns the persistence. |
| `apps/web/src/components/FilterPopover.tsx` | Tag multi-select popover. Outside-click + Escape close (mirrors `SortDropdown`). Shows count when active (`Filter (N)`), primary-bordered when active, scrollable list with checkbox icons, "Clear all" footer. Empty state when no tags exist. |
| `.claude/plans/stage-5d-6e-6f-edit-and-filter.md` | This sub-plan. |

### Modified

| Path | Change |
|---|---|
| `apps/web/src/components/AddRecipeModal.tsx` | Replaced the inline form with `<RecipeEditForm>`. Modal still owns `saving`/`error` state and `POST /api/recipes` with `source: 'manual'`. |
| `apps/web/src/components/RecipeModal.tsx` | Wired the existing `mode === 'editing'` branch to `RecipeEditForm`; `handleSaveEdit(values)` PUTs `/api/recipes/:id` preserving the recipe's `source`, then calls `onModified` to refresh the catalog. |
| `apps/web/src/components/FinalRecipePanel.tsx` | New `editing` state + `onEdit` prop. Edit button no longer disabled — toggles to `RecipeEditForm` inside the same `Panel` shell; Save calls `onEdit(updated)` with snake_case (`cooking_time`) re-converted from the form's camelCase. No backend call (Approve still commits). |
| `apps/web/src/routes/Home.tsx` | Passes `onEdit={setRecipe}` to `FinalRecipePanel` — replaces the in-memory recipe with the edited copy. |
| `apps/web/src/routes/Catalog.tsx` | Added `selectedTags` + `allTags` state. Fetch URL now appends `tags=a,b` when filtered. `allTags` recomputed (unioned across recipes, sorted) only when neither search nor filter is active, so the popover doesn't self-prune. Empty state copy includes filter mention. Replaced stub Filter button with `<FilterPopover>`. Dropped now-unused `FilterIcon` helper. |
| `apps/web/src/components/index.ts` | Re-exported `RecipeEditForm` and `FilterPopover`. |

### Component-state shape

`RecipeFormValues`:
```ts
type RecipeFormValues = {
  name: string;
  description: string | null;
  cookingTime: number | null;
  servings: number | null;
  ingredients: Ingredient[];   // matches /types/api.ts
  steps: string[];
  tags: string[];
  emoji: string | null;
};
```

Form behavior (single source of truth across all three call sites):
- `parseAmount(raw)` regex `^([\d.]+)\s*(.*)$` splits e.g. `"1.5 cups"` → `{amount: 1.5, unit: "cups"}`.
- Ingredient row: numeric-text input for amount-with-unit + text input for name + remove button. New rows appended via "+ Add ingredient".
- Steps: textarea-ish row each; remove button per row; "+ Add step" button.
- Tags: chip-style list with × per pill + free-text adder that splits on comma.
- Submit validates non-empty name + ≥1 ingredient + ≥1 step; otherwise blocks `onSave`.

### `FilterPopover` contract

```ts
type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  availableTags: string[];
};
```
- Click button → opens listbox. Outside click or Escape closes.
- Each row is a `role="option"` checkbox-style button; click toggles inclusion in `value`.
- "Clear all" footer only shown when `value.length > 0`.
- Empty `availableTags` → "No tags yet." copy.

### Catalog wiring

```ts
const [selectedTags, setSelectedTags] = useState<string[]>([]);
const [allTags, setAllTags] = useState<string[]>([]);
// ... in fetch effect:
if (selectedTags.length) params.set('tags', selectedTags.join(','));
// ... when results arrive AND no search AND no filter:
const uniq = Array.from(new Set(result.flatMap(r => r.tags))).sort((a,b) => a.localeCompare(b));
setAllTags(uniq);
```

`selectedTags` is in the fetch effect's dependency array. Backend OR semantics — `?tags=a,b` returns recipes with at least one matching tag (`hasSome` in Prisma).

## Verification

1. **Build clean**: `npm run build -w apps/web` → passes.
2. **Backend tests still green**: `npm test` → 36/36.
3. **Hex literals zero**: `Grep "#[0-9a-fA-F]{6}"` under `apps/web/src` (excluding `index.css`) → 0 matches.
4. **Barrel current**: `RecipeEditForm`, `FilterPopover`, `Textarea` all re-exported from `apps/web/src/components/index.ts`.
5. **Manual smoke** (deferred to dev session):
   - On Catalog: click a recipe → Edit → modify name + add/remove an ingredient → Save → modal closes, list refreshes, recipe shows updated values.
   - On Catalog: open Filter popover → check 2 tags → "Filter (2)" label appears with primary border, results narrow. Open again → Clear all → results restore.
   - On Home: generate a recipe → click Edit on the final-recipe panel → modify name → Save → panel returns to read-only with new name → Approve commits to backend.
   - Add Recipe still works (same form).

## Deferred

None new. Stage 7 (deploy) remains parked per user.

## Completion

- Sub-plan checked in (this file).
- CLAUDE.md Current State updated to reflect 5d/6e/6f shipped; all in-app polish for Stages 5/6 done.
- New Architecture Decisions: `RecipeEditForm` shared form, `FilterPopover` tag multi-select pattern, `allTags` cache rule (don't refresh under filter/search).
- Master plan's Stage 5 and Stage 6 boxes both flip to `[x]` after this pass.
