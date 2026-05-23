import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';

const ProfileUpdateSchema = z.object({
  name: z.string().nullable().optional(),
  preferences: z.array(z.string()).optional(),
});

export const profileRouter = Router();
profileRouter.use(authMiddleware);

profileRouter.get('/', async (req, res) => {
  const profile = await prisma.profile.findUnique({ where: { id: req.userId! } });
  if (!profile) throw new HttpError(404, 'Profile not found');
  res.json({
    name: profile.name,
    preferences: profile.preferences,
    email: req.userEmail ?? null,
  });
});

profileRouter.put('/', async (req, res) => {
  const parsed = ProfileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  }
  const updated = await prisma.profile.update({
    where: { id: req.userId! },
    data: parsed.data,
  });
  res.json({
    name: updated.name,
    preferences: updated.preferences,
    email: req.userEmail ?? null,
  });
});
