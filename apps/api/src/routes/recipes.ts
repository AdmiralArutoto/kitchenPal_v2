import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import {
  RecipeBodySchema,
  RecipeUpdateSchema,
  RecipeListQuerySchema,
} from '../schemas/recipe.js';

export const recipesRouter = Router();
recipesRouter.use(authMiddleware);

const SORT_MAP: Record<'newest' | 'oldest' | 'name_asc' | 'name_desc', Prisma.RecipeOrderByWithRelationInput> = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  name_asc: { name: 'asc' },
  name_desc: { name: 'desc' },
};

recipesRouter.get('/', async (req, res) => {
  const q = RecipeListQuerySchema.safeParse(req.query);
  if (!q.success) {
    throw new HttpError(400, q.error.issues.map((i) => i.message).join('; '));
  }
  const { search, tags, sort } = q.data;

  const where: Prisma.RecipeWhereInput = { userId: req.userId! };
  if (search) where.name = { contains: search, mode: 'insensitive' };
  if (tags) {
    const list = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (list.length) where.tags = { hasSome: list };
  }

  const recipes = await prisma.recipe.findMany({
    where,
    orderBy: SORT_MAP[sort],
  });
  res.json(recipes);
});

recipesRouter.get('/:id', async (req, res) => {
  const recipe = await prisma.recipe.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!recipe) throw new HttpError(404, 'Recipe not found');
  res.json(recipe);
});

recipesRouter.post('/', async (req, res) => {
  const parsed = RecipeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  }
  const created = await prisma.recipe.create({
    data: { ...parsed.data, userId: req.userId! },
  });
  res.status(201).json(created);
});

recipesRouter.put('/:id', async (req, res) => {
  const parsed = RecipeUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  }
  const existing = await prisma.recipe.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    select: { id: true },
  });
  if (!existing) throw new HttpError(404, 'Recipe not found');
  const updated = await prisma.recipe.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  res.json(updated);
});

recipesRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.recipe.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    select: { id: true },
  });
  if (!existing) throw new HttpError(404, 'Recipe not found');
  await prisma.recipe.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
