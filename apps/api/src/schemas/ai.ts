import { z } from 'zod';
import { IngredientSchema, RecipeBodySchema } from './recipe.js';

// Request bodies
export const GenerateDraftsRequestSchema = z.object({
  prompt: z.string().min(1),
});

export const DraftSchema = z.object({
  title: z.string(),
  description: z.string(),
  keyIngredients: z.array(z.string()),
  estimatedTime: z.number(),
});

export const GenerateFullRequestSchema = z.object({
  input: z.union([DraftSchema, RecipeBodySchema.partial()]),
  comment: z.string().optional(),
});

export const ModifyRequestSchema = z.object({
  recipe: RecipeBodySchema.partial(),
  comment: z.string().min(1),
});

// AI response shapes
export const DraftsResponseSchema = z.object({
  drafts: z.array(DraftSchema).length(3),
});

export const FullRecipeResponseSchema = z.object({
  name: z.string(),
  description: z.string(),
  ingredients: z.array(IngredientSchema),
  steps: z.array(z.string()),
  tags: z.array(z.string()),
  cooking_time: z.number(),
  servings: z.number(),
  emoji: z.string(),
});

export type Draft = z.infer<typeof DraftSchema>;
export type FullRecipeResponse = z.infer<typeof FullRecipeResponseSchema>;
