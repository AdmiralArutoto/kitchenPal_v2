# Stage 5c — Generation pipeline (drafts → final → approve)

> Third slice of Stage 5 of [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md). Pass 5d (Edit mode) is the optional polish that follows.

## Goal

Hook up the entire AI generation flow end-to-end:
1. **Generate** click (with pills and/or text) → `POST /api/ai/generate-drafts` → DraftsPanel shows 3 drafts.
2. Click a draft → `POST /api/ai/generate-full` → FinalRecipePanel shows the full recipe.
3. Action row inside FinalRecipePanel:
   - **Delete** → dismiss, reset to idle, keep pills + prompt cleared.
   - **Edit** → rendered as disabled (placeholder) — Pass 5d implements.
   - **Regenerate** → inline comment input opens; submit → `POST /api/ai/generate-full` with `{ input: currentRecipe, comment }`; result replaces in place.
   - **Approve** → `POST /api/recipes` with `source: "ai_generated"` → Toast on success → reset to idle, clear pills + prompt.

Outcome: a user types/picks ingredients → presses Generate → drafts → picks one → recipe → Approve → recipe persisted, visible in Catalog (once that page is built in Stage 6; for now `GET /api/recipes` from the about page would show it).

## Prerequisites

- Stage 5b done (AssistPanel, Panel, pills lifted to Home, phase state seeded).
- Backend Stage 3 endpoints in place: `/api/ai/generate-drafts`, `/api/ai/generate-full` (accepts `{ input, comment? }`), `POST /api/recipes`.
- Figma MCP frames fetched and decomposed: `8:3514` (drafts), `8:4636` (final). Three home-state screenshots in `.tmp-figma/` cross-checked.

## Decisions baked in

- **3 new color tokens:**
  - `--color-accent-text: #ca3500` (peach pill text + numbered step bullets)
  - `--color-danger: #e7000b` (Delete button text)
  - `--color-danger-light: #ffc9c9` (Delete button border)
- **Pill gets 3 variants:**
  - `default` (current, no change) — gray, rounded-lg, h-[30px], 12px Medium
  - `compact` — gray (`bg-bg-toggle`), `rounded-[4px]`, h-5, 12px Medium. Used for draft keyIngredients
  - `accent` — `bg-accent-soft`, `text-accent-text`, `rounded-full`, h-6, 12px Regular. Used for recipe tags
  - `onRemove` still works on all variants (only `default` actually uses it in practice for now)
- **GenBar locks when phase ≠ idle.** `dimmed` prop added; applies `opacity-50 pointer-events-none` to the bar contents. Prevents re-prompting mid-result.
- **Edit button rendered disabled** in the action row. Visible but `disabled`, with `title="Coming soon"`. Pass 5d implements.
- **Toast is local Home state**, not a global context. Single-toast model: `toast: { message: string, kind: 'success' | 'error' } | null`. Auto-dismiss after 3 seconds via `setTimeout`. Simple `Toast` component renders fixed top-center.
- **"Discard" label** in the action row → rendered as **"Regenerate"** (Figma typo per user's earlier confirmation).
- **Loading states** on each AI call: button label changes to "Generating…" or panel shows a centered "Generating…" message; action buttons disable. No fancy spinners for MVP — just disabled + text swap.
- **Errors surfaced inline** in the panel — small red text below the panel's title. No retry button for MVP (user can dismiss + try again).
- **Prompt composition:** Generate sends `pills.length ? `${pills.join(', ')}${value ? '. ' + value : ''}` : value`. Pills come first as comma-separated, then free text appended.
- **Recipe POST body shape transform:** Home's Approve handler maps AI snake_case fields (`cooking_time`, etc.) to backend Zod camelCase (`cookingTime`, etc.) before POST. Source is always `"ai_generated"`.
- **No Edit mode → currentRecipe is read-only.** Only Regenerate can replace it. (Pass 5d will allow inline edit.)

## Files

### Created

| Path | Purpose |
|---|---|
| `apps/web/src/components/DraftsPanel.tsx` | Panel-chrome with header (title + reload icon) and 3 clickable draft rows. Props: `drafts: Draft[]`, `onSelect(draft)`, `onRegenerate()`, `onClose()`, `loading?: boolean`. |
| `apps/web/src/components/FinalRecipePanel.tsx` | Panel-chrome with title/desc/meta/tags + Ingredients table + Instructions list + Action row (Delete/Edit/Regenerate/Approve). Props: `recipe: FullRecipeResponse`, `onDelete()`, `onRegenerate(comment)`, `onApprove()`, `approving?: boolean`, `regenerating?: boolean`. |
| `apps/web/src/components/Toast.tsx` | Fixed top-center notification. Props: `message`, `kind: 'success' \| 'error'`, `onDismiss()`. Auto-dismiss handled by Home (setTimeout). |

### Modified

| Path | Change |
|---|---|
| `apps/web/src/index.css` | Add the 3 new tokens to `@theme` |
| `apps/web/src/components/Pill.tsx` | Add `variant: 'default' \| 'compact' \| 'accent'` prop |
| `apps/web/src/components/GenBar.tsx` | Add `dimmed?: boolean` prop. When true, apply `opacity-50 pointer-events-none` to the row + disable Generate/sparkle buttons. |
| `apps/web/src/types/api.ts` | Export `Draft` (already done) and add `FullRecipeResponse` type matching `apps/api/src/schemas/ai.ts` `FullRecipeResponseSchema` (snake_case `cooking_time`) |
| `apps/web/src/routes/Home.tsx` | Phase state extends to `'idle' \| 'assist' \| 'drafts' \| 'final'`. Wire onGenerate, draft click, Approve, Delete, Regenerate-comment flow, toast state. ~120 new lines. |
| `apps/web/src/components/index.ts` | Export DraftsPanel, FinalRecipePanel, Toast |

## Home wiring (sketch)

```tsx
type Phase = 'idle' | 'assist' | 'drafts' | 'final';

const [phase, setPhase] = useState<Phase>('idle');
const [pills, setPills] = useState<string[]>([]);
const [prompt, setPrompt] = useState('');
const [drafts, setDrafts] = useState<Draft[]>([]);
const [recipe, setRecipe] = useState<FullRecipeResponse | null>(null);
const [busy, setBusy] = useState<'drafts' | 'full' | 'regenerate' | 'approve' | null>(null);
const [error, setError] = useState<string | null>(null);
const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);

function composePrompt(): string {
  const pillStr = pills.join(', ');
  if (pills.length && prompt.trim()) return `${pillStr}. ${prompt.trim()}`;
  return pills.length ? pillStr : prompt.trim();
}

async function onGenerate() {
  setBusy('drafts');
  setError(null);
  try {
    const result = await apiFetch<Draft[]>('/api/ai/generate-drafts', {
      method: 'POST',
      body: JSON.stringify({ prompt: composePrompt() }),
    });
    setDrafts(result);
    setPhase('drafts');
  } catch (e) {
    setError(e instanceof ApiError ? e.message : 'Failed to generate drafts');
  } finally {
    setBusy(null);
  }
}

async function onSelectDraft(d: Draft) {
  setBusy('full');
  setError(null);
  try {
    const result = await apiFetch<FullRecipeResponse>('/api/ai/generate-full', {
      method: 'POST',
      body: JSON.stringify({ input: d }),
    });
    setRecipe(result);
    setPhase('final');
  } catch (e) {
    setError(e instanceof ApiError ? e.message : 'Failed to generate recipe');
  } finally {
    setBusy(null);
  }
}

async function onRegenerate(comment: string) {
  if (!recipe) return;
  setBusy('regenerate');
  setError(null);
  try {
    const result = await apiFetch<FullRecipeResponse>('/api/ai/generate-full', {
      method: 'POST',
      body: JSON.stringify({ input: recipe, comment }),
    });
    setRecipe(result);
  } catch (e) {
    setError(e instanceof ApiError ? e.message : 'Failed to regenerate');
  } finally {
    setBusy(null);
  }
}

async function onApprove() {
  if (!recipe) return;
  setBusy('approve');
  setError(null);
  try {
    await apiFetch('/api/recipes', {
      method: 'POST',
      body: JSON.stringify({
        name: recipe.name,
        description: recipe.description,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        tags: recipe.tags,
        cookingTime: recipe.cooking_time,
        servings: recipe.servings,
        emoji: recipe.emoji,
        source: 'ai_generated',
      }),
    });
    setRecipe(null);
    setDrafts([]);
    setPills([]);
    setPrompt('');
    setPhase('idle');
    setToast({ message: 'Recipe saved to your collection', kind: 'success' });
  } catch (e) {
    setError(e instanceof ApiError ? e.message : 'Failed to save recipe');
  } finally {
    setBusy(null);
  }
}

function onDelete() {
  setRecipe(null);
  setPhase('idle');
}

// auto-dismiss toast after 3s
useEffect(() => {
  if (!toast) return;
  const id = setTimeout(() => setToast(null), 3000);
  return () => clearTimeout(id);
}, [toast]);
```

GenBar gets:
- `dimmed={phase === 'drafts' || phase === 'final'}`
- `onGenerate={onGenerate}` (now functional)
- Sparkle button still opens assist when phase is `'idle'`; otherwise disabled (handled via `dimmed`)

## Visual sketches per Figma

**DraftsPanel** (`8:3514`):
- Panel with internal header (white→bg-page section, border-b) holding "Choose a recipe to generate" 18px Semi Bold + reload icon button (right)
- Body: 24px padding, gap-3 between rows
- Each row: `<button className="border border-border-subtle rounded-[10px] p-4 text-left hover:bg-bg-page">`:
  - Title 16px Semi Bold text-default
  - Description 14px Medium text-muted (mt-1)
  - Keys row (mt-3): `<Pill variant="compact">` × keyIngredients
- Reload (refresh icon, 16x16) inline SVG; loading state replaces with `text-text-muted` spinner-ish dots ("Regenerating…") — for MVP just disable + label.

**FinalRecipePanel** (`8:4636`):
- Panel with internal content area (`pl-6 pr-[39px] pt-6`, gap-6)
  - Top section (gap-3): title 30/36 Medium; description 16/24 muted; meta row (Prep/Cook/Servings — note Cook=cooking_time, Prep computed/omitted); accent pills row
  - **Spec/Figma note:** Backend schema has only `cookingTime`. Frontend displays "Cook: {cookingTime} min" + "Servings: {servings}". Prep is omitted (no schema field). Log decision in CLAUDE.md.
  - Ingredients section: h3 "Ingredients" 20px Semi Bold; container `border border-border-subtle rounded-[10px] overflow-hidden`. Table with bg-page header row "Amount | Ingredient", data rows with subtle border between, padding 16px h-padding + 10px v-padding.
  - Instructions section: h3 "Instructions" 20px Semi Bold; numbered list with peach circle bullets (`bg-accent-soft` 24px round + `text-accent-text` 12px Medium number) + step text 14px Regular text-body. gap-3 between items.
- Action row (footer): `bg-bg-page border-t border-black/10 p-4 flex items-center justify-between`:
  - Left group (gap-2):
    - Delete: `border border-danger-light text-danger` ghost-style with bin SVG. Disabled while busy.
    - Edit: secondary disabled, pencil SVG, `title="Coming soon"`
    - Regenerate: secondary, refresh SVG. Toggles the inline comment input.
  - Right: Approve primary with checkmark SVG. Disabled while busy='approve'.
- Regenerate inline input (when open): below the action row, full-width: `<Input placeholder="What would you like to change?">` + Send + Cancel buttons. Submit closes input + fires `onRegenerate(comment)`.

**Toast** — fixed position `top-4 left-1/2 -translate-x-1/2 z-50`:
- `bg-bg-card border border-border-subtle rounded-lg shadow-lg px-4 py-3 text-sm`
- Success: green left border? Or just plain. Simple is fine: text + dismiss × button.
- Auto-dismiss handled by parent (Home owns the setTimeout).

## Commands

```bash
npm run dev    # both servers; visit http://localhost:5173/home
```

## Verification

1. `npm run build -w apps/web` clean.
2. `npm test` backend still 36/36.
3. Hex grep across `components/` and `routes/` → zero matches outside `index.css`.
4. **Flow happy-path (manual against live OpenAI):**
   - Type "vegetarian dinner with chickpeas" → Generate. Drafts panel renders 3 drafts after a few seconds.
   - Click a draft → Final recipe panel renders with title, description, meta, tags, ingredients table, instructions.
   - Click Regenerate → comment field appears below action row. Type "make it spicier" → Send. Recipe replaces in place after a few seconds.
   - Click Approve → toast appears top-center "Recipe saved to your collection". Panel closes, GenBar re-enables, pills/prompt cleared.
   - Verify in DB via Supabase MCP (`list_tables`) → the new recipe row exists with `source = 'ai_generated'`.
5. **Flow alt-path:** Sparkle → walk assist → 4 pills land in GenBar → Generate → drafts → click draft → Final → Delete → returns to idle with pills still present (so user can iterate without re-running assist).
6. **Error path:** disconnect network (or break OpenAI key) → Generate. Inline error appears below GenBar. Try again succeeds when reconnected.
7. **Pill variants visual:** `default` on About preferences (unchanged), `compact` on draft keyIngredients, `accent` on recipe tags. Verify all three render distinctly.
8. **GenBar dimmed:** while phase is drafts/final, GenBar is at 50% opacity and clicks are no-ops.

## Deferred to Pass 5d

- **Edit mode** — convert FinalRecipePanel to controlled inputs for title/description/ingredients/steps/etc. Save button commits changes to local state; Approve then sends the edited recipe.
- The Edit button stays rendered but disabled in Pass 5c.

## Notes for Stage 6

- The `RecipeCard` placeholder pattern in Home's Featured Recipes section is what Catalog will need. Stage 6 can lift it into a real component when wiring up real recipe data.
- `apiFetch` is the canonical request path. POST /api/recipes returns the saved Recipe; Stage 6's catalog list refetches via GET /api/recipes after approval if needed.
- `Pill` variants are stable. Stage 6 uses `default` for the recipe-modal preference editing UX (analogous to About) and `accent` for the recipe-card tags display.

## Completion

When verification is green:
- Tick `[ ] Stage 5 — Frontend Home: generation flow` → `[x]` in [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md). Edit mode (Pass 5d) is treated as a follow-up polish, not a Stage-5 blocker.
- CLAUDE.md Current State: "Stage 5c complete — full generation pipeline shipped (sans Edit mode). Stage 6 next: Catalog."
- New Architecture Decisions: Pill 3-variant API; GenBar dimmed prop; Home owns AI flow state + toast; Approve maps snake_case→camelCase before POST; Edit deferred to 5d.
