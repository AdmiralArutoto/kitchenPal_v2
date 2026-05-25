import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    storage: {
      from: vi.fn(),
    },
  },
}));

const { supabaseAdmin } = await import('../lib/supabase.js');
const { buildKey, keyFromUrl, uploadImage, deleteImage } = await import('../lib/storage.js');

const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const recipeId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('buildKey', () => {
  it('picks extension from contentType', () => {
    expect(buildKey(userId, recipeId, 'image/jpeg')).toMatch(
      new RegExp(`^${userId}/${recipeId}-[0-9a-f-]+\\.jpg$`),
    );
    expect(buildKey(userId, recipeId, 'image/png')).toMatch(/\.png$/);
    expect(buildKey(userId, recipeId, 'image/webp')).toMatch(/\.webp$/);
  });

  it('falls back to png for unknown mime', () => {
    expect(buildKey(userId, recipeId, 'application/octet-stream')).toMatch(/\.png$/);
  });

  it('emits a fresh uuid each call', () => {
    expect(buildKey(userId, recipeId, 'image/png')).not.toBe(
      buildKey(userId, recipeId, 'image/png'),
    );
  });
});

describe('keyFromUrl', () => {
  it('extracts key from a Supabase public URL', () => {
    expect(
      keyFromUrl(
        'https://abc.supabase.co/storage/v1/object/public/recipe-images/u/r-uuid.png',
      ),
    ).toBe('u/r-uuid.png');
  });

  it('returns null for unrelated URLs', () => {
    expect(keyFromUrl('https://example.com/some/image.png')).toBeNull();
    expect(keyFromUrl('https://abc.supabase.co/storage/v1/object/public/other/x.png')).toBeNull();
  });
});

describe('uploadImage', () => {
  const upload = vi.fn();
  const getPublicUrl = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    (supabaseAdmin.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
      upload,
      getPublicUrl,
    });
  });

  it('returns the public URL on success', async () => {
    upload.mockResolvedValueOnce({ error: null });
    getPublicUrl.mockReturnValueOnce({ data: { publicUrl: 'https://x/key.png' } });

    const url = await uploadImage(Buffer.from('x'), 'image/png', 'u/r.png');
    expect(url).toBe('https://x/key.png');
    expect(upload).toHaveBeenCalledWith('u/r.png', expect.any(Buffer), {
      contentType: 'image/png',
      upsert: false,
    });
  });

  it('throws HttpError on upload failure', async () => {
    upload.mockResolvedValueOnce({ error: { message: 'quota exceeded' } });
    await expect(uploadImage(Buffer.from('x'), 'image/png', 'k')).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining('quota exceeded'),
    });
  });
});

describe('deleteImage', () => {
  const remove = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    (supabaseAdmin.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({ remove });
  });

  it('ignores not-found errors', async () => {
    remove.mockResolvedValueOnce({ error: { message: 'Object not found' } });
    await expect(deleteImage('k')).resolves.toBeUndefined();
  });

  it('throws on other errors', async () => {
    remove.mockResolvedValueOnce({ error: { message: 'permission denied' } });
    await expect(deleteImage('k')).rejects.toMatchObject({ status: 500 });
  });

  it('succeeds when no error', async () => {
    remove.mockResolvedValueOnce({ error: null });
    await expect(deleteImage('k')).resolves.toBeUndefined();
  });
});
