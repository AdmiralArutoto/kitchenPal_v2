import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    profile: { upsert: vi.fn() },
  },
}));

// Partial-mock openai: keep prompts/builders real, mock the network call.
vi.mock('../lib/openai.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/openai.js')>('../lib/openai.js');
  return { ...actual, callOpenAIJson: vi.fn(), callOpenAIVisionJson: vi.fn() };
});

const { supabaseAdmin } = await import('../lib/supabase.js');
const { prisma } = await import('../lib/prisma.js');
const openaiLib = await import('../lib/openai.js');
const { classifyUrl } = await import('../lib/import/url.js');
const { parseIngredients } = await import('../lib/import/ingredients.js');
const { createApp } = await import('../app.js');

const getUserMock = supabaseAdmin.auth.getUser as ReturnType<typeof vi.fn>;
const profileUpsertMock = prisma.profile.upsert as ReturnType<typeof vi.fn>;
const callOpenAIJsonMock = openaiLib.callOpenAIJson as ReturnType<typeof vi.fn>;
const callOpenAIVisionJsonMock = openaiLib.callOpenAIVisionJson as ReturnType<typeof vi.fn>;

const userId = '44444444-4444-4444-4444-444444444444';
const email = 'arthur@example.com';

function authedPost(path: string) {
  getUserMock.mockResolvedValueOnce({ data: { user: { id: userId, email } }, error: null });
  profileUpsertMock.mockResolvedValueOnce({ id: userId });
  return request(createApp()).post(path).set('Authorization', 'Bearer t');
}

function mockFetchHtml(html: string, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status, text: async () => html })),
  );
}

function jsonLdHtml(recipe: Record<string, unknown>): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    ...recipe,
  })}</script></head><body></body></html>`;
}

// ──────────────── auth ────────────────

describe('import routes — missing auth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('POST /api/import returns 401', async () => {
    const res = await request(createApp()).post('/api/import').send({ url: 'https://x.com/a' });
    expect(res.status).toBe(401);
  });

  it('POST /api/import/text returns 401', async () => {
    const res = await request(createApp()).post('/api/import/text').send({ text: 'hi' });
    expect(res.status).toBe(401);
  });

  it('POST /api/import/image returns 401', async () => {
    const res = await request(createApp())
      .post('/api/import/image')
      .attach('file', Buffer.from('img'), { filename: 'shot.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });
});

// ──────────────── POST /api/import — website ────────────────

describe('POST /api/import — website JSON-LD', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('maps a schema.org Recipe to a draft and parses ingredients via regex (no LLM)', async () => {
    mockFetchHtml(
      jsonLdHtml({
        name: 'Test Pasta',
        description: 'Yum',
        author: { '@type': 'Person', name: 'Jane Smith' },
        recipeIngredient: ['2 cups flour', '1/2 tsp salt'],
        recipeInstructions: [
          { '@type': 'HowToStep', text: 'Mix' },
          { '@type': 'HowToStep', text: 'Bake' },
        ],
        totalTime: 'PT30M',
        recipeYield: '4 servings',
        recipeCuisine: 'Italian',
        keywords: 'pasta, dinner',
      }),
    );

    const res = await authedPost('/api/import').send({ url: 'https://blog.example.com/pasta' });

    expect(res.status).toBe(200);
    expect(res.body.source_platform).toBe('website');
    expect(res.body.source_creator).toBe('Jane Smith');
    expect(res.body.source_url).toContain('blog.example.com');
    expect(res.body.draft.name).toBe('Test Pasta');
    expect(res.body.draft.steps).toEqual(['Mix', 'Bake']);
    expect(res.body.draft.cooking_time).toBe(30);
    expect(res.body.draft.servings).toBe(4);
    expect(res.body.draft.ingredients).toEqual([
      { name: 'flour', amount: 2, unit: 'cups' },
      { name: 'salt', amount: 0.5, unit: 'tsp' },
    ]);
    expect(res.body.draft.tags).toContain('Italian');
    expect(callOpenAIJsonMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/import — HTML fallback (no JSON-LD)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends cleaned content to the LLM and returns the extracted draft', async () => {
    mockFetchHtml(`<html><body><article>${'A long recipe article. '.repeat(20)}</article></body></html>`);
    callOpenAIJsonMock.mockResolvedValueOnce({
      name: 'Fallback Stew',
      description: 'Hearty',
      ingredients: [{ name: 'beef', amount: 500, unit: 'g' }],
      steps: ['Cook'],
      tags: ['stew'],
      cooking_time: 60,
      servings: 4,
      emoji: '🍲',
    });

    const res = await authedPost('/api/import').send({ url: 'https://nold.example.com/stew' });

    expect(res.status).toBe(200);
    expect(res.body.draft.name).toBe('Fallback Stew');
    expect(res.body.source_platform).toBe('website');
    expect(callOpenAIJsonMock).toHaveBeenCalledTimes(1);
  });

  it('returns 422 when the LLM finds no recipe', async () => {
    mockFetchHtml(`<html><body><article>${'random text '.repeat(40)}</article></body></html>`);
    callOpenAIJsonMock.mockResolvedValueOnce({ empty: true });

    const res = await authedPost('/api/import').send({ url: 'https://nold.example.com/page' });
    expect(res.status).toBe(422);
  });
});

describe('POST /api/import — routing & validation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 422 directing to paste for a video URL (no fetch / no LLM)', async () => {
    const res = await authedPost('/api/import').send({
      url: 'https://www.youtube.com/watch?v=abc123',
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/video/i);
    expect(callOpenAIJsonMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid URL', async () => {
    const res = await authedPost('/api/import').send({ url: 'not a url' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a shortened link', async () => {
    const res = await authedPost('/api/import').send({ url: 'https://bit.ly/abc' });
    expect(res.status).toBe(400);
  });

  it('returns 422 when the page is unreachable', async () => {
    mockFetchHtml('', false, 403);
    const res = await authedPost('/api/import').send({ url: 'https://blocked.example.com/x' });
    expect(res.status).toBe(422);
  });
});

// ──────────────── POST /api/import/text ────────────────

describe('POST /api/import/text', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('extracts from pasted text and echoes the source fields', async () => {
    callOpenAIJsonMock.mockResolvedValueOnce({
      name: 'Pasted Dish',
      description: 'From a caption',
      ingredients: [{ name: 'rice', amount: 1, unit: 'cup' }],
      steps: ['Cook rice'],
      tags: [],
      cooking_time: null,
      servings: null,
      emoji: '🍚',
    });

    const res = await authedPost('/api/import/text').send({
      text: 'some recipe caption',
      source_platform: 'instagram',
      source_creator: '@chef',
    });

    expect(res.status).toBe(200);
    expect(res.body.draft.name).toBe('Pasted Dish');
    expect(res.body.source_platform).toBe('instagram');
    expect(res.body.source_creator).toBe('@chef');
    expect(res.body.source_url).toBeNull();
  });

  it('returns 422 when no recipe is found', async () => {
    callOpenAIJsonMock.mockResolvedValueOnce({ empty: true });
    const res = await authedPost('/api/import/text').send({ text: 'hello world' });
    expect(res.status).toBe(422);
  });

  it('returns 400 when text is missing', async () => {
    const res = await authedPost('/api/import/text').send({});
    expect(res.status).toBe(400);
  });
});

// ──────────────── POST /api/import/image ────────────────

describe('POST /api/import/image', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('extracts a recipe from an uploaded screenshot + note', async () => {
    callOpenAIVisionJsonMock.mockResolvedValueOnce({
      name: 'Screenshot Salad',
      description: 'From an image',
      ingredients: [{ name: 'lettuce', amount: 1, unit: 'head' }],
      steps: ['Chop', 'Toss'],
      tags: ['salad'],
      cooking_time: null,
      servings: 2,
      emoji: '🥗',
    });

    const res = await authedPost('/api/import/image')
      .field('comment', 'make it vegan')
      .field('source_creator', '@chef')
      .attach('file', Buffer.from('fake-png-bytes'), {
        filename: 'shot.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body.draft.name).toBe('Screenshot Salad');
    expect(res.body.source_creator).toBe('@chef');
    expect(callOpenAIVisionJsonMock).toHaveBeenCalledTimes(1);
  });

  it('returns 422 when the image has no recipe', async () => {
    callOpenAIVisionJsonMock.mockResolvedValueOnce({ empty: true });
    const res = await authedPost('/api/import/image').attach(
      'file',
      Buffer.from('fake-png-bytes'),
      { filename: 'shot.png', contentType: 'image/png' },
    );
    expect(res.status).toBe(422);
  });

  it('returns 400 when no file is attached', async () => {
    const res = await authedPost('/api/import/image').field('comment', 'hi');
    expect(res.status).toBe(400);
    expect(callOpenAIVisionJsonMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-image file', async () => {
    const res = await authedPost('/api/import/image').attach(
      'file',
      Buffer.from('plain text'),
      { filename: 'notes.txt', contentType: 'text/plain' },
    );
    expect(res.status).toBe(400);
    expect(callOpenAIVisionJsonMock).not.toHaveBeenCalled();
  });
});

// ──────────────── unit: classifyUrl ────────────────

describe('classifyUrl', () => {
  it('classifies platforms by host', () => {
    expect(classifyUrl('https://www.youtube.com/watch?v=1').platform).toBe('youtube');
    expect(classifyUrl('https://youtu.be/abc').platform).toBe('youtube');
    expect(classifyUrl('https://www.tiktok.com/@x/video/1').platform).toBe('tiktok');
    expect(classifyUrl('https://www.instagram.com/reel/abc').platform).toBe('instagram');
    expect(classifyUrl('https://smittenkitchen.com/pasta').platform).toBe('website');
  });

  it('strips tracking params and fragments', () => {
    const { url } = classifyUrl('https://blog.com/r?utm_source=ig&igsh=zzz&id=5#frag');
    expect(url).toContain('id=5');
    expect(url).not.toContain('utm_source');
    expect(url).not.toContain('igsh');
    expect(url).not.toContain('#frag');
  });

  it('rejects shorteners and invalid URLs', () => {
    expect(() => classifyUrl('https://t.co/abc')).toThrow();
    expect(() => classifyUrl('not a url')).toThrow();
    expect(() => classifyUrl('ftp://x.com/a')).toThrow();
  });
});

// ──────────────── unit: parseIngredients ────────────────

describe('parseIngredients', () => {
  beforeEach(() => vi.resetAllMocks());

  it('parses common lines with regex (no LLM)', async () => {
    const out = await parseIngredients(['2 cups flour', '1/2 tsp salt', '3 eggs', '1 1/2 cups milk']);
    expect(out).toEqual([
      { name: 'flour', amount: 2, unit: 'cups' },
      { name: 'salt', amount: 0.5, unit: 'tsp' },
      { name: 'eggs', amount: 3, unit: '' },
      { name: 'milk', amount: 1.5, unit: 'cups' },
    ]);
    expect(callOpenAIJsonMock).not.toHaveBeenCalled();
  });

  it('falls back to the LLM for unparseable lines, preserving order', async () => {
    callOpenAIJsonMock.mockResolvedValueOnce({
      ingredients: [{ name: 'salt', amount: 0, unit: 'to taste' }],
    });
    const out = await parseIngredients(['2 cups flour', 'salt to taste']);
    expect(out[0]).toEqual({ name: 'flour', amount: 2, unit: 'cups' });
    expect(out[1]).toEqual({ name: 'salt', amount: 0, unit: 'to taste' });
    expect(callOpenAIJsonMock).toHaveBeenCalledTimes(1);
  });
});
