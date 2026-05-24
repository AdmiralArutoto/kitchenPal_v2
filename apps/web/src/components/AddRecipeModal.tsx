import { useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Textarea from './Textarea';
import FormField from './FormField';
import Pill from './Pill';

type Props = {
  onClose: () => void;
  onCreated: () => void;
};

type IngredientRow = { amountText: string; name: string };

const EMOJIS = ['🍝', '🥗', '🍕', '🥘', '🍳', '🍔', '🌮', '🍣', '🍜', '🥪', '🥟', '🍲', '🥞', '🍱', '🍰'];

// Add Recipe modal from Figma 8:9872. Manual creation form.
// On submit → POST /api/recipes with source: 'manual'.
export default function AddRecipeModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cookingTime, setCookingTime] = useState('');
  const [servings, setServings] = useState('2');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([{ amountText: '', name: '' }]);
  const [steps, setSteps] = useState<string[]>(['']);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [emoji] = useState(() => EMOJIS[Math.floor(Math.random() * EMOJIS.length)]!);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addIngredient() {
    setIngredients((prev) => [...prev, { amountText: '', name: '' }]);
  }

  function updateIngredient(i: number, patch: Partial<IngredientRow>) {
    setIngredients((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function removeIngredient(i: number) {
    setIngredients((prev) =>
      prev.length === 1 ? [{ amountText: '', name: '' }] : prev.filter((_, idx) => idx !== i),
    );
  }

  function addStep() {
    setSteps((prev) => [...prev, '']);
  }

  function updateStep(i: number, value: string) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? value : s)));
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
      for (const t of parts) {
        if (!next.includes(t)) next.push(t);
      }
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

    // Parse ingredient rows (skip fully-empty rows)
    const parsedIngredients = [];
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

    setSubmitting(true);
    try {
      await apiFetch('/api/recipes', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          ingredients: parsedIngredients,
          steps: filteredSteps,
          tags,
          cookingTime: cookingTimeNum,
          servings: servingsNum,
          emoji,
          source: 'manual',
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create recipe');
      setSubmitting(false);
    }
  }

  return (
    <Modal open ariaLabel="Add new recipe" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-6 pb-6 pt-6">
        <header className="flex flex-col gap-2 pr-8">
          <h2 className="text-lg font-semibold leading-tight text-text-default">Add New Recipe</h2>
          <p className="text-sm text-text-placeholder">Create a new recipe for your collection</p>
        </header>

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

        <div className="grid grid-cols-2 gap-4">
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

        {/* Ingredients */}
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
                        onChange={(e) => updateIngredient(i, { amountText: e.target.value })}
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

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-black/10 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Add Recipe'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function parseAmount(s: string): { amount: number; unit: string } | null {
  const match = s.trim().match(/^([\d.]+)\s*(.*)$/);
  if (!match) return null;
  const amount = parseFloat(match[1]!);
  if (isNaN(amount)) return null;
  return { amount, unit: (match[2] ?? '').trim() };
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
