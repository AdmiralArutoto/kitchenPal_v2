import { useState } from 'react';
import type { FullRecipeResponse } from '../types/api';
import { formatAmount, formatUnit } from '../lib/recipe';
import Panel from './Panel';
import Pill from './Pill';
import Button from './Button';
import Input from './Input';
import RecipeEditForm, { type RecipeFormValues } from './RecipeEditForm';

type Props = {
  recipe: FullRecipeResponse;
  onDelete: () => void;
  onEdit: (updated: FullRecipeResponse) => void;
  onRegenerate: (comment: string) => void;
  onApprove: () => void;
  regenerating?: boolean;
  approving?: boolean;
};

// Inline final-recipe panel — Figma 8:4636.
// Content: title + description + meta + accent tag pills + Ingredients table + Instructions list.
// Footer action row: Delete / Edit / Regenerate / Approve.
// Edit toggles to RecipeEditForm; Save updates local recipe state via onEdit (Approve commits to DB).
export default function FinalRecipePanel({
  recipe,
  onDelete,
  onEdit,
  onRegenerate,
  onApprove,
  regenerating = false,
  approving = false,
}: Props) {
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);
  const busy = regenerating || approving;

  function submitRegenerate() {
    const trimmed = comment.trim();
    if (!trimmed) return;
    onRegenerate(trimmed);
    setComment('');
    setRegenerateOpen(false);
  }

  function handleSaveEdit(values: RecipeFormValues) {
    onEdit({
      name: values.name,
      description: values.description ?? '',
      ingredients: values.ingredients,
      steps: values.steps,
      tags: values.tags,
      cooking_time: values.cookingTime ?? 0,
      servings: values.servings ?? 1,
      emoji: values.emoji ?? recipe.emoji,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <Panel padding="none" className="overflow-hidden">
        <RecipeEditForm
          title="Edit Recipe"
          initialValues={{
            name: recipe.name,
            description: recipe.description,
            cookingTime: recipe.cooking_time,
            servings: recipe.servings,
            ingredients: recipe.ingredients,
            steps: recipe.steps,
            tags: recipe.tags,
            emoji: recipe.emoji,
          }}
          onCancel={() => setEditing(false)}
          onSave={handleSaveEdit}
          submitLabel="Save changes"
        />
      </Panel>
    );
  }

  return (
    <Panel padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-6 pb-6 pl-6 pr-6 pt-6">
        {/* Top: title + description + meta + tags */}
        <div className="flex flex-col gap-3">
          <h2 className="font-serif text-3xl font-medium leading-9 text-text-default">{recipe.name}</h2>
          <p className="text-base leading-6 text-text-muted">{recipe.description}</p>
          <div className="flex flex-wrap gap-6 text-sm text-text-body">
            <span>
              <span className="font-medium">Cook:</span> {recipe.cooking_time} min
            </span>
            <span>
              <span className="font-medium">Servings:</span> {recipe.servings}
            </span>
          </div>
          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {recipe.tags.map((tag) => (
                <Pill key={tag} variant="accent">
                  {tag}
                </Pill>
              ))}
            </div>
          )}
        </div>

        {/* Ingredients */}
        <section className="flex flex-col gap-3">
          <h3 className="text-xl font-semibold text-text-default">Ingredients</h3>
          <div className="overflow-hidden rounded-[10px] border border-border-subtle">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-bg-page">
                  <th className="w-[36%] px-4 py-2.5 text-left font-medium text-text-body">
                    Amount
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-text-body">Ingredient</th>
                </tr>
              </thead>
              <tbody>
                {recipe.ingredients.map((ing, i) => (
                  <tr key={`${ing.name}-${i}`} className="border-b border-bg-toggle last:border-b-0">
                    <td className="px-4 py-2.5 font-medium text-text-muted">
                      {formatAmount(ing.amount)} {formatUnit(ing.unit)}
                    </td>
                    <td className="px-4 py-2.5 text-text-body">{ing.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Instructions */}
        {recipe.steps.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="text-xl font-semibold text-text-default">Instructions</h3>
            <ol className="flex flex-col gap-3">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent-text">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-5 text-text-body">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {/* Action row */}
      <footer className="flex flex-col gap-3 border-t border-black/10 bg-bg-page p-4">
        {regenerateOpen && (
          <div className="flex gap-2">
            <Input
              placeholder="What would you like to change?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && comment.trim() && !busy) {
                  e.preventDefault();
                  submitRegenerate();
                }
              }}
              disabled={busy}
              autoFocus
            />
            <Button
              type="button"
              size="sm"
              onClick={submitRegenerate}
              disabled={!comment.trim() || busy}
            >
              {regenerating ? 'Regenerating…' : 'Send'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setRegenerateOpen(false);
                setComment('');
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-danger-light bg-bg-card px-3 text-sm font-medium text-danger hover:bg-danger-light/30 disabled:opacity-60"
            >
              <TrashIcon /> Delete
            </button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              <PencilIcon /> <span className="ml-2">Edit</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRegenerateOpen((v) => !v)}
              disabled={busy}
            >
              <RefreshIcon /> <span className="ml-2">Regenerate</span>
            </Button>
          </div>
          <Button type="button" onClick={onApprove} disabled={busy}>
            <CheckIcon />
            <span className="ml-2">{approving ? 'Saving…' : 'Approve'}</span>
          </Button>
        </div>
      </footer>
    </Panel>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
