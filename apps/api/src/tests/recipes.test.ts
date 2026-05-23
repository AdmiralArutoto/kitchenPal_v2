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

const { supabaseAdmin } = await import('../lib/supabase.js');
const { prisma } = await import('../lib/prisma.js');
const { createApp } = await import('../app.js');

const getUserMock = supabaseAdmin.auth.getUser as ReturnType<typeof vi.fn>;
const upsertMock = prisma.profile.upsert as ReturnType<typeof vi.fn>;
const findManyMock = prisma.recipe.findMany as ReturnType<typeof vi.fn>;
const findFirstMock = prisma.recipe.findFirst as ReturnType<typeof vi.fn>;
const createMock = prisma.recipe.create as ReturnType<typeof vi.fn>;
const updateMock = prisma.recipe.update as ReturnType<typeof vi.fn>;
const deleteMock = prisma.recipe.delete as ReturnType<typeof vi.fn>;

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

  it('204 when owned', async () => {
    findFirstMock.mockResolvedValueOnce({ id: recipeId });
    deleteMock.mockResolvedValueOnce({ id: recipeId });

    const res = await authed('delete', `/api/recipes/${recipeId}`);

    expect(res.status).toBe(204);
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: recipeId } });
  });

  it('404 when not owned', async () => {
    findFirstMock.mockResolvedValueOnce(null);

    const res = await authed('delete', `/api/recipes/${recipeId}`);

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
