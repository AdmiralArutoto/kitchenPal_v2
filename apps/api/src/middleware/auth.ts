import type { RequestHandler } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { prisma } from '../lib/prisma.js';
import { HttpError } from './errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

export const authMiddleware: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new HttpError(401, 'Missing or malformed Authorization header');
    }
    const token = header.slice('Bearer '.length);

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      throw new HttpError(401, 'Invalid or expired token');
    }
    const userId = data.user.id;

    await prisma.profile.upsert({
      where: { id: userId },
      create: { id: userId, preferences: [] },
      update: {},
    });

    req.userId = userId;
    next();
  } catch (err) {
    next(err);
  }
};
