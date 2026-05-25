import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(),
    },
  },
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    profile: {
      upsert: vi.fn(),
    },
    recipe: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('../lib/storage.js', () => ({
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
  keyFromUrl: vi.fn(),
  buildKey: vi.fn(),
}));

vi.mock('../lib/image-provider.js', () => ({
  imageProvider: {
    generate: vi.fn(),
  },
}));

const { supabaseAdmin } = await import('../lib/supabase.js');
const { prisma } = await import('../lib/prisma.js');
const storage = await import('../lib/storage.js');
const { imageProvider } = await import('../lib/image-provider.js');
const { createApp } = await import('../app.js');

const getUserMock = supabaseAdmin.auth.getUser as ReturnType<typeof vi.fn>;
const upsertMock = prisma.profile.upsert as ReturnType<typeof vi.fn>;
const findManyMock = prisma.recipe.findMany as ReturnType<typeof vi.fn>;
const findFirstMock = prisma.recipe.findFirst as ReturnType<typeof vi.fn>;
const createMock = prisma.recipe.create as ReturnType<typeof vi.fn>;
const updateMock = prisma.recipe.update as ReturnType<typeof vi.fn>;
const deleteMock = prisma.recipe.delete as ReturnType<typeof vi.fn>;
const uploadImageMock = storage.uploadImage as ReturnType<typeof vi.fn>;
const deleteImageMock = storage.deleteImage as ReturnType<typeof vi.fn>;
const keyFromUrlMock = storage.keyFromUrl as ReturnType<typeof vi.fn>;
const buildKeyMock = storage.buildKey as ReturnType<typeof vi.fn>;
const generateImageMock = imageProvider.generate as ReturnType<typeof vi.fn>;

const userId = '33333333-3333-3333-3333-333333333333';
const email = 'arthur@example.com';
const recipeId = '44444444-4444-4444-4444-444444444444';

type Method = 'get' | 'post' | 'put' | 'delete';

function authed(method: Method, path: string) {
  getUserMock.mockResolvedValueOnce({ data: { user: { id: userId, email } }, error: null });
  upsertMock.mockResolvedValueOnce({ id: userId });
  return request(createApp())[method](path).set('Authorization', 'Bearer t');
}

const validRecipeBody = {
  name: 'Pasta',
  description: 'Quick weeknight pasta',
  ingredients: [
    { name: 'pasta', amount: 200, unit: 'g' },
    { name: 'olive oil', amount: 2, unit: 'tbsp' },
  ],
  steps: ['Boil pasta', 'Toss with oil'],
  tags: ['quick', 'dinner'],
  cookingTime: 15,
  servings: 2,
  emoji: '🍝',
  source: 'manual' as const,
};

describe('recipes routes — missing auth', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ['get', '/api/recipes'],
    ['get', `/api/recipes/${recipeId}`],
    ['post', '/api/recipes'],
    ['put', `/api/recipes/${recipeId}`],
    ['delete', `/api/recipes/${recipeId}`],
    ['post', `/api/recipes/${recipeId}/image/generate`],
    ['post', `/api/recipes/${recipeId}/image/upload`],
    ['delete', `/api/recipes/${recipeId}/image`],
  ] as Array<[Method, string]>)('%s %s → 401 without Authorization header', async (method, path) => {
    const res = await request(createApp())[method](path);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/recipes', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns recipes scoped to userId, sorted newest by default', async () => {
    findManyMock.mockResolvedValueOnce([{ id: recipeId, name: 'Pasta' }]);

    const res = await authed('get', '/api/recipes');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: recipeId, name: 'Pasta' }]);
    expect(findManyMock).toHaveBeenCalledWith({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('honors search + tags (OR) + sort=name_asc', async () => {
    findManyMock.mockResolvedValueOnce([]);

    await authed('get', '/api/recipes?search=past&tags=quick,dinner&sort=name_asc');

    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        userId,
        name: { contains: 'past', mode: 'insensitive' },
        tags: { hasSome: ['quick', 'dinner'] },
      },
      orderBy: { name: 'asc' },
    });
  });

  it('400 on bad sort enum', async () => {
    const res = await authed('get', '/api/recipes?sort=garbage');
    expect(res.status).toBe(400);
    expect(findManyMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/recipes/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns recipe when found and owned', async () => {
    findFirstMock.mockResolvedValueOnce({ id: recipeId, name: 'Pasta' });

    const res = await authed('get', `/api/recipes/${recipeId}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: recipeId, name: 'Pasta' });
    expect(findFirstMock).toHaveBeenCalledWith({ where: { id: recipeId, userId } });
  });

  it('404 when not found / not owned', async () => {
    findFirstMock.mockResolvedValueOnce(null);

    const res = await authed('get', `/api/recipes/${recipeId}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/recipes', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates with userId injected', async () => {
    createMock.mockResolvedValueOnce({ id: recipeId, ...validRecipeBody, userId });

    const res = await authed('post', '/api/recipes').send(validRecipeBody);

    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith({
      data: { ...validRecipeBody, userId },
    });
  });

  it('400 on missing required field', async () => {
    const { name: _omit, ...bodyMissingName } = validRecipeBody;

    const res = await authed('post', '/api/recipes').send(bodyMissingName);

    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('400 when ingredient amount is a string', async () => {
    const bad = {
      ...validRecipeBody,
      ingredients: [{ name: 'pasta', amount: '200', unit: 'g' }],
    };

    const res = await authed('post', '/api/recipes').send(bad);

    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('PUT /api/recipes/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('updates when owned', async () => {
    findFirstMock.mockResolvedValueOnce({ id: recipeId });
    updateMock.mockResolvedValueOnce({ id: recipeId, name: 'Pasta v2' });

    const res = await authed('put', `/api/recipes/${recipeId}`).send({ name: 'Pasta v2' });

    expect(res.status).toBe(200);
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: recipeId, userId },
      select: { id: true },
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: recipeId },
      data: { name: 'Pasta v2' },
    });
  });

  it('404 when not owned', async () => {
    findFirstMock.mockResolvedValueOnce(null);

    const res = await authed('put', `/api/recipes/${recipeId}`).send({ name: 'X' });

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/recipes/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('204 when owned, no image to clean up', async () => {
    findFirstMock.mockResolvedValueOnce({ id: recipeId, imageUrl: null });
    deleteMock.mockResolvedValueOnce({ id: recipeId });

    const res = await authed('delete', `/api/recipes/${recipeId}`);

    expect(res.status).toBe(204);
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: recipeId } });
    expect(deleteImageMock).not.toHaveBeenCalled();
  });

  it('also deletes image when one exists', async () => {
    findFirstMock.mockResolvedValueOnce({
      id: recipeId,
      imageUrl: 'https://x.supabase.co/storage/v1/object/public/recipe-images/u/r-uuid.png',
    });
    deleteMock.mockResolvedValueOnce({ id: recipeId });
    keyFromUrlMock.mockReturnValueOnce('u/r-uuid.png');
    deleteImageMock.mockResolvedValueOnce(undefined);

    const res = await authed('delete', `/api/recipes/${recipeId}`);

    expect(res.status).toBe(204);
    expect(deleteImageMock).toHaveBeenCalledWith('u/r-uuid.png');
  });

  it('404 when not owned', async () => {
    findFirstMock.mockResolvedValueOnce(null);

    const res = await authed('delete', `/api/recipes/${recipeId}`);

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/recipes/:id/image/generate', () => {
  beforeEach(() => vi.resetAllMocks());

  it('generates, uploads, updates, returns recipe', async () => {
    findFirstMock.mockResolvedValueOnce({
      id: recipeId,
      name: 'Pasta',
      description: 'Quick',
      tags: ['quick'],
      imageUrl: null,
    });
    generateImageMock.mockResolvedValueOnce({
      bytes: Buffer.from('fake-png'),
      contentType: 'image/png',
    });
    buildKeyMock.mockReturnValueOnce(`${userId}/${recipeId}-abc.png`);
    uploadImageMock.mockResolvedValueOnce('https://x/storage/v1/object/public/recipe-images/key.png');
    updateMock.mockResolvedValueOnce({
      id: recipeId,
      imageUrl: 'https://x/storage/v1/object/public/recipe-images/key.png',
    });

    const res = await authed('post', `/api/recipes/${recipeId}/image/generate`);

    expect(res.status).toBe(200);
    expect(generateImageMock).toHaveBeenCalledOnce();
    expect(uploadImageMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      'image/png',
      `${userId}/${recipeId}-abc.png`,
    );
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: recipeId },
      data: { imageUrl: 'https://x/storage/v1/object/public/recipe-images/key.png' },
    });
    expect(deleteImageMock).not.toHaveBeenCalled();
  });

  it('deletes previous image after successful upload', async () => {
    findFirstMock.mockResolvedValueOnce({
      id: recipeId,
      name: 'Pasta',
      description: null,
      tags: [],
      imageUrl: 'https://x/storage/v1/object/public/recipe-images/old.png',
    });
    generateImageMock.mockResolvedValueOnce({
      bytes: Buffer.from('fake-png'),
      contentType: 'image/png',
    });
    buildKeyMock.mockReturnValueOnce(`${userId}/${recipeId}-new.png`);
    uploadImageMock.mockResolvedValueOnce('https://x/new.png');
    updateMock.mockResolvedValueOnce({ id: recipeId, imageUrl: 'https://x/new.png' });
    keyFromUrlMock.mockReturnValueOnce('old.png');

    const res = await authed('post', `/api/recipes/${recipeId}/image/generate`);

    expect(res.status).toBe(200);
    expect(deleteImageMock).toHaveBeenCalledWith('old.png');
  });

  it('404 when not owned', async () => {
    findFirstMock.mockResolvedValueOnce(null);

    const res = await authed('post', `/api/recipes/${recipeId}/image/generate`);

    expect(res.status).toBe(404);
    expect(generateImageMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/recipes/:id/image/upload', () => {
  beforeEach(() => vi.resetAllMocks());

  it('uploads file and updates recipe', async () => {
    findFirstMock.mockResolvedValueOnce({
      id: recipeId,
      name: 'Pasta',
      description: null,
      tags: [],
      imageUrl: null,
    });
    buildKeyMock.mockReturnValueOnce(`${userId}/${recipeId}-up.png`);
    uploadImageMock.mockResolvedValueOnce('https://x/up.png');
    updateMock.mockResolvedValueOnce({ id: recipeId, imageUrl: 'https://x/up.png' });

    const res = await authed('post', `/api/recipes/${recipeId}/image/upload`).attach(
      'file',
      Buffer.from('fake'),
      { filename: 'test.png', contentType: 'image/png' },
    );

    expect(res.status).toBe(200);
    expect(uploadImageMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      'image/png',
      `${userId}/${recipeId}-up.png`,
    );
  });

  it('400 when file missing', async () => {
    const res = await authed('post', `/api/recipes/${recipeId}/image/upload`);
    expect(res.status).toBe(400);
  });

  it('400 when MIME not allowed', async () => {
    const res = await authed('post', `/api/recipes/${recipeId}/image/upload`).attach(
      'file',
      Buffer.from('fake'),
      { filename: 'doc.pdf', contentType: 'application/pdf' },
    );
    expect(res.status).toBe(400);
    expect(uploadImageMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/recipes/:id/image', () => {
  beforeEach(() => vi.resetAllMocks());

  it('clears imageUrl and deletes object', async () => {
    findFirstMock.mockResolvedValueOnce({
      id: recipeId,
      name: 'Pasta',
      description: null,
      tags: [],
      imageUrl: 'https://x/old.png',
    });
    keyFromUrlMock.mockReturnValueOnce('old.png');
    deleteImageMock.mockResolvedValueOnce(undefined);
    updateMock.mockResolvedValueOnce({ id: recipeId, imageUrl: null });

    const res = await authed('delete', `/api/recipes/${recipeId}/image`);

    expect(res.status).toBe(200);
    expect(deleteImageMock).toHaveBeenCalledWith('old.png');
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: recipeId },
      data: { imageUrl: null },
    });
  });

  it('no-op when already null', async () => {
    findFirstMock.mockResolvedValueOnce({
      id: recipeId,
      name: 'Pasta',
      description: null,
      tags: [],
      imageUrl: null,
    });
    updateMock.mockResolvedValueOnce({ id: recipeId, imageUrl: null });

    const res = await authed('delete', `/api/recipes/${recipeId}/image`);

    expect(res.status).toBe(200);
    expect(deleteImageMock).not.toHaveBeenCalled();
  });

  it('404 when not owned', async () => {
    findFirstMock.mockResolvedValueOnce(null);

    const res = await authed('delete', `/api/recipes/${recipeId}/image`);

    expect(res.status).toBe(404);
  });
});
