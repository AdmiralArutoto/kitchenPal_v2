import { useEffect, useRef, useState } from 'react';
import { toRecipeBody, formatAmount, formatUnit } from '../lib/recipe';
import {
  useDeleteRecipe,
  useGenerateImage,
  useRemoveImage,
  useUpdateRecipe,
  useUploadImage,
} from '../hooks/useRecipes';
import type { Recipe } from '../types/api';
import Modal from './Modal';
import Pill from './Pill';
import Button from './Button';
import ServingScaler from './ServingScaler';
import RecipeEditForm, { type RecipeFormValues } from './RecipeEditForm';
import SourceAttribution from './SourceAttribution';
import ModifyStudio from './ModifyStudio';
import ImageActionMenu from './ImageActionMenu';

type Props = {
  recipe: Recipe;
  onClose: () => void;
  onTagClick?: (tag: string) => void;
};

type Mode = 'idle' | 'modifying' | 'editing';

// Recipe detail modal (Figma 47:1014). Left column = details + instructions (title w/ inline time,
// description, source/video link, tags, Instructions). Right parchment column = image (w/ action
// menu) + SCALE + ingredients table. Modify/Edit/Delete live in a sticky footer that stays in view
// while the columns scroll. Edit + Delete go through cached mutations; Modify with AI is local.
export default function RecipeModal({ recipe: initialRecipe, onClose, onTagClick }: Props) {
  const [recipe, setRecipe] = useState<Recipe>(initialRecipe);
  const [mode, setMode] = useState<Mode>('idle');
  const [servingsOverride, setServingsOverride] = useState(initialRecipe.servings ?? 1);
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

  function scaleAmount(amount: number): number {
    const ratio = servingsOverride / baseServings;
    return Math.round(amount * ratio * 4) / 4;
  }

  function startModify() {
    setError(null);
    setMode('modifying');
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

  if (mode === 'modifying') {
    return <ModifyStudio recipe={recipe} onClose={() => setMode('idle')} />;
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

  const imageLoading = generateImageMutation.isPending || recipe.imageGenerating;
  const imageActions = recipe.imageUrl
    ? [
        { label: 'Regenerate', icon: <SparkleIcon />, onClick: handleRegenerateImage, disabled: imageBusy },
        { label: 'Upload', icon: <UploadIcon />, onClick: () => fileInputRef.current?.click(), disabled: imageBusy },
        { label: 'Remove', icon: <TrashIcon />, danger: true, onClick: handleRemoveImage, disabled: imageBusy },
      ]
    : [
        { label: 'Generate with AI', icon: <SparkleIcon />, onClick: handleRegenerateImage, disabled: imageBusy },
        { label: 'Upload', icon: <UploadIcon />, onClick: () => fileInputRef.current?.click(), disabled: imageBusy },
      ];

  return (
    <Modal open ariaLabel={recipe.name} onClose={onClose} size="lg">
      <div className="relative flex max-h-[85vh] flex-col overflow-hidden rounded-[10px]">
        <div className="scrollbar-thin grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-2">
          {/* Left column — details + instructions */}
          <div className="flex flex-col gap-4 p-6">
            <header className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-serif text-2xl font-semibold leading-8 text-text-default">
                  {recipe.name}
                </h2>
                {recipe.cookingTime != null && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 pt-1 text-sm text-text-muted">
                    <ClockIcon /> {recipe.cookingTime} min
                  </span>
                )}
              </div>
              {recipe.description && (
                <p className="text-base leading-6 text-text-muted">{recipe.description}</p>
              )}
            </header>

            {/* Source / video link container — reused in place for imported recipes */}
            {recipe.source === 'imported' && (
              <SourceAttribution
                sourceUrl={recipe.sourceUrl}
                sourcePlatform={recipe.sourcePlatform}
                sourceCreator={recipe.sourceCreator}
              />
            )}

            {/* Tags */}
            {recipe.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-4">
                {recipe.tags.map((tag) => (
                  <Pill key={tag} onClick={onTagClick ? () => onTagClick(tag) : undefined}>
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
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-serif text-xs font-bold text-accent-text">
                        {i + 1}
                      </span>
                      <span className="text-sm leading-6 text-text-body">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>

          {/* Right column — media & controls sidebar */}
          <div className="flex flex-col gap-4 bg-bg-page p-5 md:border-l md:border-border-subtle">
            {/* Image + top-right action menu */}
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFilePicked}
                className="hidden"
              />
              {imageLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-medium text-white">
                  Generating image…
                </div>
              ) : (
                <ImageActionMenu actions={imageActions} ariaLabel="Image options" />
              )}
            </div>

            {/* SCALE */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-card px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-placeholder">
                Scale
              </span>
              <ServingScaler value={servingsOverride} onChange={setServingsOverride} />
            </div>

            {/* Ingredients table */}
            {recipe.ingredients.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle bg-bg-page">
                      <th className="w-[34%] px-3 py-1.5 text-left text-xs font-medium text-text-body">
                        Amount
                      </th>
                      <th className="px-3 py-1.5 text-left text-xs font-medium text-text-body">
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
                        <td className="px-3 py-1.5 text-text-muted">
                          <span className="font-medium">
                            {formatAmount(scaleAmount(ing.amount))}
                          </span>
                          {ing.unit && ` ${formatUnit(ing.unit)}`}
                        </td>
                        <td className="px-3 py-1.5 text-text-body">{ing.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        </div>

        {/* Sticky footer — Modify / Edit / Delete stay in view while the columns scroll */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle bg-bg-card p-4">
          <Button type="button" variant="secondary" size="sm" onClick={startModify}>
            <SparkleIcon /> <span className="ml-2">Modify</span>
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
            aria-label="Delete recipe"
            className="inline-flex h-8 w-9 items-center justify-center rounded-lg border border-border-subtle bg-bg-card text-danger hover:bg-bg-toggle"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </Modal>
  );
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

function UploadIcon() {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
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
