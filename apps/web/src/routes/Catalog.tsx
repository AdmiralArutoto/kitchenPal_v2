import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import type { Recipe } from '../types/api';
import AddRecipeModal from '../components/AddRecipeModal';
import Button from '../components/Button';
import Input from '../components/Input';
import RecipeCard from '../components/RecipeCard';
import RecipeModal from '../components/RecipeModal';
import SortDropdown from '../components/SortDropdown';

type SortValue = 'newest' | 'oldest' | 'name_asc' | 'name_desc';

const SORT_OPTIONS: ReadonlyArray<{ value: SortValue; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name_asc', label: 'A–Z' },
  { value: 'name_desc', label: 'Z–A' },
];

export default function Catalog() {
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortValue>('newest');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [addingRecipe, setAddingRecipe] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Debounce search input → searchQuery (300ms)
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Fetch on mount + when searchQuery / sort / refreshKey changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    params.set('sort', sort);
    const url = `/api/recipes${params.toString() ? `?${params.toString()}` : ''}`;

    apiFetch<Recipe[]>(url)
      .then((result) => {
        if (!cancelled) {
          setRecipes(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load recipes');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [searchQuery, sort, refreshKey]);

  const hasSearch = searchQuery.length > 0;
  const total = recipes.length;
  const countLabel =
    total === 1 ? '1 recipe in your collection' : `${total} recipes in your collection`;

  return (
    <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-8 px-6 pt-12 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-medium leading-9 text-text-default">
            My Recipe Collection
          </h1>
          <p className="text-base text-text-muted">{countLabel}</p>
        </div>
        <Button type="button" onClick={() => setAddingRecipe(true)}>
          <PlusIcon />
          <span className="ml-2">Add Recipe</span>
        </Button>
      </div>

      {/* Search + Sort + Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-[448px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-placeholder">
            <SearchIcon />
          </span>
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search recipes or tags..."
            className="bg-bg-card pl-10"
          />
        </div>
        <div className="flex gap-2">
          <SortDropdown<SortValue> value={sort} onChange={setSort} options={SORT_OPTIONS} />
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => console.log('Filter clicked')}
          >
            <FilterIcon />
            <span className="ml-2">Filter</span>
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Grid / empty / loading */}
      {loading ? (
        <p className="text-sm text-text-muted">Loading recipes…</p>
      ) : recipes.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-card p-12 text-center">
          <p className="text-base text-text-default">
            {hasSearch ? 'No recipes match your search.' : 'No recipes yet.'}
          </p>
          <p className="mt-2 text-sm text-text-muted">
            {hasSearch
              ? 'Try a different search or clear it to see all recipes.'
              : 'Generate one from Home or click Add Recipe.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} onClick={() => setSelectedRecipe(r)} />
          ))}
        </div>
      )}

      {/* Recipe modal */}
      {selectedRecipe && (
        <RecipeModal
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
          onDeleted={() => {
            setSelectedRecipe(null);
            setRefreshKey((k) => k + 1);
          }}
          onModified={() => {
            setSelectedRecipe(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {/* Add Recipe modal */}
      {addingRecipe && (
        <AddRecipeModal
          onClose={() => setAddingRecipe(false)}
          onCreated={() => {
            setAddingRecipe(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function PlusIcon() {
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function FilterIcon() {
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
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}
