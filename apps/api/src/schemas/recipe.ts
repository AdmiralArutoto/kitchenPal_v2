import { z } from 'zod';

export const IngredientSchema = z.object({
  name: z.string().min(1),
  amount: z.number(), // SPEC §4: number, never string
  unit: z.string(),
});

export const SourceSchema = z.enum(['manual', 'ai_generated', 'ai_modified', 'daily_rotation']);

export const RecipeBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  ingredients: z.array(IngredientSchema),
  steps: z.array(z.string()),
  tags: z.array(z.string()).default([]),
  cookingTime: z.number().int().nullable().optional(),
  servings: z.number().int().nullable().optional(),
  emoji: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  source: SourceSchema,
});

export const RecipeUpdateSchema = RecipeBodySchema.partial();

export const RecipeListQuerySchema = z.object({
  search: z.string().optional(),
  tags: z.string().optional(), // CSV → split + hasSome
  sort: z.enum(['newest', 'oldest', 'name_asc', 'name_desc']).default('newest'),
});

export type RecipeBody = z.infer<typeof RecipeBodySchema>;
export type RecipeUpdate = z.infer<typeof RecipeUpdateSchema>;
export type Ingredient = z.infer<typeof IngredientSchema>;
