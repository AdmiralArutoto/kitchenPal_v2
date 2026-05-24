import { useState, type FormEvent } from 'react';
import type { Ingredient } from '../types/api';
import Button from './Button';
import Input from './Input';
import Textarea from './Textarea';
import FormField from './FormField';
import Pill from './Pill';

export type RecipeFormValues = {
  name: string;
  description: string | null;
  cookingTime: number | null;
  servings: number | null;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  emoji: string | null;
};

type Props = {
  initialValues: RecipeFormValues;
  onCancel: () => void;
  onSave: (values: RecipeFormValues) => void | Promise<void>;
  saving?: boolean;
  submitLabel?: string;
  title?: string;
  subtitle?: string;
  externalError?: string | null;
};

type IngredientRow = { amountText: string; name: string };

// Shared recipe form used by AddRecipeModal (new), RecipeModal (edit), FinalRecipePanel (edit).
// Owns its own form state seeded from initialValues. Calls onSave with the parsed/validated
// values. Caller decides what to do with them (POST, PUT, local state update, etc.).
export default function RecipeEditForm({
  initialValues,
  onCancel,
  onSave,
  saving = false,
  submitLabel = 'Save',
  title,
  subtitle,
  externalError,
}: Props) {
  const [name, setName] = useState(initialValues.name);
  const [description, setDescription] = useState(initialValues.description ?? '');
  const [cookingTime, setCookingTime] = useState(
    initialValues.cookingTime != null ? String(initialValues.cookingTime) : '',
  );
  const [servings, setServings] = useState(
    initialValues.servings != null ? String(initialValues.servings) : '1',
  );
  const [ingredients, setIngredients] = useState<IngredientRow[]>(() =>
    initialValues.ingredients.length > 0
      ? initialValues.ingredients.map((i) => ({
          amountText: `${formatAmount(i.amount)} ${i.unit}`.trim(),
          name: i.name,
        }))
      : [{ amountText: '', name: '' }],
  );
  const [steps, setSteps] = useState<string[]>(() =>
    initialValues.steps.length > 0 ? initialValues.steps : [''],
  );
  const [tags, setTags] = useState<string[]>(initialValues.tags);
  const [tagInput, setTagInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  function updateIngredient(i: number, patch: Partial<IngredientRow>) {
    setIngredients((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addIngredient() {
    setIngredients((prev) => [...prev, { amountText: '', name: '' }]);
  }
  function removeIngredient(i: number) {
    setIngredients((prev) =>
      prev.length === 1 ? [{ amountText: '', name: '' }] : prev.filter((_, idx) => idx !== i),
    );
  }
  function updateStep(i: number, value: string) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, '']);
  }
  function removeStep(i: number) {
    setSteps((prev) => (prev.length === 1 ? [''] : prev.filter((_, idx) => idx !== i)));
  }
  function commitTagInput() {
    const parts = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setTags((prev) => {
      const next = [...prev];
      for (const t of parts) if (!next.includes(t)) next.push(t);
      return next;
    });
    setTagInput('');
  }
  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Recipe name is required');
      return;
    }

    const parsedIngredients: Ingredient[] = [];
    for (const row of ingredients) {
      const amountText = row.amountText.trim();
      const nameText = row.name.trim();
      if (!amountText && !nameText) continue;
      if (!nameText) {
        setError('Each ingredient needs a name');
        return;
      }
      const parsed = parseAmount(amountText);
      if (!parsed) {
        setError(`Ingredient amount must start with a number (e.g. "1 cup")`);
        return;
      }
      parsedIngredients.push({ ...parsed, name: nameText });
    }
    if (parsedIngredients.length === 0) {
      setError('Add at least one ingredient');
      return;
    }

    const filteredSteps = steps.map((s) => s.trim()).filter(Boolean);
    if (filteredSteps.length === 0) {
      setError('Add at least one step');
      return;
    }

    const cookingTimeNum = cookingTime.trim() ? parseInt(cookingTime, 10) : null;
    if (cookingTime.trim() && (cookingTimeNum === null || isNaN(cookingTimeNum))) {
      setError('Cooking time must be a number (minutes)');
      return;
    }

    const servingsNum = parseInt(servings, 10);
    if (isNaN(servingsNum) || servingsNum < 1) {
      setError('Servings must be at least 1');
      return;
    }

    await onSave({
      name: name.trim(),
      description: description.trim() || null,
      cookingTime: cookingTimeNum,
      servings: servingsNum,
      ingredients: parsedIngredients,
      steps: filteredSteps,
      tags,
      emoji: initialValues.emoji,
    });
  }

  const displayError = error ?? externalError ?? null;

  return (
    <form onSubmit={handleSubmit} className="relative flex max-h-[85vh] flex-col">
      {/* Vertical divider — matches RecipeModal layout (image top → footer button bottom) */}
      <div
        className="pointer-events-none absolute inset-y-5 left-1/2 hidden w-px bg-black/10 md:block"
        aria-hidden="true"
      />

      {/* Unified scroll area */}
      <div className="scrollbar-thin grid grid-cols-1 overflow-y-auto md:grid-cols-2">
        {/* Left column — title + recipe fields + tags + steps */}
        <div className="flex flex-col gap-4 p-5">
          {(title || subtitle) && (
            <header className="flex flex-col gap-1">
              {title && (
                <h2 className="text-lg font-semibold leading-tight text-text-default">{title}</h2>
              )}
              {subtitle && <p className="text-sm text-text-placeholder">{subtitle}</p>}
            </header>
          )}

          <FormField label="Recipe Name">
            {({ id }) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="E.g., Grandma's Apple Pie"
                required
              />
            )}
          </FormField>

          <FormField label="Description">
            {({ id }) => (
              <Textarea
                id={id}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of your recipe"
                rows={2}
              />
            )}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Cooking Time">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={cookingTime}
                  onChange={(e) => setCookingTime(e.target.value)}
                  placeholder="30"
                />
              )}
            </FormField>
            <FormField label="Servings">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                />
              )}
            </FormField>
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-default">Tags</label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <Pill key={t} onRemove={() => removeTag(t)}>
                    {t}
                  </Pill>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitTagInput();
                  }
                }}
                placeholder="e.g., Italian, Quick, Vegetarian"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={commitTagInput}
                disabled={!tagInput.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-default">Instructions</label>
            <div className="flex flex-col gap-2">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent-text">
                    {i + 1}
                  </span>
                  <Textarea
                    value={step}
                    onChange={(e) => updateStep(i, e.target.value)}
                    placeholder="First, preheat the oven to..."
                    rows={2}
                  />
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    aria-label="Remove step"
                    className="mt-1.5 inline-flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-bg-toggle hover:text-danger"
                  >
                    <XIcon />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addStep}
                className="self-start text-sm font-medium text-primary hover:underline"
              >
                + Add step
              </button>
            </div>
          </div>
        </div>

        {/* Right column — image placeholder + ingredients table editor */}
        <div className="flex flex-col gap-4 p-5">
          {/* Emoji + gradient hero (mirrors RecipeModal view) */}
          <div
            className="flex h-48 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[linear-gradient(139deg,var(--color-accent-soft)_0%,var(--color-card-blob-pink)_50%,var(--color-card-blob-yellow)_100%)]"
            aria-hidden="true"
          >
            <span className="text-7xl">{initialValues.emoji ?? '🍽️'}</span>
          </div>

          {/* Ingredients editor */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-default">Ingredients</label>
            <div className="overflow-hidden rounded-lg border border-border-subtle">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle bg-bg-page">
                    <th className="w-[36%] px-3 py-1.5 text-left text-xs font-medium text-text-body">
                      Amount
                    </th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-text-body">
                      Ingredient
                    </th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map((row, i) => (
                    <tr key={i} className="border-b border-bg-toggle last:border-b-0">
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={row.amountText}
                          onChange={(e) =>
                            updateIngredient(i, { amountText: e.target.value })
                          }
                          placeholder="1 cup"
                          className="w-full rounded bg-bg-input px-2 py-1 text-sm text-text-default placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => updateIngredient(i, { name: e.target.value })}
                          placeholder="Flour"
                          className="w-full rounded bg-bg-input px-2 py-1 text-sm text-text-default placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </td>
                      <td className="pr-2">
                        <button
                          type="button"
                          onClick={() => removeIngredient(i)}
                          aria-label="Remove ingredient"
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-bg-toggle hover:text-danger"
                        >
                          <XIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={addIngredient}
                className="w-full border-t border-border-subtle px-3 py-2 text-left text-sm font-medium text-primary hover:bg-bg-page"
              >
                + Add ingredient
              </button>
            </div>
          </div>

          {displayError && (
            <p className="text-sm text-danger" role="alert">
              {displayError}
            </p>
          )}
        </div>
      </div>

      {/* Sticky action footer — mirrors right column width */}
      <div className="grid grid-cols-1 md:grid-cols-2">
        <div className="hidden md:block" />
        <div className="flex flex-wrap justify-end gap-2 p-5">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

function parseAmount(s: string): { amount: number; unit: string } | null {
  const match = s.trim().match(/^([\d.]+)\s*(.*)$/);
  if (!match) return null;
  const amount = parseFloat(match[1]!);
  if (isNaN(amount)) return null;
  return { amount, unit: (match[2] ?? '').trim() };
}

function formatAmount(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4 4 L12 12 M12 4 L4 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
