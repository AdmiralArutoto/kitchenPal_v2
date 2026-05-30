import type { Logger } from 'pino';
import { HttpError } from '../../middleware/errors.js';
import { fetchTranscript } from '../supadata.js';
import {
  callOpenAIJson,
  IMPORT_EXTRACT_SYSTEM_PROMPT,
  buildImportExtractPrompt,
  MODEL_DRAFTS,
} from '../openai.js';
import { ExtractResultSchema, type ImportDraft, type ImportStage } from '../../schemas/import.js';
import type { Platform } from './url.js';

const MAX_TRANSCRIPT_CHARS = 15_000;
type OnStage = (stage: ImportStage) => void;
const noop: OnStage = () => {};

// Best-effort creator handle from the URL path (TikTok/Instagram expose @handle). YouTube has no
// handle in the URL → null (channel-metadata enrichment is a future nicety). Attribution still
// shows the platform/host + link when creator is null.
function creatorFromUrl(url: string, platform: Platform): string | null {
  if (platform === 'tiktok' || platform === 'instagram') {
    const m = url.match(/\/@([A-Za-z0-9._]+)/);
    if (m) return `@${m[1]}`;
  }
  return null;
}

// Video import: Supadata transcript → existing extraction LLM → draft. No yt-dlp/ffmpeg/Whisper.
export async function extractFromVideo(
  url: string,
  platform: Platform,
  log: Logger,
  onStage: OnStage = noop,
): Promise<{ draft: ImportDraft; sourceCreator: string | null }> {
  onStage('fetching-transcript');
  // Supadata fires the callback when it falls back to AI-generating the transcript (202 path).
  const transcript = (await fetchTranscript(url, () => onStage('transcribing'))).slice(
    0,
    MAX_TRANSCRIPT_CHARS,
  );
  if (!transcript.trim()) throw new HttpError(422, "We couldn't find a recipe in this video");

  const creator = creatorFromUrl(url, platform);
  log.info({ platform, len: transcript.length }, 'video transcript fetched');

  onStage('extracting');
  const result = await callOpenAIJson({
    model: MODEL_DRAFTS,
    systemPrompt: IMPORT_EXTRACT_SYSTEM_PROMPT,
    userPrompt: buildImportExtractPrompt({ platform, creator, content: transcript }),
    schema: ExtractResultSchema,
    // Single attempt within ~20s; with the ~30s transcript budget this stays under the 60s cap.
    timeoutMs: 20_000,
  });
  if ('empty' in result) throw new HttpError(422, "We couldn't find a recipe in this video");

  return { draft: result, sourceCreator: creator };
}
