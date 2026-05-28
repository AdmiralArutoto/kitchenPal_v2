import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../lib/api';
import { useRecipes } from '../hooks/useRecipes';
import type { Recipe } from '../types/api';
import AddRecipeChooser from '../components/AddRecipeChooser';
import Button from '../components/Button';
import FilterPopover from '../components/FilterPopover';
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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [addingRecipe, setAddingRecipe] = useState(false);

  const { data: recipes = [], isLoading, error } = useRecipes();
  const errorMessage = error
    ? error instanceof ApiError
      ? error.message
      : 'Failed to load recipes'
    : null;

  // Debounce search input → searchQuery (300ms)
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Available-tag list always derives from the unfiltered cache.
  const allTags = useMemo(
    () => Array.from(new Set(recipes.flatMap((r) => r.tags))).sort((a, b) => a.localeCompare(b)),
    [recipes],
  );

  const visibleRecipes = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = recipes.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (selectedTags.length && !selectedTags.some((t) => r.tags.includes(t))) return false;
      return true;
    });
    return [...filtered].sort((a, b) => compareRecipes(a, b, sort));
  }, [recipes, searchQuery, selectedTags, sort]);

  // Keep the open modal in sync with cache updates (e.g., AI modify approve).
  useEffect(() => {
    if (!selectedRecipe) return;
    const fresh = recipes.find((r) => r.id === selectedRecipe.id);
    if (!fresh) {
      setSelectedRecipe(null);
    } else if (fresh !== selectedRecipe) {
      setSelectedRecipe(fresh);
    }
  }, [recipes, selectedRecipe]);

  const hasSearch = searchQuery.length > 0;
  const hasFilter = selectedTags.length > 0;
  const total = visibleRecipes.length;
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
          <FilterPopover
            value={selectedTags}
            onChange={setSelectedTags}
            availableTags={allTags}
          />
        </div>
      </div>

      {/* Error */}
      {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}

      {/* Grid / empty / loading */}
      {isLoading ? (
        <p className="text-sm text-text-muted">Loading recipes…</p>
      ) : visibleRecipes.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-card p-12 text-center">
          <p className="text-base text-text-default">
            {hasSearch || hasFilter ? 'No recipes match your search.' : 'No recipes yet.'}
          </p>
          <p className="mt-2 text-sm text-text-muted">
            {hasSearch || hasFilter
              ? 'Try a different search or clear filters to see all recipes.'
              : 'Generate one from Home or click Add Recipe.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleRecipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} onClick={() => setSelectedRecipe(r)} />
          ))}
        </div>
      )}

      {/* Recipe modal */}
      {selectedRecipe && (
        <RecipeModal
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
          onTagClick={(tag) => {
            setSelectedTags([tag]);
            setSearchInput('');
            setSelectedRecipe(null);
          }}
        />
      )}

      {/* Add Recipe — intake chooser (Import / Create / Generate) */}
      {addingRecipe && <AddRecipeChooser onClose={() => setAddingRecipe(false)} />}
    </div>
  );
}

function compareRecipes(a: Recipe, b: Recipe, sort: SortValue): number {
  switch (sort) {
    case 'newest':
      return b.createdAt.localeCompare(a.createdAt);
    case 'oldest':
      return a.createdAt.localeCompare(b.createdAt);
    case 'name_asc':
      return a.name.localeCompare(b.name);
    case 'name_desc':
      return b.name.localeCompare(a.name);
  }
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
