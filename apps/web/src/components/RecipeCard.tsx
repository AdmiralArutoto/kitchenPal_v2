import type { Recipe } from '../types/api';
import Pill from './Pill';

type Props = {
  recipe: Recipe;
  onClick: () => void;
};

// Clickable recipe card from Figma 8:6412.
// Gradient emoji header (accent-soft → card-blob-pink → card-blob-yellow) + body with title/desc/meta/tags.
export default function RecipeCard({ recipe, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-card text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
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
          <span className="text-7xl">{recipe.emoji ?? '🍽️'}</span>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h3
            className="line-clamp-1 text-base font-semibold text-text-default"
            title={recipe.name}
          >
            {recipe.name}
          </h3>
          <p
            className="line-clamp-2 h-10 text-sm text-text-muted"
            title={recipe.description ?? undefined}
          >
            {recipe.description}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-text-muted">
          {recipe.cookingTime != null && (
            <span className="inline-flex items-center gap-1">
              <ClockIcon /> {recipe.cookingTime} min
            </span>
          )}
          {recipe.servings != null && (
            <span className="inline-flex items-center gap-1">
              <UsersIcon /> {recipe.servings}
            </span>
          )}
        </div>
        <div
          className="flex h-6 gap-1 overflow-hidden"
          title={recipe.tags.length > 0 ? recipe.tags.join(', ') : undefined}
        >
          {recipe.tags.map((tag) => (
            <span key={tag} className="shrink-0">
              <Pill variant="recipe-tag">{tag}</Pill>
            </span>
          ))}
        </div>
      </div>
    </button>
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
