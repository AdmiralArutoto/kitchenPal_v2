import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() } },
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    profile: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../lib/openai.js', () => ({
  callOpenAIJson: vi.fn(),
  appendPreferences: (prompt: string, prefs: string[]) =>
    prefs.length ? `${prompt}\nUser dietary preferences: ${prefs.join(', ')}` : prompt,
  MODEL_DRAFTS: 'gpt-4o-mini',
  MODEL_FULL: 'gpt-4o',
  DRAFTS_SYSTEM_PROMPT: '<drafts>',
  FULL_SYSTEM_PROMPT: '<full>',
  MODIFY_SYSTEM_PROMPT: '<modify>',
}));

const { supabaseAdmin } = await import('../lib/supabase.js');
const { prisma } = await import('../lib/prisma.js');
const { callOpenAIJson } = await import('../lib/openai.js');
const { HttpError } = await import('../middleware/errors.js');
const { createApp } = await import('../app.js');

const getUserMock = supabaseAdmin.auth.getUser as ReturnType<typeof vi.fn>;
const upsertMock = prisma.profile.upsert as ReturnType<typeof vi.fn>;
const findUniqueMock = prisma.profile.findUnique as ReturnType<typeof vi.fn>;
const callOpenAIJsonMock = callOpenAIJson as ReturnType<typeof vi.fn>;

const userId = '55555555-5555-5555-5555-555555555555';
const email = 'arthur@example.com';

type Method = 'get' | 'post' | 'put' | 'delete';

function authed(method: Method, path: string, prefs: string[] = []) {
  getUserMock.mockResolvedValueOnce({ data: { user: { id: userId, email } }, error: null });
  upsertMock.mockResolvedValueOnce({ id: userId });
  findUniqueMock.mockResolvedValueOnce({ preferences: prefs });
  return request(createApp())[method](path).set('Authorization', 'Bearer t');
}

const draftsResponse = {
  drafts: [
    { title: 'A', description: 'a', keyIngredients: ['x'], estimatedTime: 10 },
    { title: 'B', description: 'b', keyIngredients: ['y'], estimatedTime: 20 },
    { title: 'C', description: 'c', keyIngredients: ['z'], estimatedTime: 30 },
  ],
};

const fullRecipe = {
  name: 'Quick Pasta',
  description: 'delicious',
  ingredients: [{ name: 'pasta', amount: 200, unit: 'g' }],
  steps: ['boil'],
  tags: ['quick'],
  cooking_time: 15,
  servings: 2,
  emoji: '🍝',
};

describe('AI routes — missing auth', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ['/api/ai/generate-drafts', { prompt: 'pasta' }],
    ['/api/ai/generate-full', { input: {} }],
    ['/api/ai/modify', { recipe: {}, comment: 'x' }],
  ])('POST %s → 401 without Authorization header', async (path, body) => {
    const res = await request(createApp()).post(path).send(body);
    expect(res.status).toBe(401);
    expect(callOpenAIJsonMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai/generate-drafts', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns Draft[] and appends preferences when present', async () => {
    callOpenAIJsonMock.mockResolvedValueOnce(draftsResponse);

    const res = await authed('post', '/api/ai/generate-drafts', ['vegan']).send({
      prompt: 'quick pasta',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(draftsResponse.drafts);
    expect(callOpenAIJsonMock).toHaveBeenCalledTimes(1);
    const call = callOpenAIJsonMock.mock.calls[0]![0];
    expect(call.model).toBe('gpt-4o-mini');
    expect(call.userPrompt).toContain('quick pasta');
    expect(call.userPrompt).toContain('User dietary preferences: vegan');
  });

  it('omits the preferences line when user has none', async () => {
    callOpenAIJsonMock.mockResolvedValueOnce(draftsResponse);

    await authed('post', '/api/ai/generate-drafts', []).send({ prompt: 'pasta' });

    const call = callOpenAIJsonMock.mock.calls[0]![0];
    expect(call.userPrompt).not.toContain('User dietary preferences');
  });

  it('400 on missing prompt', async () => {
    const res = await authed('post', '/api/ai/generate-drafts').send({});
    expect(res.status).toBe(400);
    expect(callOpenAIJsonMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai/generate-full', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns full recipe, appends preferences, includes comment when given', async () => {
    callOpenAIJsonMock.mockResolvedValueOnce(fullRecipe);

    const res = await authed('post', '/api/ai/generate-full', ['gluten-free']).send({
      input: { title: 'A', description: 'a', keyIngredients: ['x'], estimatedTime: 10 },
      comment: 'make it spicier',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fullRecipe);
    const call = callOpenAIJsonMock.mock.calls[0]![0];
    expect(call.model).toBe('gpt-4o');
    expect(call.userPrompt).toContain('Refinement comment: make it spicier');
    expect(call.userPrompt).toContain('User dietary preferences: gluten-free');
  });
});

describe('POST /api/ai/modify', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns modified recipe and does NOT append preferences', async () => {
    callOpenAIJsonMock.mockResolvedValueOnce(fullRecipe);

    const res = await authed('post', '/api/ai/modify', ['vegan']).send({
      recipe: { name: 'Pasta', ingredients: [], steps: [], source: 'manual' },
      comment: 'make it dairy-free',
    });

    expect(res.status).toBe(200);
    expect(res.body.recipe).toEqual(fullRecipe);
    // Diff computed server-side: original (empty) → modified adds the pasta ingredient + boil step.
    expect(res.body.diff.ingredients).toEqual([{ status: 'added', new: '200 g pasta' }]);
    expect(res.body.diff.steps).toEqual([
      { status: 'added', tokens: [{ text: 'boil', changed: true }] },
    ]);
    const call = callOpenAIJsonMock.mock.calls[0]![0];
    expect(call.model).toBe('gpt-4o');
    expect(call.userPrompt).toContain('Modification: make it dairy-free');
    expect(call.userPrompt).not.toContain('User dietary preferences');
  });
});

describe('AI routes — error pass-through', () => {
  beforeEach(() => vi.resetAllMocks());

  it('504 when callOpenAIJson throws HttpError(504)', async () => {
    callOpenAIJsonMock.mockRejectedValueOnce(new HttpError(504, 'AI request timed out'));

    const res = await authed('post', '/api/ai/generate-drafts').send({ prompt: 'x' });

    expect(res.status).toBe(504);
    expect(res.body).toEqual({ error: 'AI request timed out' });
  });

  it('500 when callOpenAIJson throws HttpError(500)', async () => {
    callOpenAIJsonMock.mockRejectedValueOnce(new HttpError(500, 'AI returned unexpected shape'));

    const res = await authed('post', '/api/ai/generate-drafts').send({ prompt: 'x' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'AI returned unexpected shape' });
  });
});
