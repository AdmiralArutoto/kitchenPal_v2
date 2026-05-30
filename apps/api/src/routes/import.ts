import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import {
  ImportUrlRequestSchema,
  ImportTextRequestSchema,
  ImportPollRequestSchema,
  ExtractResultSchema,
  type ImportResult,
} from '../schemas/import.js';
import { classifyUrl } from '../lib/import/url.js';
import { extractFromWebsite } from '../lib/import/website.js';
import { extractFromVideo } from '../lib/import/video.js';
import { startRun, getRunStatus, getDatasetItems } from '../lib/apify.js';
import { actorFor, buildActorInput, runSocialCascade } from '../lib/import/social.js';
import { startSse } from '../lib/sse.js';
import {
  callOpenAIJson,
  callOpenAIVisionJson,
  IMPORT_EXTRACT_SYSTEM_PROMPT,
  buildImportExtractPrompt,
  IMPORT_VISION_SYSTEM_PROMPT,
  buildImportVisionPrompt,
  MODEL_DRAFTS,
} from '../lib/openai.js';

export const importRouter = Router();
importRouter.use(authMiddleware);

const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  // 4MB — stays under Vercel's ~4.5MB serverless request-body cap.
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.has(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'Image must be png, jpeg, or webp'));
  },
});

// Maps multer's own LIMIT_* errors into 400 HttpError (mirrors recipes.ts).
function withMulterErrors(mw: import('express').RequestHandler): import('express').RequestHandler {
  return (req, res, next) => {
    mw(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) next(new HttpError(400, err.message));
      else next(err);
    });
  };
}

function optionalField(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

// Paste a URL → extract a recipe draft. Websites parse JSON-LD/HTML; video platforms (YouTube,
// TikTok, Instagram) go through Supadata transcript → extraction LLM. Failures (no transcript,
// blocked, etc.) surface as 422 so the client offers the manual paste/screenshot fallback. The
// draft is NOT persisted — the client reviews/edits, then saves via POST /api/recipes (source:'imported').
importRouter.post('/', async (req, res) => {
  const parsed = ImportUrlRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  }

  const { url, platform } = classifyUrl(parsed.data.url);

  // Instagram + TikTok → async Apify scrape (caption/comments live behind a job). Start the run and
  // return its ids; the client polls /api/import/poll, so we never block past the 60s cap.
  if (platform === 'instagram' || platform === 'tiktok') {
    const run = await startRun(actorFor(platform), buildActorInput(platform, url));
    res
      .status(202)
      .json({ status: 'pending', runId: run.runId, datasetId: run.datasetId, url, platform });
    return;
  }

  // Website + YouTube extract synchronously (< 60s) → stream real progress over SSE. The extractor's
  // onStage callback emits the actual stages it reaches. Errors after the stream opens can't change
  // the HTTP status, so they're sent as an `error` event carrying the intended status.
  const sse = startSse(res);
  try {
    const { draft, sourceCreator } =
      platform === 'website'
        ? await extractFromWebsite(url, req.log, sse.stage)
        : await extractFromVideo(url, platform, req.log, sse.stage);
    sse.done({
      status: 'done',
      draft,
      source_url: url,
      source_platform: platform,
      source_creator: sourceCreator,
    } satisfies ImportResult & { status: 'done' });
  } catch (err) {
    req.log.warn({ err, url }, 'import SSE error');
    sse.error(err instanceof HttpError ? err.status : 500, err instanceof HttpError ? err.message : 'Import failed');
  }
});

// Poll an async social-import run started by POST /api/import. The client carries the run ids
// (stateless — no DB). On SUCCEEDED we run the lazy cascade (link → comments → transcript).
importRouter.post('/poll', async (req, res) => {
  const parsed = ImportPollRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  }
  const { runId, datasetId, url, platform, finalize } = parsed.data;

  // The client sets `finalize` once it has seen stage 'extracting' (the run SUCCEEDED) — fetch the
  // dataset and run the lazy cascade now. Kept separate from the status check so the poll loop can
  // surface a real 'extracting' stage before this (longer) request runs.
  if (finalize) {
    const items = await getDatasetItems(datasetId);
    const { draft, sourceCreator } = await runSocialCascade(url, platform, items, req.log);
    res.json({
      status: 'done',
      draft,
      source_url: url,
      source_platform: platform,
      source_creator: sourceCreator,
    } satisfies ImportResult & { status: 'done' });
    return;
  }

  const status = await getRunStatus(runId);
  if (status === 'SUCCEEDED') {
    res.json({ status: 'pending', stage: 'extracting' });
    return;
  }
  if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
    throw new HttpError(422, "We couldn't read this post — try Paste text or Screenshot");
  }
  res.json({ status: 'pending', stage: status === 'READY' ? 'queued' : 'scraping' });
});

// Manual fallback: extract from pasted caption / recipe text. Works for every platform. Optional
// source_* fields are echoed back so attribution survives even when auto-extraction wasn't used.
importRouter.post('/text', async (req, res) => {
  const parsed = ImportTextRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  }
  const { text, source_url, source_platform, source_creator } = parsed.data;

  const result = await callOpenAIJson({
    model: MODEL_DRAFTS,
    systemPrompt: IMPORT_EXTRACT_SYSTEM_PROMPT,
    userPrompt: buildImportExtractPrompt({
      platform: source_platform || 'pasted text',
      creator: source_creator ?? null,
      content: text,
    }),
    schema: ExtractResultSchema,
    timeoutMs: 25_000,
  });
  if ('empty' in result) {
    throw new HttpError(422, "We couldn't find a recipe in this content");
  }

  const out: ImportResult = {
    draft: result,
    source_url: source_url ?? null,
    source_platform: source_platform ?? null,
    source_creator: source_creator ?? null,
  };
  res.json(out);
});

// Screenshot fallback: extract from an uploaded image via vision, with an optional user note.
// Same draft shape; the image is never stored. multipart/form-data: `file` + optional `comment`,
// `source_url`, `source_platform`, `source_creator`.
importRouter.post('/image', withMulterErrors(upload.single('file')), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Missing image');

  const comment = optionalField(req.body.comment);
  const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

  const result = await callOpenAIVisionJson({
    model: MODEL_DRAFTS,
    systemPrompt: IMPORT_VISION_SYSTEM_PROMPT,
    textPrompt: buildImportVisionPrompt(comment),
    imageDataUrl: dataUrl,
    schema: ExtractResultSchema,
    timeoutMs: 30_000,
  });
  if ('empty' in result) {
    throw new HttpError(422, "We couldn't find a recipe in this image");
  }

  const out: ImportResult = {
    draft: result,
    source_url: optionalField(req.body.source_url),
    source_platform: optionalField(req.body.source_platform),
    source_creator: optionalField(req.body.source_creator),
  };
  res.json(out);
});
