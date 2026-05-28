import { z } from 'zod';
import { IngredientSchema } from './recipe.js';

// Request bodies
export const ImportUrlRequestSchema = z.object({
  url: z.string().min(1),
});

export const ImportTextRequestSchema = z.object({
  text: z.string().min(1),
  source_url: z.string().nullable().optional(),
  source_platform: z.string().nullable().optional(),
  source_creator: z.string().nullable().optional(),
});

// Extracted draft (snake_case cooking_time, matching the AI-route contract). Ingredient amount is
// always a number (0 when a quantity is implied but unstated — descriptor goes in `unit`), so the
// draft is directly compatible with the save path (POST /api/recipes) and RecipeEditForm.
export const ImportDraftSchema = z.object({
  name: z.string(),
  description: z.string(),
  ingredients: z.array(IngredientSchema),
  steps: z.array(z.string()),
  tags: z.array(z.string()),
  cooking_time: z.number().nullable(),
  servings: z.number().nullable(),
  emoji: z.string(),
});

// LLM extraction returns either a draft or a sentinel when no recipe content is present.
export const ExtractResultSchema = z.union([
  ImportDraftSchema,
  z.object({ empty: z.literal(true) }),
]);

// LLM ingredient-string parser response (used as the regex fallback in ingredients.ts).
export const ParsedIngredientsSchema = z.object({
  ingredients: z.array(IngredientSchema),
});

// Final response from both import routes.
export type ImportResult = {
  draft: z.infer<typeof ImportDraftSchema>;
  source_url: string | null;
  source_platform: string | null;
  source_creator: string | null;
};

export type ImportDraft = z.infer<typeof ImportDraftSchema>;
export type ExtractResult = z.infer<typeof ExtractResultSchema>;
