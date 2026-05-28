# Stage 5a — Static Home page (no AI wiring)

> First slice of Stage 5 of [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md). Pass 5b wires up the AI generation flow (inline panel slot + GuidedFlow + drafts + final + approve) on top of this.

## Goal

Build the visual home page that lives under the existing Nav + Footer chrome. Sections top → bottom:

1. **Hero** — gradient banner with title + subtitle
2. **GenBar** — AI generate row: label + (pills + text) input + sparkle button + Generate button
3. **Browse by Category** — static placeholder, 6 white bordered cards with emoji + label
4. **Featured Recipes** — static placeholder, 6 white bordered cards with gray image placeholder + title + meta + tag pills

No AI wiring. Generate button stays disabled when input is empty; sparkle button is a no-op. GenBar's structure supports rendering pills inside the input, but no pills are passed yet — Pass 5b populates them from the recipe-assist flow.

## Prerequisites

- Stage 4 complete (Nav, Footer, AuthedLayout, atoms in place).
- Figma MCP connected. Clean references used:
  - **Gen Bar (clean):** `dY6CJtDlp8tW2RQ0k1DTL4 → 1:11`
  - **Gradient header (clean):** `dY6CJtDlp8tW2RQ0k1DTL4 → 1:6`
  - **GenBar with pills inside:** `PmyY8PrGtVZ0QvsiFigRGU → 8:1775` (visual reference for pill rendering inside input)
- Three home-state screenshots reviewed (`.tmp-figma/home screen - *.png`) to confirm category card style, featured card style, and panel layout.

## Decisions baked in (user-confirmed this conversation)

- **2 new color tokens:** `--color-primary-deep: #f54900` (AI Generate label, deeper orange than primary), `--color-accent-peach: #ffd6a8` (sparkle-button border).
- **Browse by Category + Featured Recipes are static placeholders** — visual fidelity only. Hardcoded arrays. No data fetching, no real interactivity.
- **Category cards are white bordered cards with emoji + label**, not emoji-on-soft-circle (my earlier draft was wrong — the screenshot shows clean white bordered cards).
- **Featured Recipe cards have gray image placeholder, no emoji** — top half is a `bg-bg-input` block (no real image yet), bottom has title + meta + tag pills.
- **GenBar renders pills inside the input** via a `pills` prop. Pass 5a passes `[]`; Pass 5b passes real pills from the assist flow. The component handles both states.
- **Existing `Pill` component reused inside GenBar** — same gray style. No `variant` prop added yet; Pass 5b adds it when the final-recipe accent pills land.
- **Generate button disabled when `pills.length === 0 && input.trim().length === 0`** (matches Figma's `opacity-50` baseline when there's no content).
- **Sparkle button visible, no-op in 5a.** Pass 5b wires it to open the recipe-assist panel.
- **Inline SVG icons** for sparkle (16x16 diagonal stroke) and AI Generate sparkle/star (20x20 4-point). Both use `currentColor`.
- **Content max-width: 1024px** for inner content. Hero gradient is full-bleed.

## Decomposition

**Hero (Figma `dY6CJtDlp8tW2RQ0k1DTL4:1:6`):**
- Full-bleed `bg-gradient-to-r from-primary to-gradient-end`
- `pt-16 pb-16`, centered content
- Title: `text-5xl font-medium leading-[48px] text-white` "Discover Delicious Recipes"
- 24px gap below title
- Subtitle: `text-xl font-normal leading-7 text-white/90` "Explore thousands of recipes from around the world"

**GenBar (Figma `dY6CJtDlp8tW2RQ0k1DTL4:1:11` + `8:1775`):**
- Full-bleed `bg-bg-card` section with `border-b border-black/10`
- Inner: `max-w-[1024px] mx-auto py-4 px-6`
- Row layout `flex items-center gap-3`:
  - **AI Generate label:** small 20px star icon (stroke `text-primary-deep`) + "AI Generate" in `text-primary-deep text-sm font-medium`
  - **Input area:** flex-1 wrapper styled as the input (`bg-bg-page rounded-lg h-[38px] px-2 flex items-center gap-1 flex-wrap`):
    - Renders `pills.map(p => <Pill onRemove={() => onRemovePill(p)}>{p}</Pill>)` first
    - Then a transparent `<input>` (`bg-transparent border-none outline-none text-sm placeholder:text-text-default/50 flex-1 min-w-[120px]`), placeholder "Add more details..." when pills exist, "Describe a recipe you'd like to create..." when empty
  - **Sparkle button:** `h-9 w-[42px] rounded-lg bg-bg-card border border-accent-peach text-primary-deep flex items-center justify-center hover:bg-accent-peach/10`, inline 16px sparkle icon
  - **Generate button:** uses existing `<Button>` primary, size md, label "Generate", disabled when no pills AND no text

**Browse by Category (static placeholder, ref `home screen - recipeAssist dialog + pills.png`):**
- `bg-bg-page` section, `py-10 px-6`, content `max-w-[1024px] mx-auto`
- Heading: `text-2xl font-semibold text-text-default mb-6` "Browse by Category"
- Row: `grid grid-cols-3 sm:grid-cols-6 gap-3`
- 6 cards, each `<Card variant="bordered" padding="md" className="flex flex-col items-center gap-2">`:
  - 3xl emoji
  - `text-sm font-medium text-text-default` label
- Hardcoded list: Italian 🍝, Asian 🍜, Desserts 🍰, Vegetarian 🥗, Quick Meals ⚡, Seafood 🐟

**Featured Recipes (static placeholder, ref same screenshot):**
- `bg-bg-page` section, `py-10 px-6`, content `max-w-[1024px] mx-auto`
- Header row: `text-2xl font-semibold text-text-default` "Featured Recipes" + right-aligned `text-sm text-primary font-medium` "View All →"
- Grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6`
- 6 cards, each `<Card variant="bordered" padding="none" className="overflow-hidden">`:
  - Top: `h-32 bg-bg-input` (gray image placeholder)
  - Body `p-4`:
    - `text-base font-semibold text-text-default` title
    - Metadata row `mt-2 flex gap-3 text-xs text-text-muted`: `⏱ 25 min` and `🍽 4 servings`
    - Tag row `mt-2 flex flex-wrap gap-1`: small `<Pill>` chips (existing component, gray)
- Hardcoded 6 entries: title + cookingTime + servings + tags[]

**Token deltas:** 2 new tokens (`primary-deep`, `accent-peach`). All other colors map to existing tokens (`text-default`, `text-muted`, `bg-page`, `bg-card`, `bg-input`, `border-subtle`, `primary`, `gradient-end`).

## Files

### Created

| Path | Purpose |
|---|---|
| `apps/web/src/components/Hero.tsx` | Gradient hero with title + subtitle. No props. |
| `apps/web/src/components/GenBar.tsx` | Composite tag-input bar. Props: `value: string`, `onChange(value)`, `pills: string[]`, `onRemovePill?(pill)`, `onGenerate?()`, `onAssist?()`. |

### Modified

| Path | Change |
|---|---|
| `apps/web/src/index.css` | Add `--color-primary-deep: #f54900` and `--color-accent-peach: #ffd6a8` to `@theme` |
| `apps/web/src/routes/Home.tsx` | Replace placeholder with full home composition: Hero + GenBar + Browse + Featured. Owns `prompt` state for the input. |
| `apps/web/src/components/index.ts` | Export `Hero`, `GenBar` |

## Commands

```bash
npm run dev    # visit http://localhost:5173/home
```

## Verification

1. `npm run build -w apps/web` clean.
2. `npm test` backend still 36/36.
3. Visual: home renders Hero → GenBar → Browse by Category (6 white bordered cards) → Featured Recipes (6 cards w/ gray image placeholder, title, meta, tags).
4. GenBar input: typing enables Generate button; sparkle button is clickable (no-op, console clean).
5. GenBar with mocked pills: temporarily render `<GenBar pills={['Dinner','Mexican','Dairy-free']} ... />` in a scratch test and confirm pills wrap inside the input with × remove buttons. (Revert before commit; this is just structural verification.)
6. Hex-literal grep across `components/` and `routes/`: zero matches outside `index.css`.
7. Mobile (375px): Hero stays readable; GenBar flex-wraps to multiple rows; category grid → 3 cols; featured grid → 1 col.

## Deferred to Pass 5b

- Inline panel slot under GenBar (single container that holds assist / drafts / final panels, replacing each other).
- `GuidedFlow` state machine (4 steps: Meal type → Cuisine → Dietary → Vibe). Emits selections as pills back into GenBar.
- `POST /api/ai/generate-drafts` integration + drafts panel with 3 draft rows + reload icon.
- `POST /api/ai/generate-full` integration + final-recipe panel.
- Final-recipe action row: `Delete | Edit | Regenerate | Approve` (user confirmed "Discard" in Figma is a typo for "Regenerate").
- Regenerate-with-comment: inline comment input that pushes back to `/generate-full` with `{ input: currentRecipe, comment }`.
- `POST /api/recipes` save on Approve.
- `Toast` component for Approve success.
- `Pill` variant: add `accent` variant (peach bg, deep-orange text) for recipe-display tags.
- The frames: 8:2158 (assist), 8:3514 (drafts), 8:4636 (final). Fetched as that piece is built.

## Notes for Pass 5b

- GenBar already accepts `pills` and `onRemovePill`. Pass 5b's Home component owns the pills array and passes it down.
- Sparkle's `onAssist` opens the assist panel; Generate's `onGenerate` skips assist and calls `/generate-drafts` directly with `pills + text` as the prompt.
- The panel slot is a single conditional render under GenBar — Home state has a `phase: 'idle' | 'assist' | 'drafts' | 'final'` plus the data needed for each phase.
- Featured Recipes will become real data in Stage 6 (Catalog) — for now it's placeholder. The card shape (gray image area + title + meta + pills) is the same shape Stage 6 will reuse.

## Completion

When verification is green:
- Sub-plan checked in (already present).
- No master-plan box flip (Stage 5 only ticks after 5b lands).
- CLAUDE.md Current State: "Stage 5a complete — static home shipped. Pass 5b next: AI generation flow."
- New Architecture Decisions: 2 new tokens; Hero + GenBar components; pill-rendering-inside-input pattern; category/featured cards inline (no RecipeCard yet); inline panel architecture confirmed for Pass 5b.
