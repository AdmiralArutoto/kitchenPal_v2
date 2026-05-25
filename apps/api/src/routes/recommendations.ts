import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import type { Logger } from 'pino';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { fetchRandomMeal } from '../lib/themealdb.js';
import {
  callOpenAIJson,
  buildNormalizePrompt,
  NORMALIZE_MEAL_SYSTEM_PROMPT,
  MODEL_FULL,
  buildImagePrompt,
} from '../lib/openai.js';
import { NormalizedMealResponseSchema, type FullRecipeResponse } from '../schemas/ai.js';
import { imageProvider } from '../lib/image-provider.js';
import { buildDailyBatchKey, uploadImage } from '../lib/storage.js';
import type { Ingredient } from '../schemas/recipe.js';

const SLOT_COUNT = 6;
const MAX_PREFS_RETRIES = 3;

export type BatchedRecipe = {
  name: string;
  description: string;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  cookingTime: number;
  servings: number;
  emoji: string;
  imageUrl: string | null;
};

export const recommendationsRouter = Router();
recommendationsRouter.use(authMiddleware);

async function normalizeMeal(prefs: string[]): Promise<FullRecipeResponse | { skip: true; reason: string }> {
  const meal = await fetchRandomMeal();
  return callOpenAIJson({
    model: MODEL_FULL,
    systemPrompt: NORMALIZE_MEAL_SYSTEM_PROMPT,
    userPrompt: buildNormalizePrompt(meal, prefs),
    schema: NormalizedMealResponseSchema,
  });
}

async function generateSlot(
  slot: number,
  userId: string,
  batchDate: string,
  prefs: string[],
  log: Logger,
): Promise<BatchedRecipe> {
  let recipe: FullRecipeResponse | null = null;

  // Re-roll until we get a non-skipped recipe, up to MAX_PREFS_RETRIES.
  for (let attempt = 0; attempt < MAX_PREFS_RETRIES && !recipe; attempt++) {
    const result = await normalizeMeal(prefs);
    if ('skip' in result) {
      log.info({ slot, attempt, reason: result.reason }, 'meal skipped by prefs filter');
      continue;
    }
    recipe = result;
  }

  // Fallback: if all retries skipped, accept whatever we get next (or fail loudly).
  if (!recipe) {
    log.warn({ slot }, 'all prefs-retries exhausted; accepting next meal regardless');
    const result = await normalizeMeal([]);
    if ('skip' in result) throw new HttpError(500, `Slot ${slot}: could not normalize any meal`);
    recipe = result;
  }

  // Image generation is best-effort: failures yield imageUrl=null, the rest of the batch survives.
  let imageUrl: string | null = null;
  try {
    const { bytes, contentType } = await imageProvider.generate(
      buildImagePrompt({
        name: recipe.name,
        description: recipe.description,
        tags: recipe.tags,
      }),
    );
    const key = buildDailyBatchKey(userId, batchDate, slot, contentType);
    imageUrl = await uploadImage(bytes, contentType, key);
  } catch (err) {
    log.warn({ err, slot }, 'image gen failed for slot — null imageUrl');
  }

  return {
    name: recipe.name,
    description: recipe.description,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    tags: recipe.tags,
    cookingTime: recipe.cooking_time,
    servings: recipe.servings,
    emoji: recipe.emoji,
    imageUrl,
  };
}

recommendationsRouter.get('/', async (req, res) => {
  const today = new Date().toISOString().split('T')[0]!;
  const userId = req.userId!;

  const existing = await prisma.dailyBatch.findUnique({
    where: { userId_batchDate: { userId, batchDate: today } },
  });
  if (existing) {
    res.json({ batchDate: existing.batchDate, recipes: existing.recipes });
    return;
  }

  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  const prefs = profile?.preferences ?? [];

  const recipes = await Promise.all(
    Array.from({ length: SLOT_COUNT }, (_, slot) =>
      generateSlot(slot, userId, today, prefs, req.log),
    ),
  );

  let row;
  try {
    row = await prisma.dailyBatch.create({
      data: {
        userId,
        batchDate: today,
        recipes: recipes as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err: unknown) {
    // P2002 = unique-constraint race: another request beat us, return its batch.
    if (typeof err === 'object' && err && 'code' in err && (err as { code: unknown }).code === 'P2002') {
      row = await prisma.dailyBatch.findUniqueOrThrow({
        where: { userId_batchDate: { userId, batchDate: today } },
      });
    } else {
      throw err;
    }
  }

  res.json({ batchDate: row.batchDate, recipes: row.recipes });
});
