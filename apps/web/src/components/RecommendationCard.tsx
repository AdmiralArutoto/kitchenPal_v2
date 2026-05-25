import { useState } from 'react';
import { useCreateRecipe } from '../hooks/useRecipes';
import { useToast } from '../contexts/ToastContext';
import type { BatchedRecipe } from '../types/api';
import Pill from './Pill';
import Button from './Button';

type Props = {
  recipe: BatchedRecipe;
};

// One card in the daily rotation feed. Display-only until the user clicks
// "Move to catalog", which POSTs the recipe with source: 'daily_rotation'
// (reusing the batch's already-uploaded imageUrl — no second image-gen call).
export default function RecommendationCard({ recipe }: Props) {
  const [saved, setSaved] = useState(false);
  const createMutation = useCreateRecipe();
  const { showToast } = useToast();

  function handleSave() {
    if (saved) return;
    createMutation.mutate({
      body: {
        name: recipe.name,
        description: recipe.description,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        tags: recipe.tags,
        cookingTime: recipe.cookingTime,
        servings: recipe.servings,
        emoji: recipe.emoji,
        imageUrl: recipe.imageUrl ?? null,
        source: 'daily_rotation',
      },
    });
    setSaved(true);
    showToast(`Moved "${recipe.name}" to your catalog`, 'success');
  }

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
      {recipe.imageUrl ? (
        <img
          src={recipe.imageUrl}
          alt=""
          loading="lazy"
          className="h-48 w-full shrink-0 object-cover"
        />
      ) : (
        <div
          className="flex h-48 shrink-0 items-center justify-center bg-[linear-gradient(139deg,var(--color-accent-soft)_0%,var(--color-card-blob-pink)_50%,var(--color-card-blob-yellow)_100%)]"
          aria-hidden="true"
        >
          <span className="text-7xl">{recipe.emoji || '🍽️'}</span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h3 className="line-clamp-1 text-base font-semibold text-text-default" title={recipe.name}>
            {recipe.name}
          </h3>
          <p
            className="line-clamp-2 h-10 text-sm text-text-muted"
            title={recipe.description}
          >
            {recipe.description}
          </p>
        </div>

        <div className="flex items-center gap-3 text-sm text-text-muted">
          <span className="inline-flex items-center gap-1">
            <ClockIcon /> {recipe.cookingTime} min
          </span>
          <span className="inline-flex items-center gap-1">
            <UsersIcon /> {recipe.servings}
          </span>
        </div>

        {recipe.tags.length > 0 && (
          <div className="flex h-6 gap-1 overflow-hidden">
            {recipe.tags.map((tag) => (
              <span key={tag} className="shrink-0">
                <Pill variant="recipe-tag">{tag}</Pill>
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex pt-2">
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saved}
            title={saved ? 'Already in your catalog' : undefined}
          >
            {saved ? 'Saved' : 'Move to catalog'}
          </Button>
        </div>
      </div>
    </article>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  );
}
