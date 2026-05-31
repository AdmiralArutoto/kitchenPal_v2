import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { toRecipeBody, type RecipeBody } from '../lib/recipe';
import { useCreateRecipe, useUpdateRecipe } from '../hooks/useRecipes';
import { useToast } from '../contexts/ToastContext';
import type {
  Ingredient,
  IngredientDiff,
  ModifyDiff,
  ModifyResponse,
  Recipe,
  StepDiff,
} from '../types/api';
import Panel from './Panel';
import Button from './Button';
import Input from './Input';

type Props = {
  recipe: Recipe;
  onClose: () => void;
};

const SCALES: { label: string; factor: number }[] = [
  { label: '÷2', factor: 0.5 },
  { label: '×1', factor: 1 },
  { label: '×2', factor: 2 },
  { label: '×4', factor: 4 },
];
const DIETARY = ['Vegan', 'Gluten-free', 'Dairy-free', 'Low-carb'];
const SIMPLIFY = ['Fewer steps', 'Pantry only'];

// Modify studio (v2_modify_with_ai): the recipe and the Modify panel are TWO separate cards floating
// over a backdrop (the panel is a dialog beside the recipe, not a column inside it). Quick controls
// compose one modify comment that runs against the ORIGINAL recipe only on the star "Apply" press
// (so the user can set several inputs first); the server returns the modified recipe + a diff,
// rendered on the left as old→new ingredient changes and word-highlighted steps. Save as copy creates
// a new recipe; Replace original updates in place. Both stamp source 'ai_modified'.
export default function ModifyStudio({ recipe, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [dietary, setDietary] = useState<string[]>([]);
  const [simplify, setSimplify] = useState<string[]>([]);
  const [substitute, setSubstitute] = useState('');

  const [modified, setModified] = useState<ModifyResponse['recipe'] | null>(null);
  const [diff, setDiff] = useState<ModifyDiff | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateRecipe();
  const updateMutation = useUpdateRecipe();
  const { showToast } = useToast();

  const baseServings = recipe.servings ?? 1;

  // Backdrop dialog behaviour: lock body scroll + close on Escape (this view doesn't use <Modal>
  // because it renders two separate cards rather than one panel).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function composeComment(): string {
    const parts: string[] = [];
    if (scale !== 1) {
      const target = Math.max(1, Math.round(baseServings * scale));
      parts.push(`Scale the recipe to ${target} servings.`);
    }
    if (dietary.length) parts.push(`Make it ${dietary.join(', ').toLowerCase()}.`);
    if (simplify.includes('Fewer steps')) parts.push('Use fewer, simpler steps.');
    if (simplify.includes('Pantry only')) parts.push('Use only common pantry ingredients.');
    if (substitute.trim()) parts.push(`Substitute: ${substitute.trim()}.`);
    return parts.join(' ');
  }

  function summary(): string {
    const bits: string[] = [];
    if (dietary.length) bits.push(dietary.join(' & ').toLowerCase());
    if (scale !== 1) bits.push(scale < 1 ? `scaled ÷${Math.round(1 / scale)}` : `scaled ×${scale}`);
    if (simplify.length) bits.push(simplify.join(' & ').toLowerCase());
    if (substitute.trim()) bits.push(`sub ${substitute.trim()}`);
    return bits.length ? `Adapting to ${bits.join(' · ')}` : 'Pick changes on the right, then Apply →';
  }

  const hasControls =
    scale !== 1 || dietary.length > 0 || simplify.length > 0 || substitute.trim().length > 0;
  const hasChanges = modified != null;

  // Apply runs the composed comment against the ORIGINAL recipe (so toggling a control off and
  // re-applying reverts it). Fired only on the button press — never on every control change.
  async function applyChanges() {
    const comment = composeComment();
    if (!comment || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<ModifyResponse>('/api/ai/modify', {
        method: 'POST',
        body: JSON.stringify({ recipe: toRecipeBody(recipe), comment }),
      });
      setModified(res.recipe);
      setDiff(res.diff);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to modify recipe');
    } finally {
      setBusy(false);
    }
  }

  function toggle(list: string[], value: string, set: (v: string[]) => void) {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  function modifiedBody(extra?: Partial<RecipeBody>): RecipeBody {
    return {
      name: modified!.name,
      description: modified!.description || null,
      ingredients: modified!.ingredients,
      steps: modified!.steps,
      tags: modified!.tags,
      cookingTime: modified!.cooking_time,
      servings: modified!.servings,
      emoji: modified!.emoji,
      source: 'ai_modified',
      ...extra,
    };
  }

  function saveAsCopy() {
    if (!modified || busy) return;
    createMutation.mutate({ body: modifiedBody({ imageUrl: recipe.imageUrl }) });
    showToast(`Saved a modified copy of "${recipe.name}"`, 'success');
    onClose();
  }

  function replaceOriginal() {
    if (!modified || busy) return;
    updateMutation.mutate({ id: recipe.id, body: modifiedBody() });
    showToast(`Updated "${recipe.name}"`, 'success');
    onClose();
  }

  function undoAll() {
    setScale(1);
    setDietary([]);
    setSimplify([]);
    setSubstitute('');
    setModified(null);
    setDiff(null);
    setError(null);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Modify ${recipe.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-[1100px] flex-col gap-5 overflow-y-auto md:flex-row md:items-start md:overflow-visible">
        {/* Recipe card with the diff */}
        <Panel padding="none" className="scrollbar-thin flex-1 md:max-h-[90vh] md:overflow-y-auto">
          <div className={`flex flex-col gap-5 p-6 ${busy ? 'opacity-60' : ''}`}>
            <header className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-2xl font-semibold text-text-default">{recipe.name}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-white">
                  <SparkleIcon /> {busy ? 'Updating…' : 'Modify mode'}
                </span>
              </div>
              <p className="text-sm text-text-muted">{summary()}</p>
            </header>

            <section className="flex flex-col gap-2 border-t border-black/10 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-placeholder">
                Ingredients
              </h3>
              <ul className="flex flex-col">
                {diff
                  ? diff.ingredients.map((row, i) => <IngredientDiffRow key={i} row={row} />)
                  : recipe.ingredients.map((ing, i) => (
                      <li
                        key={i}
                        className="border-b border-bg-toggle py-2 text-sm text-text-body last:border-b-0"
                      >
                        {fmtIngredient(ing)}
                      </li>
                    ))}
              </ul>
            </section>

            <section className="flex flex-col gap-3 border-t border-black/10 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-placeholder">
                Instructions
              </h3>
              <ol className="flex flex-col gap-3">
                {diff
                  ? diff.steps.map((row, i) => <StepDiffRow key={i} row={row} index={i} />)
                  : recipe.steps.map((step, i) => (
                      <li key={i} className="flex gap-3">
                        <StepNumber n={i + 1} />
                        <span className="text-sm leading-5 text-text-body">{step}</span>
                      </li>
                    ))}
              </ol>
            </section>
          </div>
        </Panel>

        {/* Modify dialog — separate card beside the recipe */}
        <Panel
          padding="none"
          className="scrollbar-thin w-full overflow-hidden md:max-h-[90vh] md:w-[360px] md:shrink-0 md:overflow-y-auto"
        >
          <div className="flex flex-col gap-4 bg-accent-bg-soft p-5">
            <div className="flex items-center justify-between">
              <h3 className="inline-flex items-center gap-2 text-base font-semibold text-text-default">
                <span className="text-primary">
                  <SparkleIcon />
                </span>
                Modify
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-bg-toggle"
              >
                <XIcon />
              </button>
            </div>

            <ControlGroup label="Scale">
              {SCALES.map((s) => (
                <SegButton key={s.label} active={scale === s.factor} onClick={() => setScale(s.factor)}>
                  {s.label}
                </SegButton>
              ))}
            </ControlGroup>

            <ControlGroup label="Dietary">
              {DIETARY.map((d) => (
                <SegButton
                  key={d}
                  active={dietary.includes(d)}
                  onClick={() => toggle(dietary, d, setDietary)}
                >
                  {d}
                  {dietary.includes(d) ? ' ✓' : ''}
                </SegButton>
              ))}
            </ControlGroup>

            <ControlGroup label="Simplify">
              {SIMPLIFY.map((s) => (
                <SegButton
                  key={s}
                  active={simplify.includes(s)}
                  onClick={() => toggle(simplify, s, setSimplify)}
                >
                  {s}
                </SegButton>
              ))}
            </ControlGroup>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-default">Substitute</span>
              <Input
                value={substitute}
                onChange={(e) => setSubstitute(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyChanges();
                  }
                }}
                placeholder="e.g. no parmesan…"
                className="bg-bg-card"
              />
            </div>

            <Button type="button" fullWidth onClick={applyChanges} disabled={!hasControls || busy}>
              <SparkleIcon />
              <span className="ml-2">{busy ? 'Applying…' : 'Apply with AI'}</span>
            </Button>

            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-2 border-t border-accent-peach pt-4">
              <Button type="button" fullWidth onClick={saveAsCopy} disabled={!hasChanges || busy}>
                Save as copy
              </Button>
              <Button type="button" variant="secondary" fullWidth onClick={replaceOriginal} disabled={!hasChanges || busy}>
                Replace original
              </Button>
              <button
                type="button"
                onClick={undoAll}
                disabled={!hasChanges && !hasControls}
                className="mx-auto text-sm font-medium text-text-muted hover:text-text-default disabled:opacity-50"
              >
                Undo all
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function IngredientDiffRow({ row }: { row: IngredientDiff }) {
  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-bg-toggle py-2 text-sm last:border-b-0">
      {row.status === 'unchanged' ? (
        <>
          <span className="text-text-body">{row.new ?? row.old}</span>
          <span className="text-xs text-text-placeholder">(unchanged)</span>
        </>
      ) : row.status === 'added' ? (
        <span className="font-medium text-primary">{row.new}</span>
      ) : row.status === 'removed' ? (
        <span className="text-text-muted line-through">{row.old}</span>
      ) : (
        <>
          <span className="text-text-muted line-through">{row.old}</span>
          <ArrowSmall />
          <span className="font-medium text-primary">{row.new}</span>
        </>
      )}
    </li>
  );
}

function StepDiffRow({ row, index }: { row: StepDiff; index: number }) {
  if (row.status === 'removed') {
    return (
      <li className="flex gap-3">
        <StepNumber n={index + 1} />
        <span className="text-sm leading-5 text-text-muted line-through">{row.old}</span>
      </li>
    );
  }
  return (
    <li className="flex gap-3">
      <StepNumber n={index + 1} />
      <span className="text-sm leading-5 text-text-body">
        {row.tokens.map((t, i) => (
          <span key={i} className={t.changed ? 'font-medium text-primary' : undefined}>
            {t.text}
            {i < row.tokens.length - 1 ? ' ' : ''}
          </span>
        ))}
      </span>
    </li>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-text-default">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors ${
        active
          ? 'bg-text-default text-bg-card'
          : 'border border-border-subtle bg-bg-card text-text-body hover:bg-bg-toggle'
      }`}
    >
      {children}
    </button>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent-text">
      {n}
    </span>
  );
}

function fmtIngredient(ing: Ingredient): string {
  const amount = ing.amount ? String(ing.amount) : '';
  const head = [amount, ing.unit].filter(Boolean).join(' ');
  return [head, ing.name].filter(Boolean).join(' ').trim();
}

function ArrowSmall() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-text-placeholder"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
