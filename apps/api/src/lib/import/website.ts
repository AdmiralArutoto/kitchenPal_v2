import * as cheerio from 'cheerio';
import type { Logger } from 'pino';
import { HttpError } from '../../middleware/errors.js';
import {
  callOpenAIJson,
  IMPORT_EXTRACT_SYSTEM_PROMPT,
  buildImportExtractPrompt,
  MODEL_DRAFTS,
} from '../openai.js';
import { ExtractResultSchema, type ImportDraft } from '../../schemas/import.js';
import { parseIngredients } from './ingredients.js';

const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_CONTENT_CHARS = 12_000;

// ──────────────── fetch ────────────────

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
  } catch {
    throw new HttpError(422, "We couldn't reach this page");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new HttpError(422, "We couldn't reach this page");
  return res.text();
}

// ──────────────── value helpers (JSON-LD is untyped) ────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asText(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

// ISO-8601 duration ("PT1H15M", "P0DT0H30M") → minutes.
function isoDurationToMinutes(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 ? total : null;
}

function extractYield(v: unknown): number | null {
  const pick = Array.isArray(v) ? v[0] : v;
  if (typeof pick === 'number') return Math.round(pick);
  if (typeof pick === 'string') {
    const m = pick.match(/\d+/);
    if (m) return Number(m[0]);
  }
  return null;
}

function extractAuthor(v: unknown): string | null {
  const pick = Array.isArray(v) ? v[0] : v;
  if (typeof pick === 'string') return pick.trim() || null;
  const rec = asRecord(pick);
  const name = rec ? asText(rec.name).trim() : '';
  return name || null;
}

// recipeInstructions: string | string[] | HowToStep[] | HowToSection[] (nested itemListElement).
function extractInstructions(v: unknown): string[] {
  if (typeof v === 'string') {
    return v.split(/\r?\n/).map((s) => stripHtml(s)).filter(Boolean);
  }
  if (!Array.isArray(v)) return [];
  const steps: string[] = [];
  for (const item of v) {
    if (typeof item === 'string') {
      const t = stripHtml(item);
      if (t) steps.push(t);
      continue;
    }
    const rec = asRecord(item);
    if (!rec) continue;
    if (rec['@type'] === 'HowToSection' && Array.isArray(rec.itemListElement)) {
      for (const sub of rec.itemListElement) {
        const subRec = asRecord(sub);
        const t = stripHtml(asText(subRec?.text));
        if (t) steps.push(t);
      }
    } else {
      const t = stripHtml(asText(rec.text));
      if (t) steps.push(t);
    }
  }
  return steps;
}

function buildTags(node: Record<string, unknown>): string[] {
  const raw = [
    ...toStringArray(node.recipeCuisine),
    ...toStringArray(node.recipeCategory),
    ...toStringArray(node.keywords),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const norm = t.trim();
    const key = norm.toLowerCase();
    if (!norm || seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
    if (out.length >= 5) break;
  }
  return out;
}

// ──────────────── JSON-LD discovery ────────────────

function isRecipeNode(v: unknown): v is Record<string, unknown> {
  const rec = asRecord(v);
  if (!rec) return false;
  const t = rec['@type'];
  return Array.isArray(t) ? t.includes('Recipe') : t === 'Recipe';
}

function findRecipeNode(parsed: unknown): Record<string, unknown> | null {
  const candidates: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  for (const c of candidates) {
    if (isRecipeNode(c)) return c;
    const rec = asRecord(c);
    if (rec && Array.isArray(rec['@graph'])) {
      for (const g of rec['@graph']) if (isRecipeNode(g)) return g;
    }
  }
  return null;
}

function findRecipeJsonLd($: cheerio.CheerioAPI): Record<string, unknown> | null {
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const raw = $(el).text().trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const node = findRecipeNode(parsed);
    if (node) return node;
  }
  return null;
}

// Returns a draft from a schema.org Recipe node, or null when the node is too incomplete to use
// (caller then falls back to HTML extraction).
async function fromJsonLd(
  node: Record<string, unknown>,
): Promise<{ draft: ImportDraft; sourceCreator: string | null } | null> {
  const name = asText(node.name).trim();
  const ingredientLines = toStringArray(node.recipeIngredient ?? node.ingredients);
  const steps = extractInstructions(node.recipeInstructions);
  if (!name || ingredientLines.length === 0 || steps.length === 0) return null;

  const ingredients = await parseIngredients(ingredientLines);
  if (ingredients.length === 0) return null;

  const draft: ImportDraft = {
    name,
    description: stripHtml(asText(node.description)).slice(0, 500),
    ingredients,
    steps,
    tags: buildTags(node),
    cooking_time: isoDurationToMinutes(node.totalTime) ?? isoDurationToMinutes(node.cookTime),
    servings: extractYield(node.recipeYield),
    emoji: '🍽️',
  };
  return { draft, sourceCreator: extractAuthor(node.author) };
}

// ──────────────── HTML fallback (no usable JSON-LD) ────────────────

function mainContent($: cheerio.CheerioAPI): string {
  $('nav, footer, header, script, style, aside, noscript, form, iframe').remove();
  for (const sel of ['article', 'main']) {
    const t = $(sel).first().text().replace(/\s+/g, ' ').trim();
    if (t.length > 200) return t;
  }
  return $('body').text().replace(/\s+/g, ' ').trim();
}

async function fromHtmlFallback(
  $: cheerio.CheerioAPI,
): Promise<{ draft: ImportDraft; sourceCreator: string | null } | null> {
  const content = mainContent($).slice(0, MAX_CONTENT_CHARS);
  if (!content) return null;

  const result = await callOpenAIJson({
    model: MODEL_DRAFTS,
    systemPrompt: IMPORT_EXTRACT_SYSTEM_PROMPT,
    userPrompt: buildImportExtractPrompt({ platform: 'website', creator: null, content }),
    schema: ExtractResultSchema,
  });
  if ('empty' in result) return null;
  return { draft: result, sourceCreator: null };
}

// ──────────────── entry point ────────────────

export async function extractFromWebsite(
  url: string,
  log: Logger,
): Promise<{ draft: ImportDraft; sourceCreator: string | null }> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const node = findRecipeJsonLd($);
  if (node) {
    const fromLd = await fromJsonLd(node);
    if (fromLd) return fromLd;
    log.info({ url }, 'JSON-LD Recipe present but incomplete; falling back to HTML extraction');
  }

  const fromHtml = await fromHtmlFallback($);
  if (!fromHtml) throw new HttpError(422, "We couldn't find a recipe on this page");
  return fromHtml;
}
