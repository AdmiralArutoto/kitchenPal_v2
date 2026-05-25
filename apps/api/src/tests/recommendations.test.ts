import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    profile: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    dailyBatch: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('../lib/themealdb.js', () => ({
  fetchRandomMeal: vi.fn(),
}));

// Note: callOpenAIJson is used by the route — mock the lib export.
vi.mock('../lib/openai.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/openai.js')>('../lib/openai.js');
  return {
    ...actual,
    callOpenAIJson: vi.fn(),
  };
});

vi.mock('../lib/image-provider.js', () => ({
  imageProvider: { generate: vi.fn() },
}));

vi.mock('../lib/storage.js', () => ({
  uploadImage: vi.fn(),
  buildDailyBatchKey: vi.fn(),
}));

const { supabaseAdmin } = await import('../lib/supabase.js');
const { prisma } = await import('../lib/prisma.js');
const themealdb = await import('../lib/themealdb.js');
const openaiLib = await import('../lib/openai.js');
const { imageProvider } = await import('../lib/image-provider.js');
const storage = await import('../lib/storage.js');
const { createApp } = await import('../app.js');

const getUserMock = supabaseAdmin.auth.getUser as ReturnType<typeof vi.fn>;
const profileUpsertMock = prisma.profile.upsert as ReturnType<typeof vi.fn>;
const profileFindUniqueMock = prisma.profile.findUnique as ReturnType<typeof vi.fn>;
const batchFindUniqueMock = prisma.dailyBatch.findUnique as ReturnType<typeof vi.fn>;
const batchFindUniqueOrThrowMock = prisma.dailyBatch.findUniqueOrThrow as ReturnType<typeof vi.fn>;
const batchCreateMock = prisma.dailyBatch.create as ReturnType<typeof vi.fn>;
const fetchRandomMealMock = themealdb.fetchRandomMeal as ReturnType<typeof vi.fn>;
const callOpenAIJsonMock = openaiLib.callOpenAIJson as ReturnType<typeof vi.fn>;
const generateImageMock = imageProvider.generate as ReturnType<typeof vi.fn>;
const uploadImageMock = storage.uploadImage as ReturnType<typeof vi.fn>;
const buildDailyBatchKeyMock = storage.buildDailyBatchKey as ReturnType<typeof vi.fn>;

function defaultBuildKey() {
  buildDailyBatchKeyMock.mockImplementation(
    (uid: string, date: string, slot: number) => `daily-batches/${uid}/${date}-${slot}-uuid.png`,
  );
}

const userId = '33333333-3333-3333-3333-333333333333';
const email = 'arthur@example.com';
const today = new Date().toISOString().split('T')[0]!;

function authedGet(path: string) {
  getUserMock.mockResolvedValueOnce({ data: { user: { id: userId, email } }, error: null });
  profileUpsertMock.mockResolvedValueOnce({ id: userId });
  return request(createApp()).get(path).set('Authorization', 'Bearer t');
}

const sampleRecipe = {
  name: 'Test Pasta',
  description: 'A simple pasta',
  ingredients: [{ name: 'pasta', amount: 200, unit: 'g' }],
  steps: ['Boil', 'Drain'],
  tags: ['italian', 'quick'],
  cooking_time: 15,
  servings: 2,
  emoji: '🍝',
};

describe('GET /api/recommendations — missing auth', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401', async () => {
    const res = await request(createApp()).get('/api/recommendations');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/recommendations — cache hit', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns existing batch without calling OpenAI / TheMealDB', async () => {
    const cachedRecipes = [{ name: 'Cached', imageUrl: 'https://x/c.png' }];
    batchFindUniqueMock.mockResolvedValueOnce({
      id: 'b1',
      userId,
      batchDate: today,
      recipes: cachedRecipes,
      createdAt: new Date(),
    });

    const res = await authedGet('/api/recommendations');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ batchDate: today, recipes: cachedRecipes });
    expect(fetchRandomMealMock).not.toHaveBeenCalled();
    expect(callOpenAIJsonMock).not.toHaveBeenCalled();
    expect(generateImageMock).not.toHaveBeenCalled();
    expect(batchCreateMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/recommendations — cache miss generates 6-slot batch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    defaultBuildKey();
  });

  it('fetches 6 meals, normalizes, generates 6 images, persists, returns', async () => {
    batchFindUniqueMock.mockResolvedValueOnce(null);
    profileFindUniqueMock.mockResolvedValueOnce({ preferences: [] });

    fetchRandomMealMock.mockResolvedValue({ idMeal: 'm', strMeal: 'Test' });
    callOpenAIJsonMock.mockResolvedValue(sampleRecipe);
    generateImageMock.mockResolvedValue({
      bytes: Buffer.from('fake-png'),
      contentType: 'image/png',
    });
    uploadImageMock.mockImplementation(async (_b, _ct, key: string) => `https://x/${key}`);

    batchCreateMock.mockImplementation(async ({ data }: { data: { recipes: unknown[] } }) => ({
      id: 'b1',
      userId,
      batchDate: today,
      recipes: data.recipes,
      createdAt: new Date(),
    }));

    const res = await authedGet('/api/recommendations');

    expect(res.status).toBe(200);
    expect(res.body.batchDate).toBe(today);
    expect(res.body.recipes).toHaveLength(6);
    expect(fetchRandomMealMock).toHaveBeenCalledTimes(6);
    expect(callOpenAIJsonMock).toHaveBeenCalledTimes(6);
    expect(generateImageMock).toHaveBeenCalledTimes(6);
    expect(uploadImageMock).toHaveBeenCalledTimes(6);

    // Each slot has snake_case → camelCase conversion + imageUrl populated.
    for (const r of res.body.recipes) {
      expect(r).toMatchObject({
        name: 'Test Pasta',
        cookingTime: 15,
        imageUrl: expect.stringContaining('daily-batches/'),
      });
    }
  });
});

describe('GET /api/recommendations — dietary skip + retry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    defaultBuildKey();
  });

  it('re-rolls a slot when the meal is skipped', async () => {
    batchFindUniqueMock.mockResolvedValueOnce(null);
    profileFindUniqueMock.mockResolvedValueOnce({ preferences: ['vegan'] });

    fetchRandomMealMock.mockResolvedValue({ idMeal: 'm', strMeal: 'X' });

    // Slot 0 skips once, then succeeds. Other 5 slots succeed immediately.
    // Total normalize calls = 6 (one per slot) + 1 retry = 7.
    let normalizeCall = 0;
    callOpenAIJsonMock.mockImplementation(async () => {
      normalizeCall++;
      if (normalizeCall === 1) return { skip: true, reason: 'contains chicken' };
      return sampleRecipe;
    });

    generateImageMock.mockResolvedValue({
      bytes: Buffer.from('fake-png'),
      contentType: 'image/png',
    });
    uploadImageMock.mockResolvedValue('https://x/k.png');
    batchCreateMock.mockImplementation(async ({ data }: { data: { recipes: unknown[] } }) => ({
      id: 'b1',
      userId,
      batchDate: today,
      recipes: data.recipes,
      createdAt: new Date(),
    }));

    const res = await authedGet('/api/recommendations');

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(6);
    expect(callOpenAIJsonMock).toHaveBeenCalledTimes(7); // 6 + 1 retry
  });
});

describe('GET /api/recommendations — image gen failure', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    defaultBuildKey();
  });

  it('returns recipe with imageUrl=null when image gen throws', async () => {
    batchFindUniqueMock.mockResolvedValueOnce(null);
    profileFindUniqueMock.mockResolvedValueOnce({ preferences: [] });

    fetchRandomMealMock.mockResolvedValue({ idMeal: 'm', strMeal: 'X' });
    callOpenAIJsonMock.mockResolvedValue(sampleRecipe);

    // Slot 0 image fails, the other 5 succeed.
    let imageCall = 0;
    generateImageMock.mockImplementation(async () => {
      imageCall++;
      if (imageCall === 1) throw new Error('rate limited');
      return { bytes: Buffer.from('p'), contentType: 'image/png' };
    });
    uploadImageMock.mockResolvedValue('https://x/k.png');
    batchCreateMock.mockImplementation(async ({ data }: { data: { recipes: unknown[] } }) => ({
      id: 'b1',
      userId,
      batchDate: today,
      recipes: data.recipes,
      createdAt: new Date(),
    }));

    const res = await authedGet('/api/recommendations');

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(6);
    const failedSlot = (res.body.recipes as Array<{ imageUrl: string | null }>).filter(
      (r) => r.imageUrl === null,
    );
    expect(failedSlot).toHaveLength(1);
  });
});

describe('GET /api/recommendations — race on create (P2002)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    defaultBuildKey();
  });

  it('re-reads existing batch on unique-constraint violation', async () => {
    batchFindUniqueMock.mockResolvedValueOnce(null);
    profileFindUniqueMock.mockResolvedValueOnce({ preferences: [] });

    fetchRandomMealMock.mockResolvedValue({ idMeal: 'm', strMeal: 'X' });
    callOpenAIJsonMock.mockResolvedValue(sampleRecipe);
    generateImageMock.mockResolvedValue({ bytes: Buffer.from('p'), contentType: 'image/png' });
    uploadImageMock.mockResolvedValue('https://x/k.png');

    // Simulate concurrent insert: create throws P2002, then findUniqueOrThrow returns the winning row.
    const winningRecipes = [{ name: 'Winner', imageUrl: 'https://x/w.png' }];
    batchCreateMock.mockRejectedValueOnce({ code: 'P2002' });
    batchFindUniqueOrThrowMock.mockResolvedValueOnce({
      id: 'b1',
      userId,
      batchDate: today,
      recipes: winningRecipes,
      createdAt: new Date(),
    });

    const res = await authedGet('/api/recommendations');

    expect(res.status).toBe(200);
    expect(res.body.recipes).toEqual(winningRecipes);
  });
});
