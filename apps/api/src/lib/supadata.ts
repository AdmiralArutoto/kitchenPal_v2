import { HttpError } from '../middleware/errors.js';

const BASE_URL = 'https://api.supadata.ai/v1';
const INITIAL_TIMEOUT_MS = 25_000; // a video with no existing transcript may be processed inline
const POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 2_000;
const META_TIMEOUT_MS = 10_000; // /youtube/video is a quick metadata read (~3s observed)
// ~30s transcript budget + ~20s extraction LLM (single attempt) + overhead stays under the 60s cap.
const TOTAL_BUDGET_MS = 30_000;

type SupadataContent = string | Array<{ text?: string }>;

// Read at call time (NOT module load): a missing key disables only the video feature, not the whole
// serverless function. The rest of the app keeps working without it.
function getKey(): string {
  const key = process.env.SUPADATA_API_KEY;
  if (!key) throw new HttpError(500, 'Video import is not configured (missing SUPADATA_API_KEY)');
  return key;
}

async function supaGet(path: string, key: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
      headers: { 'x-api-key': key, Accept: 'application/json' },
    });
  } catch {
    // The bare catch can't tell a timeout from a real network failure; the AbortController flag can.
    // A slow video (Supadata generating a transcript inline past timeoutMs, common for caption-less
    // Shorts) is a timeout → 504, not "unreachable". Both route the client to the paste fallback,
    // but the message/log must be honest (502 sent us chasing a non-existent outage).
    if (controller.signal.aborted) {
      throw new HttpError(504, 'Transcript is taking too long — paste the caption instead');
    }
    throw new HttpError(502, 'Transcript service unreachable');
  } finally {
    clearTimeout(timer);
  }
}

// With text=true the API returns `content` as a plain string; guard the segment-array shape too.
function contentToText(content: SupadataContent | undefined): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => c?.text ?? '').join(' ').trim();
  return '';
}

// Maps a non-2xx Supadata response to an HttpError. 422/429 → the frontend offers the paste
// fallback; config issues surface as 500; everything else as 502. Always throws.
async function readError(res: Response): Promise<never> {
  let code = '';
  let message = '';
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    code = body.error ?? '';
    message = body.message ?? '';
  } catch {
    // non-JSON error body — fall through to the status-based default
  }
  if (code === 'transcript-unavailable' || code === 'not-found' || code === 'invalid-request') {
    throw new HttpError(422, message || 'No transcript is available for this video');
  }
  if (code === 'limit-exceeded') {
    throw new HttpError(429, message || 'Transcript service limit reached');
  }
  if (code === 'unauthorized' || code === 'upgrade-required' || code === 'forbidden') {
    throw new HttpError(500, 'Video import is not configured correctly');
  }
  throw new HttpError(502, message || `Transcript service error (${res.status})`);
}

async function pollJob(jobId: string, key: string, deadline: number): Promise<string> {
  for (;;) {
    const res = await supaGet(`/transcript/${jobId}`, key, POLL_TIMEOUT_MS);
    if (!res.ok) return readError(res);

    const body = (await res.json()) as { status?: string; content?: SupadataContent };
    if (body.status === 'completed') {
      const text = contentToText(body.content);
      if (!text) throw new HttpError(422, 'No transcript is available for this video');
      return text;
    }
    if (body.status === 'failed') {
      throw new HttpError(422, 'Could not transcribe this video');
    }
    if (Date.now() >= deadline) {
      throw new HttpError(504, 'Transcript is taking too long — paste the caption instead');
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// Fetches a plain-text transcript for a video URL via Supadata (mode=auto: use an existing
// transcript, else AI-generate). Large videos return 202 + jobId → polled within TOTAL_BUDGET_MS.
// Throws HttpError on failure (422 for "no transcript" → client falls back to manual paste).
export async function fetchTranscript(url: string, onTranscribing?: () => void): Promise<string> {
  const key = getKey();
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const params = new URLSearchParams({ url, text: 'true', mode: 'auto' });
  const res = await supaGet(`/transcript?${params.toString()}`, key, INITIAL_TIMEOUT_MS);

  if (res.status === 200) {
    const body = (await res.json()) as { content?: SupadataContent };
    const text = contentToText(body.content);
    if (!text) throw new HttpError(422, 'No transcript is available for this video');
    return text;
  }
  if (res.status === 202) {
    // No existing transcript → Supadata is AI-generating one (the slow path).
    onTranscribing?.();
    const body = (await res.json()) as { jobId?: string };
    if (!body.jobId) throw new HttpError(502, 'Transcript service error');
    return pollJob(body.jobId, key, deadline);
  }
  return readError(res);
}

export type YoutubeMeta = {
  title: string;
  description: string;
  channel: string | null;
  // Languages with an available transcript. `undefined` = field absent (treat as unknown, don't
  // assume "no transcript"); `[]` = Supadata explicitly reports none → skip the slow transcript path.
  transcriptLanguages: string[] | undefined;
};

// Fast YouTube metadata (title, description, channel, available transcript languages) via Supadata's
// /youtube/video (~3s). The description is where Shorts and most cooking videos put the recipe — far
// faster and more reliable than waiting on a (possibly non-existent) transcript. Accepts a full URL
// as the `id` param. Throws HttpError on failure (the caller treats this as best-effort).
export async function fetchYoutubeMeta(url: string): Promise<YoutubeMeta> {
  const key = getKey();
  const params = new URLSearchParams({ id: url });
  const res = await supaGet(`/youtube/video?${params.toString()}`, key, META_TIMEOUT_MS);
  if (!res.ok) return readError(res);
  const body = (await res.json()) as {
    title?: string;
    description?: string;
    channel?: { name?: string } | null;
    transcriptLanguages?: string[];
  };
  return {
    title: body.title ?? '',
    description: body.description ?? '',
    channel: body.channel?.name ?? null,
    transcriptLanguages: Array.isArray(body.transcriptLanguages) ? body.transcriptLanguages : undefined,
  };
}
