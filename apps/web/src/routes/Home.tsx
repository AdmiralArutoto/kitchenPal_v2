import { useEffect, useState } from 'react';
import { useRecipes } from '../hooks/useRecipes';
import type { Recipe } from '../types/api';
import DailyRotationFeed from '../components/DailyRotationFeed';
import CatalogPreview from '../components/CatalogPreview';
import RecipeModal from '../components/RecipeModal';

// Home is now import-and-store first: today's rotating recommendations on top, a preview of the
// user's collection below. AI generation has moved into the "+ Add Recipe" chooser (GenerateModal).
export default function Home() {
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const { data: recipes = [] } = useRecipes();

  // Keep an open recipe modal in sync with cache updates (e.g., background image generation lands).
  useEffect(() => {
    if (!selectedRecipe) return;
    const fresh = recipes.find((r) => r.id === selectedRecipe.id);
    if (!fresh) setSelectedRecipe(null);
    else if (fresh !== selectedRecipe) setSelectedRecipe(fresh);
  }, [recipes, selectedRecipe]);

  return (
    <>
      <DailyRotationFeed />
      <CatalogPreview onSelect={setSelectedRecipe} />

      {selectedRecipe && (
        <RecipeModal recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} />
      )}
    </>
  );
}
