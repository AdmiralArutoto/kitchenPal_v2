import { Router, type Request } from 'express';
import multer from 'multer';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import {
  RecipeBodySchema,
  RecipeUpdateSchema,
  RecipeListQuerySchema,
} from '../schemas/recipe.js';
import { buildKey, deleteImage, keyFromUrl, uploadImage } from '../lib/storage.js';
import { imageProvider } from '../lib/image-provider.js';
import { buildImagePrompt } from '../lib/openai.js';

export const recipesRouter = Router();
recipesRouter.use(authMiddleware);

const SORT_MAP: Record<'newest' | 'oldest' | 'name_asc' | 'name_desc', Prisma.RecipeOrderByWithRelationInput> = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  name_asc: { name: 'asc' },
  name_desc: { name: 'desc' },
};

const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  // 4MB — stays under Vercel's ~4.5MB serverless request-body cap.
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.has(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'Image must be png, jpeg, or webp'));
  },
});

// Maps multer's own LIMIT_* errors into 400 HttpError so the user sees a clear message.
function withMulterErrors(mw: import('express').RequestHandler): import('express').RequestHandler {
  return (req, res, next) => {
    mw(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) next(new HttpError(400, err.message));
      else next(err);
    });
  };
}

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
    select: { id: true, imageUrl: true },
  });
  if (!existing) throw new HttpError(404, 'Recipe not found');
  await prisma.recipe.delete({ where: { id: req.params.id } });

  if (existing.imageUrl) {
    const key = keyFromUrl(existing.imageUrl);
    if (key) {
      try {
        await deleteImage(key);
      } catch (err) {
        req.log.warn({ err, key }, 'failed to delete image after recipe delete');
      }
    }
  }
  res.status(204).end();
});

// ──────────────── image sub-routes ────────────────

// Find the recipe, ensure ownership; return id + current imageUrl for cleanup.
async function ownedRecipe(req: Request) {
  const id = (req.params as Record<string, string>).id;
  const existing = await prisma.recipe.findFirst({
    where: { id, userId: req.userId! },
    select: { id: true, name: true, description: true, tags: true, imageUrl: true },
  });
  if (!existing) throw new HttpError(404, 'Recipe not found');
  return existing;
}

async function deleteOldImage(req: Request, oldUrl: string | null) {
  if (!oldUrl) return;
  const key = keyFromUrl(oldUrl);
  if (!key) return;
  try {
    await deleteImage(key);
  } catch (err) {
    req.log.warn({ err, key }, 'failed to delete previous image');
  }
}

recipesRouter.post('/:id/image/generate', async (req, res) => {
  const existing = await ownedRecipe(req);
  const prompt = buildImagePrompt({
    name: existing.name,
    description: existing.description,
    tags: existing.tags,
  });

  const { bytes, contentType } = await imageProvider.generate(prompt);
  const key = buildKey(req.userId!, existing.id, contentType);
  const url = await uploadImage(bytes, contentType, key);

  const updated = await prisma.recipe.update({
    where: { id: existing.id },
    data: { imageUrl: url },
  });

  // Best-effort delete of the prior image — never block the response on this.
  await deleteOldImage(req, existing.imageUrl);

  res.json(updated);
});

recipesRouter.post('/:id/image/upload', withMulterErrors(upload.single('file')), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Missing file');
  const existing = await ownedRecipe(req);

  const key = buildKey(req.userId!, existing.id, req.file.mimetype);
  const url = await uploadImage(req.file.buffer, req.file.mimetype, key);

  const updated = await prisma.recipe.update({
    where: { id: existing.id },
    data: { imageUrl: url },
  });

  await deleteOldImage(req, existing.imageUrl);

  res.json(updated);
});

recipesRouter.delete('/:id/image', async (req, res) => {
  const existing = await ownedRecipe(req);
  await deleteOldImage(req, existing.imageUrl);

  const updated = await prisma.recipe.update({
    where: { id: existing.id },
    data: { imageUrl: null },
  });
  res.json(updated);
});
