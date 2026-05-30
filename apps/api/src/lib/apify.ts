import { HttpError } from '../middleware/errors.js';

const BASE_URL = 'https://api.apify.com/v2';
const TIMEOUT_MS = 15_000;

export type ApifyRun = { runId: string; datasetId: string; status: string };

// Apify run lifecycle statuses (string union kept loose — we only branch on these three).
export const APIFY_TERMINAL_OK = 'SUCCEEDED';

// Read at call time (NOT module load) so a missing token disables only the Apify-backed import path,
// not the whole serverless function. Mirrors supadata.ts.
function getToken(): string {
  const t = process.env.APIFY_TOKEN;
  if (!t) throw new HttpError(500, 'Social import is not configured (missing APIFY_TOKEN)');
  return t;
}

async function apifyFetch(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch {
    throw new HttpError(502, 'Apify unreachable');
  } finally {
    clearTimeout(timer);
  }
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  if (res.status === 401 || res.status === 403) throw new HttpError(500, 'Apify auth failed');
  if (res.status === 429) throw new HttpError(429, 'Apify rate limit reached');
  if (res.status === 404) throw new HttpError(422, 'Apify resource not found');
  throw new HttpError(502, `Apify error (${res.status})`);
}

function tokenQuery(): string {
  return `token=${encodeURIComponent(getToken())}`;
}

// Starts an actor run asynchronously and returns its id + default dataset id. Does NOT wait for the
// run to finish — the client polls getRunStatus, so we never block our function past the 60s cap.
export async function startRun(actorId: string, input: unknown): Promise<ApifyRun> {
  const res = await apifyFetch(`/acts/${actorId}/runs?${tokenQuery()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await ensureOk(res);
  const body = (await res.json()) as {
    data?: { id?: string; defaultDatasetId?: string; status?: string };
  };
  const runId = body.data?.id;
  const datasetId = body.data?.defaultDatasetId;
  if (!runId || !datasetId) throw new HttpError(502, 'Apify returned an unexpected run shape');
  return { runId, datasetId, status: body.data?.status ?? 'READY' };
}

export async function getRunStatus(runId: string): Promise<string> {
  const res = await apifyFetch(`/actor-runs/${encodeURIComponent(runId)}?${tokenQuery()}`, {
    method: 'GET',
  });
  await ensureOk(res);
  const body = (await res.json()) as { data?: { status?: string } };
  return body.data?.status ?? 'UNKNOWN';
}

export async function getDatasetItems(datasetId: string): Promise<unknown[]> {
  const res = await apifyFetch(`/datasets/${encodeURIComponent(datasetId)}/items?${tokenQuery()}`, {
    method: 'GET',
  });
  await ensureOk(res);
  const items = (await res.json()) as unknown;
  return Array.isArray(items) ? items : [];
}
