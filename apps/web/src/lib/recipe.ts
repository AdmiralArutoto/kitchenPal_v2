import type { Recipe, RecipeSource } from '../types/api';

export type RecipeBody = {
  name: string;
  description: string | null;
  ingredients: Recipe['ingredients'];
  steps: string[];
  tags: string[];
  cookingTime: number | null;
  servings: number | null;
  emoji: string | null;
  imageUrl?: string | null;
  source: RecipeSource;
};

export function toRecipeBody(recipe: Recipe): RecipeBody {
  return {
    name: recipe.name,
    description: recipe.description,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    tags: recipe.tags,
    cookingTime: recipe.cookingTime,
    servings: recipe.servings,
    emoji: recipe.emoji,
    source: recipe.source,
  };
}
