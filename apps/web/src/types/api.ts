// Hand-mirrored from backend Zod schemas in apps/api/src/schemas/.
// Keep in sync when backend schemas change.

export type RecipeSource = 'manual' | 'ai_generated' | 'ai_modified';

export interface Ingredient {
  name: string;
  amount: number;
  unit: string;
}

export interface ProfileResponse {
  name: string | null;
  preferences: string[];
  email: string | null;
}

export interface Recipe {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  cookingTime: number | null;
  servings: number | null;
  emoji: string | null;
  imageUrl: string | null;
  source: RecipeSource;
  createdAt: string;
  updatedAt: string;
}

export interface Draft {
  title: string;
  description: string;
  keyIngredients: string[];
  estimatedTime: number;
}

// AI-route response shape from generate-full / modify (snake_case to match backend Zod schema).
// Transform to camelCase before POST /api/recipes.
export interface FullRecipeResponse {
  name: string;
  description: string;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  cooking_time: number;
  servings: number;
  emoji: string;
}
