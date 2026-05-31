import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
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

// Mock the Apify client (run lifecycle + dataset). website.ts + supadata.ts stay real (driven by the
// global fetch stub) so the cascade exercises real link/transcript paths.
vi.mock('../lib/apify.js', () => ({
  startRun: vi.fn(),
  getRunStatus: vi.fn(),
  getDatasetItems: vi.fn(),
}));

const { supabaseAdmin } = await import('../lib/supabase.js');
const { prisma } = await import('../lib/prisma.js');
const openaiLib = await import('../lib/openai.js');
const { classifyUrl } = await import('../lib/import/url.js');
const { parseIngredients } = await import('../lib/import/ingredients.js');
const apify = await import('../lib/apify.js');
const social = await import('../lib/import/social.js');
const { createApp } = await import('../app.js');

const getUserMock = supabaseAdmin.auth.getUser as ReturnType<typeof vi.fn>;
const profileUpsertMock = prisma.profile.upsert as ReturnType<typeof vi.fn>;
const callOpenAIJsonMock = openaiLib.callOpenAIJson as ReturnType<typeof vi.fn>;
const callOpenAIVisionJsonMock = openaiLib.callOpenAIVisionJson as ReturnType<typeof vi.fn>;
const startRunMock = apify.startRun as ReturnType<typeof vi.fn>;
const getRunStatusMock = apify.getRunStatus as ReturnType<typeof vi.fn>;
const getDatasetItemsMock = apify.getDatasetItems as ReturnType<typeof vi.fn>;

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

// Stubs global fetch to return the given responses in order (for Supadata sync + 202-poll cases).
function fetchReturning(...responses: Array<{ status: number; body: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    });
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

const videoDraft = {
  name: 'Video Bread',
  description: 'From a clip',
  ingredients: [{ name: 'flour', amount: 2, unit: 'cups' }],
  steps: ['Mix', 'Bake'],
  tags: ['bread'],
  cooking_time: 30,
  servings: 2,
  emoji: '🍞',
};

// ── SSE helpers — website/YouTube import now streams text/event-stream ──
function parseSse(text: string) {
  return (text ?? '').split('\n\n').flatMap((chunk) => {
    let event = 'message';
    const data: string[] = [];
    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    return data.length ? [{ event, data: JSON.parse(data.join('\n')) as Record<string, unknown> }] : [];
  });
}
type Sse = ReturnType<typeof parseSse>;
const sseStages = (e: Sse) => e.filter((x) => x.event === 'progress').map((x) => x.data.stage as string);
const sseDone = (e: Sse) =>
  e.find((x) => x.event === 'done')?.data as
    | {
        draft: { name: string; ingredients: { name: string; amount: number; unit: string }[]; steps: string[]; cooking_time: number | null; servings: number | null; tags: string[] };
        source_platform: string;
        source_creator: string | null;
        source_url: string | null;
      }
    | undefined;
const sseError = (e: Sse) => e.find((x) => x.event === 'error')?.data as { status: number; message: string } | undefined;

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

    const res = await authedPost('/api/import').buffer(true).send({ url: 'https://blog.example.com/pasta' });

    expect(res.status).toBe(200);
    const events = parseSse(res.text);
    expect(sseStages(events)).toEqual(expect.arrayContaining(['fetching', 'reading-structured']));
    const done = sseDone(events)!;
    expect(done.source_platform).toBe('website');
    expect(done.source_creator).toBe('Jane Smith');
    expect(done.source_url).toContain('blog.example.com');
    expect(done.draft.name).toBe('Test Pasta');
    expect(done.draft.steps).toEqual(['Mix', 'Bake']);
    expect(done.draft.cooking_time).toBe(30);
    expect(done.draft.servings).toBe(4);
    expect(done.draft.ingredients).toEqual([
      { name: 'flour', amount: 2, unit: 'cups' },
      { name: 'salt', amount: 0.5, unit: 'tsp' },
    ]);
    expect(done.draft.tags).toContain('Italian');
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

    const res = await authedPost('/api/import').buffer(true).send({ url: 'https://nold.example.com/stew' });

    expect(res.status).toBe(200);
    const events = parseSse(res.text);
    expect(sseStages(events)).toContain('ai-extracting');
    expect(sseDone(events)!.draft.name).toBe('Fallback Stew');
    expect(callOpenAIJsonMock).toHaveBeenCalledTimes(1);
  });

  it('streams an error event (status 422) when the LLM finds no recipe', async () => {
    mockFetchHtml(`<html><body><article>${'random text '.repeat(40)}</article></body></html>`);
    callOpenAIJsonMock.mockResolvedValueOnce({ empty: true });

    const res = await authedPost('/api/import').buffer(true).send({ url: 'https://nold.example.com/page' });
    expect(res.status).toBe(200); // SSE already opened — error carried in the event
    expect(sseError(parseSse(res.text))?.status).toBe(422);
  });
});

describe('POST /api/import — routing & validation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 400 for an invalid URL', async () => {
    const res = await authedPost('/api/import').send({ url: 'not a url' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a shortened link', async () => {
    const res = await authedPost('/api/import').send({ url: 'https://bit.ly/abc' });
    expect(res.status).toBe(400);
  });

  it('streams an error event (422) when the page is unreachable', async () => {
    mockFetchHtml('', false, 403);
    const res = await authedPost('/api/import').buffer(true).send({ url: 'https://blocked.example.com/x' });
    expect(res.status).toBe(200);
    expect(sseError(parseSse(res.text))?.status).toBe(422);
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

// ──────────────── POST /api/import — video (Supadata) ────────────────

describe('POST /api/import — video via Supadata', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    process.env.SUPADATA_API_KEY = 'test-key';
  });
  afterAll(() => {
    delete process.env.SUPADATA_API_KEY;
  });

  it('description holds the recipe → extracts from it, no transcript fetch', async () => {
    // The common Shorts case: recipe is in the description; metadata is the only network call.
    const fetchMock = fetchReturning({
      status: 200,
      body: {
        title: 'Bread Donuts',
        description: 'Recipe:\n1. Cut bread edges\n2. Dip in milk\n3. Fry on medium\n4. Add ganache',
        channel: { name: 'Foodies Corner' },
        transcriptLanguages: [],
      },
    });
    callOpenAIJsonMock.mockResolvedValueOnce(videoDraft);

    const res = await authedPost('/api/import').buffer(true).send({
      url: 'https://www.youtube.com/shorts/abc123',
    });

    expect(res.status).toBe(200);
    const done = sseDone(parseSse(res.text))!;
    expect(done.source_platform).toBe('youtube');
    expect(done.draft.name).toBe('Video Bread');
    expect(done.source_creator).toBe('Foodies Corner'); // channel name from metadata
    expect(callOpenAIJsonMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // metadata only — transcript never fetched
  });

  it('no recipe in description + no transcript → 422 fast, no transcript fetch, no LLM', async () => {
    // The exact failing case: caption-less Short. We must NOT wait ~25s on a non-existent transcript.
    const fetchMock = fetchReturning({
      status: 200,
      body: { description: 'follow me! #shorts #viral', transcriptLanguages: [] },
    });

    const res = await authedPost('/api/import').buffer(true).send({
      url: 'https://www.youtube.com/shorts/none',
    });

    expect(res.status).toBe(200);
    expect(sseError(parseSse(res.text))?.status).toBe(422);
    expect(callOpenAIJsonMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1); // metadata only — no transcript attempt
  });

  it('no recipe in description → falls back to transcript → draft', async () => {
    fetchReturning(
      { status: 200, body: { description: '', channel: { name: 'Chef' }, transcriptLanguages: ['en'] } },
      { status: 200, body: { content: 'mix flour and water then bake', lang: 'en' } },
    );
    callOpenAIJsonMock.mockResolvedValueOnce(videoDraft);

    const res = await authedPost('/api/import').buffer(true).send({
      url: 'https://www.youtube.com/watch?v=abc123',
    });

    expect(res.status).toBe(200);
    const events = parseSse(res.text);
    expect(sseStages(events)).toEqual(expect.arrayContaining(['fetching-transcript', 'extracting']));
    const done = sseDone(events)!;
    expect(done.source_platform).toBe('youtube');
    expect(done.draft.name).toBe('Video Bread');
    expect(done.source_creator).toBe('Chef');
    expect(callOpenAIJsonMock).toHaveBeenCalledTimes(1);
  });

  it('async 202 → poll → draft, emits the transcribing stage (transcript fallback)', async () => {
    fetchReturning(
      { status: 200, body: { description: '', transcriptLanguages: ['en'] } },
      { status: 202, body: { jobId: 'job-1' } },
      { status: 200, body: { status: 'completed', content: 'transcript text', lang: 'en' } },
    );
    callOpenAIJsonMock.mockResolvedValueOnce(videoDraft);

    const res = await authedPost('/api/import').buffer(true).send({
      url: 'https://www.youtube.com/watch?v=poll1',
    });

    expect(res.status).toBe(200);
    const events = parseSse(res.text);
    expect(sseStages(events)).toContain('transcribing');
    expect(sseDone(events)!.draft.name).toBe('Video Bread');
  });

  it('transcript-unavailable (metadata reports a transcript) → error event (422), no LLM call', async () => {
    fetchReturning(
      { status: 200, body: { description: '', transcriptLanguages: ['en'] } },
      { status: 404, body: { error: 'transcript-unavailable', message: 'none' } },
    );

    const res = await authedPost('/api/import').buffer(true).send({
      url: 'https://www.youtube.com/watch?v=zzz',
    });

    expect(res.status).toBe(200);
    expect(sseError(parseSse(res.text))?.status).toBe(422);
    expect(callOpenAIJsonMock).not.toHaveBeenCalled();
  });

  it('missing SUPADATA_API_KEY → error event (500) for video, other routes still work (fail-soft)', async () => {
    delete process.env.SUPADATA_API_KEY;

    const res = await authedPost('/api/import').buffer(true).send({
      url: 'https://www.youtube.com/watch?v=abc',
    });
    expect(res.status).toBe(200);
    expect(sseError(parseSse(res.text))?.status).toBe(500);

    // The function did not crash globally — the text route still works without the key.
    callOpenAIJsonMock.mockResolvedValueOnce(videoDraft);
    const res2 = await authedPost('/api/import/text').send({ text: 'some recipe text' });
    expect(res2.status).toBe(200);
  });
});

// ──────────────── POST /api/import — social (Apify async + poll cascade) ────────────────

const igItems = (comment: string, captionExtra = '') => [
  {
    caption: `Best bread${captionExtra}`,
    ownerUsername: 'chef',
    latestComments: [{ ownerUsername: 'chef', text: comment, likesCount: 99 }],
  },
];

const completeDraft = {
  name: 'Comment Bread',
  description: 'from the pinned comment',
  ingredients: [
    { name: 'flour', amount: 2, unit: 'cups' },
    { name: 'salt', amount: 1, unit: 'tsp' },
  ],
  steps: ['Mix', 'Bake'],
  tags: ['bread'],
  cooking_time: 30,
  servings: 2,
  emoji: '🍞',
};

function pollBody(platform: 'instagram' | 'tiktok' = 'instagram') {
  const url =
    platform === 'instagram'
      ? 'https://www.instagram.com/reel/abc/'
      : 'https://www.tiktok.com/@chef/video/1';
  return { runId: 'r1', datasetId: 'd1', url, platform };
}

describe('POST /api/import + /poll — social via Apify', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    process.env.SUPADATA_API_KEY = 'test-key';
  });
  afterAll(() => {
    delete process.env.SUPADATA_API_KEY;
  });

  it('Instagram URL → starts an Apify run, returns 202 pending', async () => {
    startRunMock.mockResolvedValueOnce({ runId: 'r1', datasetId: 'd1', status: 'READY' });
    const res = await authedPost('/api/import').send({
      url: 'https://www.instagram.com/reel/abc/',
    });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'pending', runId: 'r1', datasetId: 'd1', platform: 'instagram' });
  });

  it('TikTok URL → starts an Apify run, returns 202 pending', async () => {
    startRunMock.mockResolvedValueOnce({ runId: 'r2', datasetId: 'd2', status: 'READY' });
    const res = await authedPost('/api/import').send({
      url: 'https://www.tiktok.com/@chef/video/1',
    });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'pending', platform: 'tiktok' });
  });

  it('/poll RUNNING → pending with stage scraping', async () => {
    getRunStatusMock.mockResolvedValueOnce('RUNNING');
    const res = await authedPost('/api/import/poll').send(pollBody());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'pending', stage: 'scraping' });
  });

  it('/poll SUCCEEDED → pending with stage extracting, cascade NOT run yet', async () => {
    getRunStatusMock.mockResolvedValueOnce('SUCCEEDED');
    const res = await authedPost('/api/import/poll').send(pollBody());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'pending', stage: 'extracting' });
    expect(getDatasetItemsMock).not.toHaveBeenCalled();
    expect(callOpenAIJsonMock).not.toHaveBeenCalled();
  });

  it('/poll finalize → comments complete → draft WITHOUT fetching the transcript', async () => {
    getDatasetItemsMock.mockResolvedValueOnce(igItems('2 cups flour, 1 tsp salt — mix and bake'));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy); // any transcript fetch would call this
    callOpenAIJsonMock.mockResolvedValueOnce(completeDraft);

    const res = await authedPost('/api/import/poll').send({ ...pollBody(), finalize: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.draft.name).toBe('Comment Bread');
    expect(res.body.source_platform).toBe('instagram');
    expect(getRunStatusMock).not.toHaveBeenCalled(); // finalize short-circuits the status check
    expect(callOpenAIJsonMock).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled(); // cascade stopped at comments — no Supadata
  });

  it('/poll finalize → comments thin → lazy transcript merge completes it', async () => {
    getDatasetItemsMock.mockResolvedValueOnce(igItems('recipe in my video!'));
    fetchReturning({ status: 200, body: { content: 'mix 2 cups flour with 1 tsp salt then bake' } });
    callOpenAIJsonMock
      .mockResolvedValueOnce({ ...completeDraft, ingredients: [{ name: 'flour', amount: 2, unit: 'cups' }], steps: [] }) // thin
      .mockResolvedValueOnce(completeDraft); // merged with transcript → complete

    const res = await authedPost('/api/import/poll').send({ ...pollBody(), finalize: true });

    expect(res.status).toBe(200);
    expect(res.body.draft.steps).toEqual(['Mix', 'Bake']);
    expect(callOpenAIJsonMock).toHaveBeenCalledTimes(2);
  });

  it('/poll FAILED → 422 (paste fallback)', async () => {
    getRunStatusMock.mockResolvedValueOnce('FAILED');
    const res = await authedPost('/api/import/poll').send(pollBody());
    expect(res.status).toBe(422);
  });
});

// ──────────────── unit: parseSocial / recipeLink ────────────────

describe('parseSocial / recipeLink', () => {
  it('instagram: creator comment ranks first, then by likes', () => {
    const data = social.parseSocial(
      [
        {
          ownerUsername: 'chef',
          caption: 'cap',
          latestComments: [
            { ownerUsername: 'fan', text: 'yum', likesCount: 500 },
            { ownerUsername: 'chef', text: 'full recipe', likesCount: 5 },
            { ownerUsername: 'other', text: 'nice', likesCount: 50 },
          ],
        },
      ],
      'instagram',
      'https://www.instagram.com/reel/x/',
    );
    expect(data.creator).toBe('@chef');
    expect(data.comments[0]?.isCreator).toBe(true); // creator first despite fewer likes
    expect(data.comments[1]?.author).toBe('fan'); // then most-liked
  });

  it('tiktok: parses the description as caption + author handle (no comments)', () => {
    const data = social.parseSocial(
      [{ text: '2 cups flour, mix and bake', authorMeta: { name: 'chef' } }],
      'tiktok',
      'https://www.tiktok.com/@chef/video/1',
    );
    expect(data.caption).toBe('2 cups flour, mix and bake');
    expect(data.creator).toBe('@chef');
    expect(data.comments).toEqual([]);
  });

  it('recipeLink finds a website URL, ignores social hosts', () => {
    expect(social.recipeLink('full recipe: https://blog.example.com/pasta', [])).toContain(
      'blog.example.com',
    );
    expect(social.recipeLink('see https://www.instagram.com/p/x/', [])).toBeNull();
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
