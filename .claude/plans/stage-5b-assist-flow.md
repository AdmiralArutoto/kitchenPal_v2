# Stage 5b — Assist Panel + Guided Flow

> Second slice of Stage 5 of [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md). Pass 5c wires up the AI generation pipeline (drafts → final → approve) on top of this.

## Goal

The sparkle button on the GenBar opens an inline panel under the GenBar. The panel walks the user through 4 single-choice steps (Meal type → Cuisine → Dietary → Vibe). Each non-Skip selection adds a pill to the GenBar input. After step 4 (or earlier × close), the panel closes and pills persist in the GenBar.

**No AI calls in this pass.** The Generate button still does nothing — Pass 5c hooks it up.

## Prerequisites

- Stage 5a done — Hero, GenBar (with pill support), placeholder sections in place.
- Figma MCP connected. Frame fetched and decomposed:
  - **Recipe assist dialog:** `PmyY8PrGtVZ0QvsiFigRGU → 8:2158` ✓
- Screenshot in `.tmp-figma/home screen - recipeAssist dialog + pills.png` confirms placement (panel sits between GenBar and Browse-by-Category, browser content stays visible underneath).

## Decisions baked in

- **New `Panel` component** for the 3 generation-flow panels (used here by AssistPanel, in 5c by DraftsPanel + FinalRecipePanel). Distinct from `Card` because: smaller radius (`rounded-[10px]` vs Card's `rounded-2xl`), specific drop shadow + border combo, narrower padding scale. Reuse > recreate per the skill.
- **New `Button` variant `chip`:** rounded-full + `bg-bg-page` + `border border-border-subtle` + `text-text-body` 14px Medium. Used by the 7 option buttons (Breakfast/Lunch/etc.). Skip uses existing `variant="ghost"`.
- **`AssistPanel` is the only new feature component this pass.** Owns the step state (`0..3`), the steps config (questions + options), and emits pill selections back to its parent via callbacks.
- **GuidedFlow logic inside AssistPanel.** No separate state machine library or external hook. Pure `useState` for `stepIndex`. Simple enough.
- **None (Dietary) treated as Skip.** Per SPEC §5.2: "Skip and 'other' are equivalent — advance without adding a pill." "None" means "no restriction", so no pill added.
- **Panel state lifted to Home.** Home now owns `phase: 'idle' | 'assist'`. `idle` = no panel; `assist` = render `<AssistPanel>` below GenBar. Pass 5c extends with `'drafts'` and `'final'` phases.
- **Pills accumulate in GenBar even after panel closes.** User can mix guided selections with free text typed afterwards.
- **Close × at any step:** panel closes immediately; any pills already added remain in GenBar.
- **Inline SVG ×** icon in AssistPanel — same shape as Pill's remove icon, slightly larger (16px stroke at 24px container).

## Steps configuration

```ts
const STEPS = [
  {
    question: 'Meal type?',
    options: ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert', 'Drink'],
  },
  {
    question: 'Cuisine?',
    options: ['Italian', 'Asian', 'Mediterranean', 'Mexican', 'American', 'Middle Eastern', 'Indian'],
  },
  {
    question: 'Dietary?',
    options: ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Keto'], // SPEC §5.2; "None" omitted (= Skip)
  },
  {
    question: 'Vibe?',
    options: ['Quick (<30 min)', 'Budget-friendly', 'Kid-friendly', 'Meal prep'],
  },
];
```

## Files

### Created

| Path | Purpose |
|---|---|
| `apps/web/src/components/Panel.tsx` | White rounded panel with border + drop shadow, `rounded-[10px]`, ~20px padding. Props: `children`, `className?`. Used by AssistPanel here and by DraftsPanel/FinalRecipePanel in 5c. |
| `apps/web/src/components/AssistPanel.tsx` | Owns guided-flow step state. Props: `onSelect(pill)`, `onClose()`. Renders header (question + step indicator + close ×) and option-button row + Skip. Closes itself after step 4. |

### Modified

| Path | Change |
|---|---|
| `apps/web/src/components/Button.tsx` | Add `chip` variant: `bg-bg-page border border-border-subtle rounded-full text-text-body hover:bg-bg-toggle`. Size remains controlled by existing `size` prop (`sm` / `md`). |
| `apps/web/src/components/GenBar.tsx` | No change — `onAssist` already a prop. |
| `apps/web/src/routes/Home.tsx` | Add `phase` state (`'idle' \| 'assist'`), `pills` array state, `onAssist` opens panel, `onSelect` from AssistPanel appends to pills, `onClose` returns to idle. Wire to GenBar. |
| `apps/web/src/components/index.ts` | Export `Panel`, `AssistPanel`. |

## AssistPanel sketch

```tsx
type Props = {
  onSelect: (pill: string) => void;
  onClose: () => void;
};

export default function AssistPanel({ onSelect, onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const total = STEPS.length;

  function advance() {
    if (stepIndex + 1 >= total) onClose();
    else setStepIndex(stepIndex + 1);
  }
  function pick(option: string) {
    onSelect(option);
    advance();
  }
  function skip() {
    advance();
  }

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-medium text-text-default">{step.question}</h3>
          <span className="text-xs text-text-muted">{stepIndex + 1} / {total}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="...">
          <XIcon />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {step.options.map((opt) => (
          <Button key={opt} variant="chip" size="sm" onClick={() => pick(opt)}>
            {opt}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={skip}>Skip</Button>
      </div>
    </Panel>
  );
}
```

## Home wiring

```tsx
const [phase, setPhase] = useState<'idle' | 'assist'>('idle');
const [pills, setPills] = useState<string[]>([]);
const [prompt, setPrompt] = useState('');

// GenBar:
//   pills={pills}
//   onRemovePill={(p) => setPills(pills.filter(x => x !== p))}
//   onAssist={() => setPhase('assist')}
//   onGenerate={...}  // still no-op until 5c

{phase === 'assist' && (
  <section className="bg-bg-page">
    <div className="mx-auto w-full max-w-[1024px] px-6 pt-6">
      <AssistPanel
        onSelect={(pill) => setPills((prev) => [...prev, pill])}
        onClose={() => setPhase('idle')}
      />
    </div>
  </section>
)}
```

The panel renders inside its own bg-bg-page section so the page background continues underneath. Browse-by-Category and Featured Recipes sit unchanged below it.

## Commands

```bash
npm run dev    # visit http://localhost:5173/home
```

## Verification

1. `npm run build -w apps/web` clean.
2. `npm test` backend still 36/36.
3. Visual: sparkle button click opens the assist panel under GenBar. Panel matches Figma 8:2158 (border + shadow + 7 chip buttons + Skip).
4. Flow:
   - Click sparkle → panel opens at step 1 "Meal type?" / "1 / 4"
   - Click Dinner → panel updates to "Cuisine?" / "2 / 4"; "Dinner" pill in GenBar
   - Click Italian → "Dietary?" / "3 / 4"; "Dinner" + "Italian" pills
   - Click Skip → "Vibe?" / "4 / 4"; no new pill added
   - Click "Quick (<30 min)" → panel closes; 3 pills in GenBar
   - Click sparkle again → starts fresh at step 1
5. Click × on any pill in GenBar (during or after flow): pill removed from list.
6. Click × on panel header at any step: panel closes immediately; pills already added remain.
7. Generate button enables once at least one pill is in GenBar (no text required).
8. Hex-literal grep across `components/` and `routes/`: zero matches outside `index.css`.

## Deferred to Pass 5c

- `POST /api/ai/generate-drafts` integration triggered by Generate button.
- `DraftsPanel` + `DraftCard` components for the drafts list view.
- `POST /api/ai/generate-full` integration when a draft is clicked.
- `FinalRecipePanel` + `IngredientsTable` + action row (Delete / Edit / Regenerate / Approve).
- Regenerate-with-comment: inline comment input + `POST /api/ai/generate-full` with `{ input: currentRecipe, comment }`.
- `POST /api/recipes` on Approve.
- `Toast` component for Approve success.
- `Pill` `accent` variant (peach bg, deeper orange text) for recipe-display tags.
- Three more frames: 8:3514 (drafts), 8:4636 (final). Fetched per-piece as 5c is built.

## Notes for Pass 5c

- `Panel` is reusable for the drafts and final-recipe panels — same chrome.
- Generate button currently no-op'd; 5c hooks it to: if `phase !== 'idle'` close panel, then `POST /api/ai/generate-drafts` with `pills + text` joined into the prompt, then `setPhase('drafts')`.
- A draft click in 5c triggers `POST /api/ai/generate-full` and transitions phase 'drafts' → 'final'.
- After Approve in 5c, reset phase to 'idle', clear pills + prompt, fire Toast, optionally invalidate any catalog cache.
- The `phase` state grows to `'idle' | 'assist' | 'drafts' | 'final'`. Each phase corresponds to one panel rendered in the same slot.

## Completion

When verification is green:
- Sub-plan checked in.
- No master-plan box flip (Stage 5 only ticks after 5c lands).
- CLAUDE.md Current State: "Stage 5b complete — assist guided flow shipped. Pass 5c next: generation pipeline."
- New Architecture Decisions: Panel component (reused across 3 panels); Button `chip` variant; AssistPanel owns step state; "None" in dietary mapped to Skip.
