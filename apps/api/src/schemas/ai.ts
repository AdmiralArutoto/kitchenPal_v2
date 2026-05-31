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

export const NormalizedMealResponseSchema = z.union([
  FullRecipeResponseSchema,
  z.object({ skip: z.literal(true), reason: z.string() }),
]);

// Modify diff — server-computed (see lib/diff.ts), returned alongside the modified recipe so the
// Modify studio can render old→new ingredient changes and word-level step highlights.
export const DiffStatusSchema = z.enum(['unchanged', 'changed', 'added', 'removed']);

export const IngredientDiffSchema = z.object({
  status: DiffStatusSchema,
  old: z.string().optional(),
  new: z.string().optional(),
});

export const StepTokenSchema = z.object({ text: z.string(), changed: z.boolean() });

export const StepDiffSchema = z.object({
  status: DiffStatusSchema,
  old: z.string().optional(),
  tokens: z.array(StepTokenSchema),
});

export const ModifyDiffSchema = z.object({
  ingredients: z.array(IngredientDiffSchema),
  steps: z.array(StepDiffSchema),
});

export const ModifyResponseSchema = z.object({
  recipe: FullRecipeResponseSchema,
  diff: ModifyDiffSchema,
});

export type Draft = z.infer<typeof DraftSchema>;
export type FullRecipeResponse = z.infer<typeof FullRecipeResponseSchema>;
export type NormalizedMealResponse = z.infer<typeof NormalizedMealResponseSchema>;
export type ModifyDiff = z.infer<typeof ModifyDiffSchema>;
export type ModifyResponse = z.infer<typeof ModifyResponseSchema>;
