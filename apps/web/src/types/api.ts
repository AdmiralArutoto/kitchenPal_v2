// Hand-mirrored from backend Zod schemas in apps/api/src/schemas/.
// Keep in sync when backend schemas change.

export type RecipeSource =
  | 'manual'
  | 'ai_generated'
  | 'ai_modified'
  | 'daily_rotation'
  | 'imported';

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
  sourceUrl: string | null;
  sourcePlatform: string | null;
  sourceCreator: string | null;
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

// A recipe in a daily rotation batch — not yet persisted (no id, userId, source, timestamps).
// Backend normalizes from TheMealDB + auto-generates an image during batch creation.
export interface BatchedRecipe {
  name: string;
  description: string;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  cookingTime: number;
  servings: number;
  emoji: string;
  imageUrl: string | null;
}

export interface RecommendationsResponse {
  batchDate: string; // UTC "YYYY-MM-DD"
  recipes: BatchedRecipe[];
}

// Extracted recipe draft from the import routes (snake_case cooking_time, like FullRecipeResponse).
// Not yet persisted — the user reviews/edits, then saves via POST /api/recipes.
export interface ImportDraft {
  name: string;
  description: string;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  cooking_time: number | null;
  servings: number | null;
  emoji: string;
}

// Response from POST /api/import/text and /api/import/image, and the 'done' case below.
export interface ImportResult {
  draft: ImportDraft;
  source_url: string | null;
  source_platform: string | null;
  source_creator: string | null;
}

// Real progress stages — streamed over SSE (website/YouTube) or polled (Instagram/TikTok).
export type ImportStage =
  | 'fetching'
  | 'reading-structured'
  | 'ai-extracting'
  | 'parsing-ingredients'
  | 'fetching-transcript'
  | 'transcribing'
  | 'extracting'
  | 'queued'
  | 'scraping';

// POST /api/import returns either a finished draft (website/YouTube stream the 'done' event) or a
// pending async job (Instagram/TikTok → Apify run the client must poll).
export type ImportStartResult =
  | ({ status: 'done' } & ImportResult)
  | { status: 'pending'; runId: string; datasetId: string; url: string; platform: 'instagram' | 'tiktok' };

// POST /api/import/poll while the Apify run is in progress (carries the current stage) vs finished.
export type ImportPollResult =
  | ({ status: 'done' } & ImportResult)
  | { status: 'pending'; stage: ImportStage };
