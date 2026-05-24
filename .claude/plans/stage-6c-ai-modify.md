# Stage 6c — AI Modify flow inside RecipeModal

> Third slice of Stage 6 of [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md). Pass 6d (AddRecipeModal, manual creation) follows.

## Goal

The "Modify with AI" button inside RecipeModal opens an inline modify panel. User types an instruction (e.g., "make it dairy-free") → `POST /api/ai/modify` → modal content updates in place with the modified recipe. Action row swaps to Discard / Approve. Approve sends `PUT /api/recipes/:id` with `source: "ai_modified"` and refreshes the catalog.

## Frames

- **Modify state:** `PmyY8PrGtVZ0QvsiFigRGU → 8:8139`

## Decisions baked in

- **1 new color token:** `--color-accent-bg-soft: #fff7ed` for the modify panel's light-peach background (visibly lighter than `accent-soft #ffedd4`, ~2% lightness diff — adding as its own token for clarity).
- **Modify panel is inline inside the modal**, not a separate modal-on-modal. Lives between Instructions and the footer action row when active.
- **State machine in RecipeModal:** `mode: 'idle' | 'modifying'`. Idle = original Modify/Edit/Delete action row. Modifying = modify panel renders + footer swaps to Discard/Approve.
- **`recipe` is local state**, seeded from prop. Apply replaces it in place; Cancel/Discard reverts to `initialRecipe` (the prop value); Approve saves to DB.
- **Approve disabled until at least one Apply** (via `isModified = recipe !== initialRecipe`). Avoids no-op PUTs that send the unchanged recipe back to the server.
- **ServingScaler resets** via `useEffect` when `recipe.servings` or `recipe.id` changes — so after Apply, the scaler shows the modified recipe's base servings.
- **Edit button still stubbed** (disabled with "Coming soon" title). Pass 6e or later.
- **Modal stays mounted across mode transitions** — no Modal close on Modify click. Closing the Modal (ESC, ×, backdrop) silently discards any in-flight modifications (state lost on unmount; reopen gets fresh prop).
- **Backend body transform:** Recipe (camelCase, full row from DB) → `RecipeBody` shape (drops `id`/`userId`/`createdAt`/`updatedAt`, keeps the editable fields). Helper `toRecipeBody(recipe)` does this for both `/api/ai/modify` and `PUT /api/recipes/:id`.
- **AI response transform:** `FullRecipeResponse` (snake_case `cooking_time`) → spread over existing Recipe to keep `id`, `userId`, `source`, timestamps, and update the content fields.

## Files modified

| Path | Change |
|---|---|
| `apps/web/src/index.css` | Add `--color-accent-bg-soft: #fff7ed` |
| `apps/web/src/components/RecipeModal.tsx` | Add modify state machine + modify panel JSX + Discard/Approve footer + Apply/Approve API calls + new `onModified` prop |
| `apps/web/src/routes/Catalog.tsx` | Pass `onModified` callback that closes modal + bumps refreshKey (same shape as `onDeleted`) |

No new components — modify panel is inlined into RecipeModal since it's specific to the modify flow.

## Verification

1. `npm run build -w apps/web` clean.
2. `npm test` backend still 36/36.
3. Hex grep across `components/` and `routes/` → zero matches outside `index.css`.
4. **Flow:**
   - Open a recipe modal. Click **Modify with AI**.
   - Modify panel appears below Instructions (peach bg + peach border + sparkle icon + "Modify with AI" header + textarea + Apply/Cancel).
   - Footer swaps from Modify/Edit/Delete to Discard/Approve. Approve is disabled until a modification is applied.
   - Type "make it dairy-free" → click **Apply Modifications**. Button shows "Modifying…". After ~5s, modal content refreshes — title/description/ingredients/tags/etc. reflect the modified recipe. Textarea clears.
   - Approve enables. Click → button shows "Saving…" → modal closes → catalog refetches → the recipe row in the grid shows the modified title.
   - Verify in Supabase MCP (`list_tables` rows view) that the recipe's `source` is now `'ai_modified'`.
5. **Discard path:** open modify panel, type something or skip, click Cancel inside panel or Discard in footer → modify panel closes, recipe reverts to initial, action row returns to Modify/Edit/Delete. Catalog NOT refetched (no DB write).
6. **Iteration:** apply a modification, then while still in modify mode, type another comment + Apply → recipe updates again. Approve commits the latest version.
7. **Implicit discard on close:** open modify panel, type something + Apply, then close modal via × (without clicking Approve) → modal closes, catalog NOT refetched, original recipe still in DB.

## Deferred

- **Edit mode** (manual inline editing in RecipeModal) → Pass 6e.
- **AddRecipeModal** (manual creation) → Pass 6d.
- **Filter popover** on catalog → Pass 6f.
- **Versioning UI** ("4/5" indicator from Figma 8:8172) — not in SPEC, skipped.

## Notes for Pass 6d

- AddRecipeModal will reuse `Modal` primitive. Will need a multi-field form (name, description, repeatable ingredients rows, repeatable steps rows, tags, cookingTime, servings, emoji). Significantly more complex form than Auth or About — consider extracting an `IngredientRow` and `StepRow` sub-component within AddRecipeModal.
- Submit hits `POST /api/recipes` with `source: 'manual'`.
- On success, close modal + bump catalog refreshKey (same pattern as delete/modify).

## Completion

When verification is green:
- Sub-plan checked in.
- No master-plan box flip (Stage 6 ticks after 6d at minimum — manual Add is the last SPEC §10 box for Recipe Vault).
- CLAUDE.md Current State updated.
- New Architecture Decisions: modify is local state with revert-on-cancel; Approve gates on `isModified`; `toRecipeBody` helper for backend shape; modify panel is inline (not modal-on-modal).
