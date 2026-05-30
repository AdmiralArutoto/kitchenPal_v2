import { apiFetch, authedFetch, ApiError } from './api';
import type {
  ImportResult,
  ImportDraft,
  ImportStage,
  ImportStartResult,
  ImportPollResult,
} from '../types/api';
import type { RecipeFormValues } from '../components/RecipeEditForm';

// POST /api/import. Website/YouTube stream real progress over SSE (onStage fires per stage, resolves
// on the `done` event); Instagram/TikTok return a JSON pending job to poll. A pre-stream error (e.g.
// invalid URL → 400) comes back as JSON and is thrown as ApiError, same as the SSE `error` event.
export async function importFromUrl(
  url: string,
  opts: { onStage?: (stage: ImportStage) => void; signal?: AbortSignal } = {},
): Promise<ImportStartResult> {
  const res = await authedFetch('/api/import', {
    method: 'POST',
    body: JSON.stringify({ url }),
    signal: opts.signal,
  });

  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    return consumeImportSse(res, opts.onStage);
  }

  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return body as ImportStartResult;
}

export type ImportJob = { runId: string; datasetId: string; url: string; platform: string };

export function pollImport(
  job: ImportJob,
  opts: { finalize?: boolean; signal?: AbortSignal } = {},
): Promise<ImportPollResult> {
  return apiFetch<ImportPollResult>('/api/import/poll', {
    method: 'POST',
    body: JSON.stringify({ ...job, finalize: opts.finalize ?? false }),
    signal: opts.signal,
  });
}

// ──────────────── SSE consumer ────────────────

async function consumeImportSse(
  res: Response,
  onStage?: (stage: ImportStage) => void,
): Promise<ImportStartResult> {
  if (!res.body) throw new ApiError(500, 'Import stream unavailable');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const evt = parseSseEvent(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
      if (!evt) continue;
      if (evt.event === 'progress') {
        onStage?.((evt.data as { stage: ImportStage }).stage);
      } else if (evt.event === 'done') {
        return evt.data as ImportStartResult;
      } else if (evt.event === 'error') {
        const e = evt.data as { status: number; message: string };
        throw new ApiError(e.status, e.message);
      }
    }
  }
  throw new ApiError(500, 'Import stream ended unexpectedly');
}

function parseSseEvent(chunk: string): { event: string; data: unknown } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

export type ImportTextPayload = {
  text: string;
  source_url?: string | null;
  source_platform?: string | null;
  source_creator?: string | null;
};

export function importFromText(
  payload: ImportTextPayload,
  signal?: AbortSignal,
): Promise<ImportResult> {
  return apiFetch<ImportResult>('/api/import/text', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}

export type ImportImagePayload = {
  file: File;
  comment?: string | null;
  source_url?: string | null;
};

export function importFromImage(
  payload: ImportImagePayload,
  signal?: AbortSignal,
): Promise<ImportResult> {
  const fd = new FormData();
  fd.append('file', payload.file);
  if (payload.comment?.trim()) fd.append('comment', payload.comment.trim());
  if (payload.source_url?.trim()) fd.append('source_url', payload.source_url.trim());
  return apiFetch<ImportResult>('/api/import/image', { method: 'POST', body: fd, signal });
}

// Snake_case extraction draft → RecipeEditForm values (camelCase), mirroring Home's approach for
// the AI generate-full response. Emoji is preserved; description coerced to null when blank.
export function importDraftToFormValues(draft: ImportDraft): RecipeFormValues {
  return {
    name: draft.name,
    description: draft.description || null,
    cookingTime: draft.cooking_time,
    servings: draft.servings,
    ingredients: draft.ingredients,
    steps: draft.steps,
    tags: draft.tags,
    emoji: draft.emoji,
  };
}
