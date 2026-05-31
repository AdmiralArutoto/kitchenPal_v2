import type { Logger } from 'pino';
import { HttpError } from '../../middleware/errors.js';
import { fetchTranscript, fetchYoutubeMeta } from '../supadata.js';
import {
  callOpenAIJson,
  IMPORT_EXTRACT_SYSTEM_PROMPT,
  buildImportExtractPrompt,
  MODEL_DRAFTS,
} from '../openai.js';
import { ExtractResultSchema, type ImportDraft, type ImportStage } from '../../schemas/import.js';
import type { Platform } from './url.js';

const MAX_TRANSCRIPT_CHARS = 15_000;
// Below this the description is just hashtags/links/a one-liner — not worth an LLM call; go to the
// transcript instead.
const MIN_DESCRIPTION_CHARS = 40;
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

// Video import. YouTube reads the DESCRIPTION first (fast, ~3s — Shorts and most cooking videos put
// the recipe there, like TikTok's description), then falls back to the Supadata transcript ONLY when
// one actually exists (avoids a ~25s wait while Supadata tries to AI-generate a transcript that isn't
// there). No yt-dlp/ffmpeg/Whisper.
export async function extractFromVideo(
  url: string,
  platform: Platform,
  log: Logger,
  onStage: OnStage = noop,
): Promise<{ draft: ImportDraft; sourceCreator: string | null }> {
  // One extraction over a content blob; returns the draft or null when the LLM finds no recipe.
  async function extract(content: string, creator: string | null): Promise<ImportDraft | null> {
    onStage('extracting');
    const result = await callOpenAIJson({
      model: MODEL_DRAFTS,
      systemPrompt: IMPORT_EXTRACT_SYSTEM_PROMPT,
      userPrompt: buildImportExtractPrompt({ platform, creator, content }),
      schema: ExtractResultSchema,
      // Single attempt within ~20s; with the ~30s transcript budget this stays under the 60s cap.
      timeoutMs: 20_000,
    });
    return 'empty' in result ? null : result;
  }

  // 1) YouTube description — best-effort: if metadata fails, fall through to the transcript path (same
  //    Supadata key/service, so a missing key still surfaces the same error there).
  let meta: Awaited<ReturnType<typeof fetchYoutubeMeta>> | null = null;
  if (platform === 'youtube') {
    try {
      onStage('fetching');
      meta = await fetchYoutubeMeta(url);
    } catch (err) {
      log.warn({ err }, 'youtube metadata fetch failed — falling back to transcript');
    }
  }

  const creator = meta?.channel || creatorFromUrl(url, platform);

  if (meta && meta.description.trim().length >= MIN_DESCRIPTION_CHARS) {
    const content = [meta.title, meta.description].filter(Boolean).join('\n\n');
    const draft = await extract(content, creator);
    if (draft) {
      log.info({ platform, source: 'description', len: content.length }, 'video recipe from description');
      return { draft, sourceCreator: creator };
    }
  }

  // 2) Transcript fallback — skip only when Supadata explicitly reports no transcript languages.
  const knownNoTranscript =
    meta != null && Array.isArray(meta.transcriptLanguages) && meta.transcriptLanguages.length === 0;
  if (!knownNoTranscript) {
    onStage('fetching-transcript');
    const transcript = (await fetchTranscript(url, () => onStage('transcribing'))).slice(
      0,
      MAX_TRANSCRIPT_CHARS,
    );
    if (transcript.trim()) {
      log.info({ platform, len: transcript.length }, 'video transcript fetched');
      const draft = await extract(transcript, creator);
      if (draft) return { draft, sourceCreator: creator };
    }
  }

  throw new HttpError(422, "We couldn't find a recipe in this video");
}
