# Stage 6d — AddRecipeModal (manual creation)

> Fourth slice of Stage 6 of [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md). Stage 6 closes after this lands.

## Goal

The Add Recipe button on `/catalog` opens a modal form for manually creating a recipe. On submit, `POST /api/recipes` with `source: 'manual'` and a random emoji.

## Frames

- **Add Recipe Modal:** `PmyY8PrGtVZ0QvsiFigRGU → 8:9872`

## Decisions baked in

- **Reuses `Modal` primitive** from Pass 6b.
- **New `Textarea` atom** — multi-line counterpart to `Input` (`bg-bg-input` default, focus ring, `resize-none`). Used by Description field + Step rows. Modify panel in RecipeModal can be refactored to use this later; left as-is for now.
- **Emoji is auto-assigned at modal mount** from a hardcoded list of 15 food emojis. No UI to change it (matches Figma which omits emoji picker). Per SPEC §5.3 the "user can change emoji" requirement is deferred to Edit mode (Pass 6e or later).
- **Ingredient rows are repeatable.** Two visible columns (`Amount` + `Ingredient`) in a small table inside a bordered container, with a `+ Add ingredient` button below. Each row has a × delete button. Empty rows are skipped on submit.
- **Amount column accepts free-text like "1 cup"**, parsed on submit by regex `^([\d.]+)\s*(.*)$` → `{ amount: number, unit: string }`. If parse fails, inline error blocks submit. Matches the visual one-input UX in Figma while still satisfying the backend's `IngredientSchema` (`{ name, amount: number, unit: string }`).
- **Step rows are repeatable** with peach-numbered bullets (same pattern as RecipeModal/FinalRecipePanel). Each step is a `<Textarea>`. `+ Add step` button below; × per row.
- **Tags input supports comma-separated bulk-add.** User can type "Italian, Quick" + Enter (or Add button) → both pills added in one go. Each pill has × remove.
- **Validation:** name required; at least 1 ingredient with valid amount + name; at least 1 step; cookingTime optional but must parse as integer if provided; servings required and ≥ 1.
- **No new color tokens.**

## Files

### Created

| Path | Purpose |
|---|---|
| `apps/web/src/components/Textarea.tsx` | Multi-line input atom. `bg-bg-input` + focus ring + disabled styles, mirrors `Input`. |
| `apps/web/src/components/AddRecipeModal.tsx` | The full manual-creation form inside a `Modal`. Owns all form state. Props: `onClose`, `onCreated`. |

### Modified

| Path | Change |
|---|---|
| `apps/web/src/routes/Catalog.tsx` | `addingRecipe` state; Add Recipe button now opens AddRecipeModal; `onCreated` callback bumps `refreshKey` to refetch |
| `apps/web/src/components/index.ts` | Export `AddRecipeModal`, `Textarea` |

## Verification

- `npm run build -w apps/web` clean (109 modules).
- `npm test` backend 36/36.
- Hex grep across `components/` and `routes/` → zero matches outside `index.css`.
- **Flow:**
  - On `/catalog`, click **Add Recipe** → modal opens.
  - Fill in name, optional description, cooking time, servings (defaults to 2). Add at least one ingredient row (e.g., "200 g" + "Pasta") and at least one step.
  - Optional: add tags via the tag input + Add (try "Italian, Quick" to add 2 at once).
  - Click **Add Recipe** → button shows "Saving…" → on success, modal closes, catalog refetches, the new recipe appears in the grid with the auto-assigned emoji and `source: 'manual'`.
- **Validation errors** show inline above the footer:
  - Empty name → "Recipe name is required"
  - Ingredient with non-numeric amount (e.g. "to taste") → "Ingredient amount must start with a number..."
  - No valid ingredients → "Add at least one ingredient"
  - No steps → "Add at least one step"
  - Bad cookingTime → "Cooking time must be a number (minutes)"
  - Servings < 1 → "Servings must be at least 1"

## Deferred / out of scope

- **Edit mode** for RecipeModal — Pass 6e.
- **Edit mode** for FinalRecipePanel (recipe generation result) — Pass 5d.
- **Filter popover** for the catalog tag-filter — Pass 6f or later.
- **Emoji picker** — auto-assigned only; user can change once Edit mode lands.
- **Image upload** — out of MVP per SPEC §11.
