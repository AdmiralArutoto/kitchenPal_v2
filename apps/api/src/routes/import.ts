import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import {
  ImportUrlRequestSchema,
  ImportTextRequestSchema,
  ExtractResultSchema,
  type ImportResult,
} from '../schemas/import.js';
import { classifyUrl } from '../lib/import/url.js';
import { extractFromWebsite } from '../lib/import/website.js';
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
  limits: { fileSize: 5 * 1024 * 1024 },
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

// Paste a URL → extract a recipe draft. Website-only for now; video platforms are recognized but
// routed to the manual-paste fallback (422) until the Python video pipeline lands. The draft is
// NOT persisted — the client reviews/edits, then saves via POST /api/recipes (source: 'imported').
importRouter.post('/', async (req, res) => {
  const parsed = ImportUrlRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  }

  const { url, platform } = classifyUrl(parsed.data.url);
  if (platform !== 'website') {
    throw new HttpError(422, 'Video import is not available yet — paste the caption text instead');
  }

  const { draft, sourceCreator } = await extractFromWebsite(url, req.log);
  const result: ImportResult = {
    draft,
    source_url: url,
    source_platform: 'website',
    source_creator: sourceCreator,
  };
  res.json(result);
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
