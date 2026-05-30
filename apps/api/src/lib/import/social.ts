import type { Logger } from 'pino';
import { HttpError } from '../../middleware/errors.js';
import {
  callOpenAIJson,
  IMPORT_SOCIAL_SYSTEM_PROMPT,
  buildSocialExtractPrompt,
  MODEL_DRAFTS,
} from '../openai.js';
import { ExtractResultSchema, type ImportDraft } from '../../schemas/import.js';
import { extractFromWebsite } from './website.js';
import { fetchTranscript } from '../supadata.js';
import type { Platform } from './url.js';

const TOP_COMMENTS = 5;
const MAX_TRANSCRIPT_CHARS = 12_000;
const URL_RE = /https?:\/\/[^\s)"']+/gi;
const SOCIAL_HOST_RE =
  /(^|\.)(instagram\.com|tiktok\.com|youtube\.com|youtu\.be|facebook\.com|fb\.watch|twitter\.com|x\.com)$/i;

type Comment = { author: string; text: string; likes: number; isCreator: boolean };
type SocialData = { caption: string; comments: Comment[]; creator: string | null };

// ── which Apify actor for each platform ──
export function actorFor(platform: Platform): string {
  if (platform === 'instagram') return 'apify~instagram-scraper';
  // TikTok recipes live in the video DESCRIPTION (not comments), so use the video-data scraper.
  if (platform === 'tiktok') return 'clockworks~tiktok-scraper';
  throw new HttpError(422, `Social scraping not wired for ${platform} yet`);
}

export function buildActorInput(platform: Platform, url: string): unknown {
  if (platform === 'instagram') {
    return { directUrls: [url], resultsType: 'posts', resultsLimit: 1, addParentData: false };
  }
  if (platform === 'tiktok') {
    // Metadata only (the description) — skip all media downloads to keep the run fast + cheap.
    return {
      postURLs: [url],
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
      shouldDownloadSlideshowImages: false,
    };
  }
  throw new HttpError(422, `Social scraping not wired for ${platform} yet`);
}

function handleFromUrl(url: string): string | null {
  const m = url.match(/\/@([A-Za-z0-9._]+)/);
  return m ? `@${m[1]}` : null;
}

// ── parsing (Apify output is untyped; be defensive about field names) ──
function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

function parseInstagram(items: unknown[]): SocialData {
  const post = asRec(items[0]) ?? {};
  const owner = str(post.ownerUsername) || null;
  const caption = str(post.caption);

  const raw = Array.isArray(post.latestComments) ? post.latestComments : [];
  const comments: Comment[] = [];
  for (const c of raw) {
    const r = asRec(c);
    if (!r) continue;
    const text = str(r.text);
    if (!text) continue;
    const author = str(r.ownerUsername);
    comments.push({
      author,
      text,
      likes: num(r.likesCount),
      isCreator: !!owner && author === owner,
    });
  }
  // Creator's own comment first, then most-liked.
  comments.sort((a, b) => Number(b.isCreator) - Number(a.isCreator) || b.likes - a.likes);

  return { caption, comments, creator: owner ? `@${owner}` : null };
}

// TikTok video-data scraper: the recipe is in the DESCRIPTION (`text`); `authorMeta.name` is the
// creator handle. This actor returns video metadata, not comments — so comments stay empty and the
// cascade extracts from the description (then the transcript as fallback).
function parseTikTok(items: unknown[], url: string): SocialData {
  const post = asRec(items[0]) ?? {};
  const caption = str(post.text);
  const authorMeta = asRec(post.authorMeta);
  const handle = authorMeta ? str(authorMeta.name) : '';
  const creator = handle ? `@${handle}` : handleFromUrl(url);
  return { caption, comments: [], creator };
}

export function parseSocial(items: unknown[], platform: Platform, url: string): SocialData {
  if (platform === 'instagram') return parseInstagram(items);
  if (platform === 'tiktok') return parseTikTok(items, url);
  throw new HttpError(422, `Social parsing not wired for ${platform} yet`);
}

// First non-social http(s) URL in the caption or a creator comment (extractFromWebsite follows
// redirects, so shorteners resolve; Linktree-style pages simply yield no recipe and we fall through).
export function recipeLink(caption: string, comments: Comment[]): string | null {
  const sources = [caption, ...comments.filter((c) => c.isCreator).map((c) => c.text)];
  for (const text of sources) {
    const matches = text.match(URL_RE);
    if (!matches) continue;
    for (const m of matches) {
      const cleaned = m.replace(/[.,)\]]+$/, '');
      try {
        const host = new URL(cleaned).hostname.replace(/^www\./, '');
        if (!SOCIAL_HOST_RE.test(host)) return cleaned;
      } catch {
        // not a parseable URL — skip
      }
    }
  }
  return null;
}

function isComplete(d: ImportDraft): boolean {
  return d.ingredients.length >= 2 && d.steps.length >= 1;
}

async function extractFromSocial(opts: {
  platform: Platform;
  creator: string | null;
  caption: string;
  comments: Comment[];
  transcript?: string | null;
}): Promise<ImportDraft | { empty: true }> {
  return callOpenAIJson({
    model: MODEL_DRAFTS,
    systemPrompt: IMPORT_SOCIAL_SYSTEM_PROMPT,
    userPrompt: buildSocialExtractPrompt(opts),
    schema: ExtractResultSchema,
    timeoutMs: 25_000,
  });
}

// Lazy cascade over a scraped social post: link → caption+comments → transcript merge.
// Stops at the first COMPLETE recipe; keeps the best partial as a fallback; 422 if nothing usable.
export async function runSocialCascade(
  url: string,
  platform: Platform,
  items: unknown[],
  log: Logger,
): Promise<{ draft: ImportDraft; sourceCreator: string | null }> {
  const data = parseSocial(items, platform, url);
  // Breadcrumb for monitoring social imports — counts only (no recipe text/PII). If a future actor
  // changes shape this flags it (parsedComments 0 / hasCaption false); add a sample back to debug.
  log.info(
    {
      platform,
      itemCount: items.length,
      parsedComments: data.comments.length,
      hasCaption: Boolean(data.caption),
    },
    'social cascade: parsed dataset',
  );
  const top = data.comments.slice(0, TOP_COMMENTS);
  let best: ImportDraft | null = null;

  const keep = (d: ImportDraft): boolean => {
    if (isComplete(d)) {
      best = d;
      return true; // complete → stop the cascade
    }
    best ??= d; // remember the first partial
    return false;
  };

  // 1. Recipe link in caption / creator comment → reuse the website extractor (often JSON-LD).
  const link = recipeLink(data.caption, data.comments);
  if (link) {
    try {
      const fromLink = await extractFromWebsite(link, log);
      log.info({ link }, 'social import: parsed linked site');
      if (keep(fromLink.draft)) return { draft: best!, sourceCreator: data.creator };
    } catch (err) {
      log.info({ link, err }, 'social import: link parse failed, continuing');
    }
  }

  // 2. Caption + top comments (comments authoritative).
  const fromComments = await extractFromSocial({
    platform,
    creator: data.creator,
    caption: data.caption,
    comments: top,
  });
  if (!('empty' in fromComments) && keep(fromComments)) {
    return { draft: best!, sourceCreator: data.creator };
  }

  // 3. Lazy transcript: only now do we pay Supadata, and merge it in (supplementary).
  let transcript: string | null = null;
  try {
    transcript = (await fetchTranscript(url)).slice(0, MAX_TRANSCRIPT_CHARS);
  } catch (err) {
    log.info({ err }, 'social import: transcript unavailable, continuing');
  }
  if (transcript?.trim()) {
    const merged = await extractFromSocial({
      platform,
      creator: data.creator,
      caption: data.caption,
      comments: top,
      transcript,
    });
    if (!('empty' in merged) && keep(merged)) {
      return { draft: best!, sourceCreator: data.creator };
    }
  }

  if (best) return { draft: best, sourceCreator: data.creator };
  throw new HttpError(422, "We couldn't find a recipe in this post — try Paste text or Screenshot");
}
