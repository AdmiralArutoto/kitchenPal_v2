import { apiFetch } from './api';
import type {
  ImportResult,
  ImportDraft,
  ImportStartResult,
  ImportPollResult,
} from '../types/api';
import type { RecipeFormValues } from '../components/RecipeEditForm';

// Returns either a finished draft (website/YouTube/TikTok) or a pending Apify job (Instagram).
export function importFromUrl(url: string, signal?: AbortSignal): Promise<ImportStartResult> {
  return apiFetch<ImportStartResult>('/api/import', {
    method: 'POST',
    body: JSON.stringify({ url }),
    signal,
  });
}

export type ImportJob = { runId: string; datasetId: string; url: string; platform: string };

export function pollImport(job: ImportJob, signal?: AbortSignal): Promise<ImportPollResult> {
  return apiFetch<ImportPollResult>('/api/import/poll', {
    method: 'POST',
    body: JSON.stringify(job),
    signal,
  });
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
