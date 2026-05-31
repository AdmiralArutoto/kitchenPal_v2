import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRecipes } from '../hooks/useRecipes';
import type { Recipe } from '../types/api';
import RecipeCard from './RecipeCard';

type Props = {
  onSelect: (recipe: Recipe) => void;
};

const PREVIEW_LIMIT = 7;

// Home's catalog preview: the most-recent recipes in a single grid, capped, with a "View all →"
// arrow tile as the final cell linking to the full Catalog. Search/sort/filter live on Catalog only.
export default function CatalogPreview({ onSelect }: Props) {
  const { data: recipes = [], isLoading } = useRecipes();

  const recent = useMemo(
    () => [...recipes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, PREVIEW_LIMIT),
    [recipes],
  );

  const countLabel =
    recipes.length === 1 ? '1 recipe in your collection' : `${recipes.length} recipes in your collection`;

  return (
    <section className="bg-bg-page">
      <div className="mx-auto w-full max-w-[1024px] px-6 pb-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold text-text-default">My Recipe Collection</h2>
            <p className="text-sm text-text-muted">{countLabel}</p>
          </div>
          <Link
            to="/catalog"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View all <ArrowIcon />
          </Link>
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm text-text-muted">Loading recipes…</p>
        ) : recipes.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-border-subtle bg-bg-card p-10 text-center">
            <p className="text-base text-text-default">No recipes yet.</p>
            <p className="mt-2 text-sm text-text-muted">
              Use <span className="font-medium text-text-default">+ Add Recipe</span> to import or
              create your first one.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {recent.map((r) => (
              <RecipeCard key={r.id} recipe={r} onClick={() => onSelect(r)} />
            ))}
            <Link
              to="/catalog"
              className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-subtle bg-bg-card text-text-muted transition-colors hover:border-primary hover:text-primary"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                <ArrowIcon size={22} />
              </span>
              <span className="text-sm font-medium">View all</span>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function ArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
