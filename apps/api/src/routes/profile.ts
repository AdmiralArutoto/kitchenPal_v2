import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { buildAvatarKey, deleteImage, keyFromUrl, uploadImage } from '../lib/storage.js';

const ProfileUpdateSchema = z.object({
  name: z.string().nullable().optional(),
  preferences: z.array(z.string()).optional(),
});

const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.has(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'Image must be png, jpeg, or webp'));
  },
});

function withMulterErrors(mw: import('express').RequestHandler): import('express').RequestHandler {
  return (req, res, next) => {
    mw(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) next(new HttpError(400, err.message));
      else next(err);
    });
  };
}

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

// Upload an avatar image → returns its public URL. The URL is persisted client-side into Supabase
// auth user_metadata (so it rides in the session, no DB column needed). Optionally deletes the
// caller's previous avatar file (passed as a `previous` form field) to avoid orphaned objects.
profileRouter.post('/avatar', withMulterErrors(avatarUpload.single('file')), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded');

  const key = buildAvatarKey(req.userId!, req.file.mimetype);
  const url = await uploadImage(req.file.buffer, req.file.mimetype, key);

  const previous = typeof req.body.previous === 'string' ? req.body.previous : null;
  if (previous) {
    const prevKey = keyFromUrl(previous);
    if (prevKey) await deleteImage(prevKey).catch(() => {});
  }

  res.json({ avatarUrl: url });
});
