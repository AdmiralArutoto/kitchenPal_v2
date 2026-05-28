import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { toRecipeBody } from '../lib/recipe';
import {
  useDeleteRecipe,
  useGenerateImage,
  useRemoveImage,
  useUpdateRecipe,
  useUploadImage,
} from '../hooks/useRecipes';
import type { FullRecipeResponse, Recipe } from '../types/api';
import Modal from './Modal';
import Pill from './Pill';
import Button from './Button';
import ServingScaler from './ServingScaler';
import RecipeEditForm, { type RecipeFormValues } from './RecipeEditForm';
import SourceAttribution from './SourceAttribution';

type Props = {
  recipe: Recipe;
  onClose: () => void;
  onTagClick?: (tag: string) => void;
};

type Mode = 'idle' | 'modifying' | 'editing';

// Recipe detail modal. View-only display with live serving scaler.
// Edit + Delete go through cached mutations (optimistic). Modify with AI is local until Approve.
export default function RecipeModal({ recipe: initialRecipe, onClose, onTagClick }: Props) {
  const [recipe, setRecipe] = useState<Recipe>(initialRecipe);
  const [mode, setMode] = useState<Mode>('idle');
  const [comment, setComment] = useState('');
  const [servingsOverride, setServingsOverride] = useState(initialRecipe.servings ?? 1);
  const [busy, setBusy] = useState<'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useUpdateRecipe();
  const deleteMutation = useDeleteRecipe();
  const generateImageMutation = useGenerateImage();
  const uploadImageMutation = useUploadImage();
  const removeImageMutation = useRemoveImage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageBusy =
    generateImageMutation.isPending ||
    uploadImageMutation.isPending ||
    removeImageMutation.isPending;

  // Sync local recipe with cache-driven prop changes while not in an active flow.
  useEffect(() => {
    if (mode === 'idle') setRecipe(initialRecipe);
  }, [initialRecipe, mode]);

  // Reset scaler when the displayed recipe changes (e.g., after Apply).
  useEffect(() => {
    setServingsOverride(recipe.servings ?? 1);
  }, [recipe.servings, recipe.id]);

  const baseServings = recipe.servings ?? 1;
  const isModified = recipe !== initialRecipe;

  function scaleAmount(amount: number): number {
    const ratio = servingsOverride / baseServings;
    return Math.round(amount * ratio * 4) / 4;
  }

  function startModify() {
    setError(null);
    setMode('modifying');
  }

  function cancelModify() {
    setError(null);
    setMode('idle');
    setComment('');
    setRecipe(initialRecipe);
  }

  async function applyModification() {
    const trimmed = comment.trim();
    if (!trimmed || busy) return;
    setBusy('apply');
    setError(null);
    try {
      const response = await apiFetch<FullRecipeResponse>('/api/ai/modify', {
        method: 'POST',
        body: JSON.stringify({
          recipe: toRecipeBody(recipe),
          comment: trimmed,
        }),
      });
      setRecipe({
        ...recipe,
        name: response.name,
        description: response.description,
        ingredients: response.ingredients,
        steps: response.steps,
        tags: response.tags,
        cookingTime: response.cooking_time,
        servings: response.servings,
        emoji: response.emoji,
      });
      setComment('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to modify recipe');
    } finally {
      setBusy(null);
    }
  }

  function approveModification() {
    if (!isModified) return;
    updateMutation.mutate({
      id: recipe.id,
      body: { ...toRecipeBody(recipe), source: 'ai_modified' },
    });
    onClose();
  }

  function handleSaveEdit(values: RecipeFormValues) {
    const optimistic: Recipe = {
      ...recipe,
      name: values.name,
      description: values.description,
      cookingTime: values.cookingTime,
      servings: values.servings,
      ingredients: values.ingredients,
      steps: values.steps,
      tags: values.tags,
      emoji: values.emoji,
    };
    setRecipe(optimistic);
    setMode('idle');
    updateMutation.mutate({
      id: recipe.id,
      body: { ...toRecipeBody(optimistic), source: recipe.source },
    });
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${recipe.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(recipe.id);
    onClose();
  }

  function handleRegenerateImage() {
    if (imageBusy) return;
    generateImageMutation.mutate(recipe.id);
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || imageBusy) return;
    uploadImageMutation.mutate({ recipeId: recipe.id, file });
  }

  function handleRemoveImage() {
    if (imageBusy || !recipe.imageUrl) return;
    if (!window.confirm('Remove this recipe image?')) return;
    removeImageMutation.mutate(recipe.id);
  }

  if (mode === 'editing') {
    return (
      <Modal open ariaLabel={`Edit ${recipe.name}`} onClose={onClose} size="lg">
        <RecipeEditForm
          title="Edit Recipe"
          initialValues={{
            name: recipe.name,
            description: recipe.description,
            cookingTime: recipe.cookingTime,
            servings: recipe.servings,
            ingredients: recipe.ingredients,
            steps: recipe.steps,
            tags: recipe.tags,
            emoji: recipe.emoji,
          }}
          onCancel={() => {
            setError(null);
            setMode('idle');
          }}
          onSave={handleSaveEdit}
          saving={false}
          submitLabel="Save"
        />
      </Modal>
    );
  }

  return (
    <Modal open ariaLabel={recipe.name} onClose={onClose} size="lg">
      <div className="relative flex max-h-[85vh] flex-col">
        {/* Vertical divider — top aligns with image top edge (p-5 = 20px from modal top),
            bottom aligns with action buttons' bottom edge (p-5 = 20px from modal bottom). */}
        <div
          className="pointer-events-none absolute inset-y-5 left-1/2 hidden w-px bg-black/10 md:block"
          aria-hidden="true"
        />
        {/* Unified scroll area — both columns share a single slim scrollbar at the card's outer edge */}
        <div className="scrollbar-thin grid grid-cols-1 overflow-y-auto md:grid-cols-2">
          {/* Left column — info + instructions */}
          <div className="flex flex-col gap-4 p-5">
            <header className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold leading-8 text-text-default">{recipe.name}</h2>
              {recipe.description && (
                <p className="text-base leading-6 text-text-placeholder">{recipe.description}</p>
              )}
            </header>

            {recipe.source === 'imported' && (
              <SourceAttribution
                sourceUrl={recipe.sourceUrl}
                sourcePlatform={recipe.sourcePlatform}
                sourceCreator={recipe.sourceCreator}
              />
            )}

            {/* Meta row */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-4">
              {recipe.cookingTime != null && (
                <span className="inline-flex items-center gap-2 text-sm text-text-body">
                  <ClockIcon /> {recipe.cookingTime} min
                </span>
              )}
              <span className="inline-flex items-center gap-3 text-sm text-text-body">
                <UsersIcon />
                <ServingScaler value={servingsOverride} onChange={setServingsOverride} />
              </span>
            </div>

            {/* Tags — click to filter catalog by this tag */}
            {recipe.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {recipe.tags.map((tag) => (
                  <Pill
                    key={tag}
                    onClick={onTagClick ? () => onTagClick(tag) : undefined}
                  >
                    {tag}
                  </Pill>
                ))}
              </div>
            )}

            {/* Instructions */}
            {recipe.steps.length > 0 && (
              <section className="flex flex-col gap-3">
                <h3 className="text-lg font-semibold text-text-default">Instructions</h3>
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

          {/* Right column — image + ingredients + (optional modify panel) */}
          <div className="flex flex-col gap-4 p-5">
            {/* Hero — uploaded/generated image, or emoji-over-gradient fallback */}
            <div className="relative h-48 shrink-0 overflow-hidden rounded-lg">
              {recipe.imageUrl ? (
                <img
                  src={recipe.imageUrl}
                  alt={recipe.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center bg-[linear-gradient(139deg,var(--color-accent-soft)_0%,var(--color-card-blob-pink)_50%,var(--color-card-blob-yellow)_100%)]"
                  aria-hidden="true"
                >
                  <span className="text-7xl">{recipe.emoji ?? '🍽️'}</span>
                </div>
              )}
              {generateImageMutation.isPending && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-medium text-white">
                  Generating image…
                </div>
              )}
            </div>

            {/* Image action row — visible only in idle mode */}
            {mode === 'idle' && (
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFilePicked}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleRegenerateImage}
                  disabled={imageBusy}
                >
                  <SparkleIcon />
                  <span className="ml-2">
                    {recipe.imageUrl ? 'Regenerate' : 'Generate with AI'}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={imageBusy}
                >
                  {uploadImageMutation.isPending ? 'Uploading…' : 'Upload'}
                </Button>
                {recipe.imageUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    disabled={imageBusy}
                    className="inline-flex h-8 items-center rounded-lg border border-border-subtle bg-bg-card px-3 text-sm font-medium text-danger hover:bg-bg-toggle disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            )}

            {/* Ingredients table */}
            {recipe.ingredients.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border-subtle">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle bg-bg-page">
                      <th className="w-[40%] px-3 py-2 text-left text-xs font-medium text-text-body">
                        Amount
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-text-body">
                        Ingredient
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipe.ingredients.map((ing, i) => (
                      <tr
                        key={`${ing.name}-${i}`}
                        className="border-b border-bg-toggle last:border-b-0"
                      >
                        <td className="px-3 py-2 text-text-muted">
                          <span className="font-medium">
                            {formatAmount(scaleAmount(ing.amount))}
                          </span>
                          {ing.unit && ` ${ing.unit}`}
                        </td>
                        <td className="px-3 py-2 text-text-body">{ing.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Modify with AI panel */}
            {mode === 'modifying' && (
              <section className="flex flex-col gap-3 rounded-[10px] border border-accent-peach bg-accent-bg-soft p-4">
                <h4 className="inline-flex items-center gap-2 text-sm font-medium text-accent-text">
                  <SparkleIcon /> Modify with AI
                </h4>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="e.g., Make it dairy-free, simplify the steps, add more vegetables..."
                  disabled={busy === 'apply'}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-sm text-text-default placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={applyModification}
                    disabled={!comment.trim() || busy === 'apply'}
                  >
                    {busy === 'apply' ? 'Modifying…' : 'Apply Modifications'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={cancelModify}
                    disabled={busy === 'apply'}
                  >
                    Cancel
                  </Button>
                </div>
              </section>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        </div>

        {/* Sticky action footer — mirrors the right column width so it aligns with the ingredient table */}
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="hidden md:block" />
          <div className="flex flex-wrap justify-end gap-2 p-5">
            {mode === 'idle' ? (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={startModify}>
                  <SparkleIcon /> <span className="ml-2">Modify with AI</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    setMode('editing');
                  }}
                >
                  <PencilIcon /> <span className="ml-2">Edit</span>
                </Button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-border-subtle bg-bg-card px-3 text-sm font-medium text-danger hover:bg-bg-toggle"
                >
                  <TrashIcon />
                  <span>Delete</span>
                </button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={cancelModify}
                  disabled={busy === 'apply'}
                >
                  Discard
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={approveModification}
                  disabled={!isModified || busy === 'apply'}
                  title={!isModified ? 'Apply a modification first to enable Approve' : undefined}
                >
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function formatAmount(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

function ClockIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function UsersIcon() {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SparkleIcon() {
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
      <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />
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
