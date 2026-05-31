import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from './supabase.js';
import { HttpError } from '../middleware/errors.js';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'recipe-images';
const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`;

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function buildKey(userId: string, recipeId: string, contentType: string): string {
  const ext = EXT_BY_MIME[contentType] ?? 'png';
  return `${userId}/${recipeId}-${randomUUID()}.${ext}`;
}

export function buildDailyBatchKey(
  userId: string,
  batchDate: string,
  slot: number,
  contentType: string,
): string {
  const ext = EXT_BY_MIME[contentType] ?? 'png';
  return `daily-batches/${userId}/${batchDate}-${slot}-${randomUUID()}.${ext}`;
}

export function buildAvatarKey(userId: string, contentType: string): string {
  const ext = EXT_BY_MIME[contentType] ?? 'png';
  // Unguessable key per upload (like recipe images) so re-uploads get a fresh URL — no CDN staleness.
  return `avatars/${userId}-${randomUUID()}.${ext}`;
}

export async function uploadImage(
  buffer: Buffer,
  contentType: string,
  key: string,
): Promise<string> {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(key, buffer, { contentType, upsert: false });
  if (error) throw new HttpError(500, `Storage upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

export async function deleteImage(key: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([key]);
  // Idempotent: missing-object is not an error worth surfacing.
  if (error && !/not.?found/i.test(error.message)) {
    throw new HttpError(500, `Storage delete failed: ${error.message}`);
  }
}

export function keyFromUrl(url: string): string | null {
  const idx = url.indexOf(PUBLIC_PREFIX);
  if (idx === -1) return null;
  return url.slice(idx + PUBLIC_PREFIX.length) || null;
}
