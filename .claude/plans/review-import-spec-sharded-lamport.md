# Plan — Polish the imported-recipe draft (image picker + carry-over generating state + Modify with AI)

## Context

After importing a recipe from a URL, the draft review (`ImportModal` `phase === 'draft'`) renders
the shared `RecipeEditForm` with **no image controls** and **no AI-modify** — it only lets you edit
text fields and Save. The manual create modal (`AddRecipeModal`) already has an image picker
(Upload / Generate with AI / Skip), and the catalog `RecipeModal` already has Modify-with-AI. The
import draft should reach parity.

Three asks:
1. **Image picker on the import draft** — same Upload / Generate / Skip as `AddRecipeModal`.
2. **(1.2) Generating animation that carries over** — when "Generate with AI" is chosen, the card
   shows a loading animation instead of the emoji until the image arrives, **even if the user closes
   the draft modal first**. Applies to **all create flows** (manual, url, gen).
3. **Modify with AI on the import draft** — inline in the edit form (confirmed): operates on the
   current edited fields, runs `/api/ai/modify`, applies the result back into the form, then Save.

## Changes

### A. Extract the image picker into a reusable hook (Part 1)
The picker state + UI is currently inlined in `AddRecipeModal.tsx` (lines 19–135: `imageMode`,
`imageFile`, `previewUrl`, `pickFile`/`armGenerate`/`clearImage`, the `imageSlot` JSX, and the
`imageWork` derivation in `handleSave`).

- **New** `apps/web/src/hooks/useImagePicker.tsx` — `useImagePicker(emoji: string)` returns
  `{ slot: ReactNode, imageWork: { type:'generate' } | { type:'upload'; file: File } | undefined }`.
  Move the existing state/handlers/JSX verbatim (blob-URL cleanup effect included).
- **Edit** `AddRecipeModal.tsx` — replace the inlined picker with the hook; `handleSave` reads
  `picker.imageWork`. Behavior identical.
- **Edit** `ImportModal.tsx` draft phase — call `useImagePicker(draftEmoji)` (emoji from
  `importDraftToFormValues(result.draft).emoji ?? '🍽️'`), pass `picker.slot` as `RecipeEditForm`'s
  `imageSlot`, and pass `picker.imageWork` into the existing `createMutation.mutate({ body, imageWork })`
  in `handleSave`.

### B. Carry-over "image generating" state (Part 1.2)
A transient, client-only flag on the cached recipe so `RecipeCard` (and `RecipeModal`) render a
loader instead of the emoji until the generated image lands — independent of whether the draft/add
modal is still mounted (the cache is global; `useCreateRecipe` already runs the image work post-unmount).

- **Edit** `apps/web/src/types/api.ts` — add `imageGenerating?: boolean` to `Recipe` with a comment:
  *client-only transient flag, never sent by the backend*.
- **Edit** `apps/web/src/hooks/useRecipes.ts` `useCreateRecipe`:
  - `onMutate`: set `imageGenerating: Boolean(vars.imageWork)` on the optimistic object (loader shows
    from first paint).
  - `onSuccess`: when swapping the temp row for `real`, keep the flag if `vars.imageWork` is present
    (`{ ...real, imageGenerating: true }`); the server `real` has no such field.
  - Image-work `.then(fresh => patchRecipeInCache(qc, fresh))` already clears it (server `fresh` has no
    flag → loader → real image). Add to `.catch`: patch the recipe with `imageGenerating: false` (then
    the existing toast) so a failed generate falls back to the emoji.
  - This single change covers manual / url / gen, since all three create via `useCreateRecipe` with
    `imageWork: { type:'generate' }` (Home approve, AddRecipeModal, ImportModal). Daily-rotation Save
    reuses the batch image (no `imageWork`) → no loader, correct.
- **New** `apps/web/src/components/ImageGeneratingPlaceholder.tsx` — the gradient block (reuse the
  `linear-gradient(139deg,...)` used in `RecipeCard`/`AddRecipeModal`) + a small spinner +
  "Generating image…". Use `@theme` tokens only (figma-translation skill), no hex literals.
- **Edit** `RecipeCard.tsx` header render order → `imageUrl ? <img> : imageGenerating ? <ImageGeneratingPlaceholder> : <emoji>`.
- **Edit** `RecipeModal.tsx` hero → show the placeholder/overlay when `recipe.imageGenerating` too
  (it already shows one while `generateImageMutation.isPending`); keep `imageUrl` first.

### C. Inline Modify with AI in `RecipeEditForm` (Part 2)
Opt-in so existing consumers (AddRecipeModal, RecipeModal edit, FinalRecipePanel) are unaffected.

- **Edit** `RecipeEditForm.tsx`:
  - New optional prop `onModify?: (current: RecipeFormValues, comment: string) => Promise<RecipeFormValues>`.
  - Track `emoji` in state (seeded from `initialValues.emoji`) and use it in `handleSubmit` instead of
    `initialValues.emoji`, so a modify can change it. (No behavior change when unchanged.)
  - When `onModify` is provided, render a "✨ Modify with AI" toggle near the top of the left column
    that opens a peach panel (`bg-accent-bg-soft` / `border-accent-peach`, mirroring RecipeModal's
    modify panel) with a comment `Textarea` + Apply / Cancel and a busy state. Local state:
    `modifyOpen`, `modifyComment`, `modifyBusy`, `modifyError`.
  - On Apply: build `current` via a lenient `collectValues()` (same parsing as `handleSubmit` but
    skips the required-field errors — unparseable amount → `{amount:0, unit:text}`), call
    `onModify(current, comment)`, then `applyValues(next)` which calls every setter
    (name/description/cookingTime/servings/ingredient rows/steps/tags/emoji). Disable form submit while busy.
- **Edit** `ImportModal.tsx` — pass `onModify={handleModify}` to the draft `RecipeEditForm`.
  `handleModify` POSTs to `/api/ai/modify` (existing route, gpt-4o, no preference injection) with
  `{ recipe: <RecipeBody from current values>, comment }`, then maps the `FullRecipeResponse`
  (snake_case `cooking_time`) back to `RecipeFormValues` — the same snake→camel mapping
  `RecipeModal.applyModification` does (`RecipeModal.tsx:92-102`). Add small local helpers
  (`formValuesToModifyInput`, `fullResponseToFormValues`) or inline; import `apiFetch` + `FullRecipeResponse`.

## Reused existing code
- `useCreateRecipe` `imageWork` chaining + `patchRecipeInCache` — `apps/web/src/hooks/useRecipes.ts:19-98`.
- Image picker UI to extract — `apps/web/src/components/AddRecipeModal.tsx:19-135`.
- Modify request + snake→camel mapping pattern — `apps/web/src/components/RecipeModal.tsx:79-109`.
- `/api/ai/modify` route + `FullRecipeResponse` type (`apps/web/src/types/api.ts:52`).
- Gradient + emoji-fallback block (RecipeCard.tsx:26-31) for the placeholder.

## Out of scope
- No image picker / modify added to Home's FinalRecipePanel or daily-rotation cards (they already
  have their own image + regenerate flows). Part 2 is import-draft only per the ask.
- No backend changes (all three routes already exist).

## Verification
1. `npm run build` (api `tsc` + web build) — must be clean (run the api build, not just vitest).
   Backend tests untouched but run `npm test` (expect 100/100).
2. `npm run dev`, then on the **Catalog → + Add Recipe → Import**:
   - Import a JSON-LD site → draft shows the image picker. Choose **Generate with AI**, Save, and
     **immediately** confirm the new Catalog card shows the **generating animation** (not emoji);
     ~10–30s later it swaps to the real image. Repeat choosing **Upload** (picks your file) and **Skip** (emoji).
   - Same generating-carry-over check via **manual** (+ Add Recipe → Create, Generate) and **gen**
     (Home GenBar → approve) — the card animates then resolves in all three.
   - In the import draft, click **Modify with AI**, enter "make it vegan", Apply → fields update in
     place; edit a field, Save → recipe persists with `source:'imported'` and the modified content.
   - Force a generate failure (e.g. offline) → loader clears to emoji + error toast, card stays.
3. Confirm no regressions in `AddRecipeModal` (picker still works after the hook extraction) and in
   `RecipeModal` edit/modify (RecipeEditForm `emoji`-in-state change).
