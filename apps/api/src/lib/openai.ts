import OpenAI from 'openai';
import type { ZodSchema } from 'zod';
import { HttpError } from '../middleware/errors.js';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY must be set');

export const openai = new OpenAI({ apiKey, timeout: 9000 });

export const MODEL_DRAFTS = 'gpt-4o-mini';
export const MODEL_FULL = 'gpt-4o';

export function appendPreferences(prompt: string, preferences: string[]): string {
  if (!preferences.length) return prompt;
  return `${prompt}\nUser dietary preferences: ${preferences.join(', ')}`;
}

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

// Shared JSON-mode completion: sends messages, validates the JSON response against a Zod schema,
// and maps OpenAI failures to HttpError. `timeoutMs` overrides the client default (vision reads can
// run longer than the 9s chat ceiling).
async function completeJson<T>(opts: {
  model: string;
  messages: ChatMessage[];
  schema: ZodSchema<T>;
  timeoutMs?: number;
}): Promise<T> {
  let raw: string | null = null;
  try {
    const completion = await openai.chat.completions.create(
      {
        model: opts.model,
        response_format: { type: 'json_object' },
        messages: opts.messages,
      },
      // A custom timeout means the caller has a wall-clock budget (import under the 60s function
      // cap); disable retries so a slow call fails once rather than multiplying 2–3×.
      opts.timeoutMs ? { timeout: opts.timeoutMs, maxRetries: 0 } : undefined,
    );
    raw = completion.choices[0]?.message?.content ?? null;
  } catch (err: unknown) {
    if (err instanceof OpenAI.APIConnectionTimeoutError) {
      throw new HttpError(504, 'AI request timed out');
    }
    if (err instanceof OpenAI.APIError) {
      throw new HttpError(502, `OpenAI error: ${err.message}`);
    }
    throw err;
  }

  if (!raw) throw new HttpError(500, 'AI returned empty response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(500, 'AI returned invalid JSON');
  }

  const result = opts.schema.safeParse(parsed);
  if (!result.success) {
    throw new HttpError(500, 'AI returned unexpected shape');
  }
  return result.data;
}

export async function callOpenAIJson<T>(opts: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodSchema<T>;
  timeoutMs?: number;
}): Promise<T> {
  return completeJson({
    model: opts.model,
    schema: opts.schema,
    timeoutMs: opts.timeoutMs,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userPrompt },
    ],
  });
}

// Vision variant: attaches an image (base64 data URL) alongside a text prompt. Used by the
// screenshot import fallback. gpt-4o / gpt-4o-mini both support image input + JSON mode.
export async function callOpenAIVisionJson<T>(opts: {
  model: string;
  systemPrompt: string;
  textPrompt: string;
  imageDataUrl: string;
  schema: ZodSchema<T>;
  timeoutMs?: number;
}): Promise<T> {
  return completeJson({
    model: opts.model,
    schema: opts.schema,
    timeoutMs: opts.timeoutMs,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: opts.textPrompt },
          { type: 'image_url', image_url: { url: opts.imageDataUrl } },
        ],
      },
    ],
  });
}

export const DRAFTS_SYSTEM_PROMPT = `You generate recipe drafts.
Return a JSON object of shape { "drafts": [{ "title": string, "description": string, "keyIngredients": string[], "estimatedTime": number }, ...] }.
Always return exactly 3 drafts. estimatedTime is in minutes. Return ONLY valid JSON. No markdown, no preamble.`;

export const FULL_SYSTEM_PROMPT = `You generate full recipes.
Return a JSON object of shape { "name": string, "description": string, "ingredients": [{ "name": string, "amount": number, "unit": string }], "steps": string[], "tags": string[], "cooking_time": number, "servings": number, "emoji": string }.
Ingredient "amount" MUST be a number, never a string. "emoji" is a single emoji character. cooking_time is in minutes. Return ONLY valid JSON. No markdown, no preamble.`;

export const MODIFY_SYSTEM_PROMPT = `You modify an existing recipe based on a user comment, preserving the rest of the recipe.
Return a JSON object of shape { "name": string, "description": string, "ingredients": [{ "name": string, "amount": number, "unit": string }], "steps": string[], "tags": string[], "cooking_time": number, "servings": number, "emoji": string }.
Ingredient "amount" MUST be a number. Return ONLY valid JSON.`;

export const NORMALIZE_MEAL_SYSTEM_PROMPT = `You normalize a raw TheMealDB meal object into KitchenPal's recipe schema, filtered by user dietary preferences.

If the meal INHERENTLY conflicts with the user's preferences (e.g., a chicken dish for a vegan user — irreversible without becoming a different recipe), return:
{ "skip": true, "reason": "<one sentence>" }

Otherwise return the normalized recipe:
{ "name": string, "description": string (1-2 sentences), "ingredients": [{ "name": string, "amount": number, "unit": string }], "steps": string[], "tags": string[], "cooking_time": number, "servings": number, "emoji": string }

Rules:
- Ingredient "amount" MUST be a number. Parse fractions ("1/2 cup" → 0.5 cup). When no quantity is given (e.g. "to taste"), use 0 and put "to taste" in the unit.
- Steps: split TheMealDB's strInstructions into a clean ordered array. Remove leading "STEP 1:" prefixes.
- Tags: cuisine (strArea), category (strCategory), and any obvious dietary tags ("Vegetarian", "Vegan", "Gluten-free", etc.). Lowercase-first, deduped, max 5.
- cooking_time: integer minutes, your best estimate from the instructions if not stated.
- servings: integer, default 4 if unstated.
- emoji: a single most-fitting food emoji character.
- Return ONLY valid JSON. No markdown, no preamble.`;

export function buildNormalizePrompt(rawMeal: unknown, preferences: string[]): string {
  const prefsLine = preferences.length
    ? `User dietary preferences: ${preferences.join(', ')}`
    : 'User dietary preferences: (none)';
  return `${prefsLine}\n\nTheMealDB meal (JSON):\n${JSON.stringify(rawMeal)}`;
}

// ──────────────── recipe import ────────────────

export const IMPORT_EXTRACT_SYSTEM_PROMPT = `You extract structured recipes from text. The text may be a video caption, a transcript, a web page's main content, or pasted recipe text.
Return ONLY valid JSON. No markdown, no preamble.
If no recipe content is present, return { "empty": true }.
Otherwise return:
{ "name": string, "description": string (1-2 sentences), "ingredients": [{ "name": string, "amount": number, "unit": string }], "steps": string[], "tags": string[], "cooking_time": number | null, "servings": number | null, "emoji": string }
Rules:
- Preserve original ingredient measurements when stated. Ingredient "amount" MUST be a number. Parse fractions ("1/2 cup" → 0.5 cup). When a quantity is implied but not stated (e.g. "salt to taste"), use 0 and put the descriptor ("to taste") in "unit".
- Do NOT invent ingredients, steps, or measurements that are not in the source material.
- steps: a clean ordered array of instruction strings. Remove leading "Step 1:" / numbering prefixes.
- tags: cuisine / category / obvious dietary tags, lowercase-first, deduped, max 5.
- cooking_time: integer minutes if stated or clearly inferable, else null.
- servings: integer if stated, else null.
- emoji: a single most-fitting food emoji character.`;

export function buildImportExtractPrompt(opts: {
  platform: string;
  creator: string | null;
  content: string;
}): string {
  return `Source: ${opts.platform}
Creator: ${opts.creator || 'unknown'}
Content:
${opts.content}

Extract a recipe from the above into the exact JSON schema described in the system prompt.`;
}

export const IMPORT_VISION_SYSTEM_PROMPT = `You extract structured recipes from an image — a screenshot of a recipe, a photo of a recipe card or cookbook page, a food blog, or a social post.
Return ONLY valid JSON. No markdown, no preamble.
If the image contains no recipe, return { "empty": true }.
Otherwise return:
{ "name": string, "description": string (1-2 sentences), "ingredients": [{ "name": string, "amount": number, "unit": string }], "steps": string[], "tags": string[], "cooking_time": number | null, "servings": number | null, "emoji": string }
Rules:
- Read measurements exactly as shown. Ingredient "amount" MUST be a number. Parse fractions ("1/2 cup" → 0.5 cup). When a quantity is implied but not stated, use 0 and put the descriptor ("to taste") in "unit".
- Do NOT invent ingredients, steps, or measurements that are not visible in the image.
- steps: a clean ordered array of instruction strings, numbering prefixes removed.
- tags: cuisine / category / dietary, lowercase-first, deduped, max 5.
- cooking_time: integer minutes if shown or clearly inferable, else null. servings: integer if shown, else null.
- emoji: a single most-fitting food emoji character.
- If the user provides a note, treat it as additional context or instructions for the extraction.`;

export function buildImportVisionPrompt(comment: string | null): string {
  const trimmed = comment?.trim();
  return trimmed
    ? `Extract the recipe shown in the image. User note: ${trimmed}`
    : 'Extract the recipe shown in the image.';
}

export const INGREDIENT_PARSE_SYSTEM_PROMPT = `You parse recipe ingredient lines into structured objects.
Return ONLY valid JSON of shape { "ingredients": [{ "name": string, "amount": number, "unit": string }] }, one entry per input line, in the same order.
Rules:
- "amount" MUST be a number. Parse fractions and ranges ("1/2" → 0.5, "2-3" → 2). When a quantity is implied but not stated (e.g. "a pinch of salt", "salt to taste"), use 0 and put the descriptor in "unit".
- "unit" is the measurement word ("cup", "g", "tbsp") or "" when there is none.
- "name" is the ingredient itself, without amount/unit. Strip parenthetical notes when they are not part of the name.
- No markdown, no preamble.`;

export function buildIngredientParsePrompt(lines: string[]): string {
  return `Parse these ingredient lines:\n${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
}

export function buildImagePrompt(recipe: {
  name: string;
  description?: string | null;
  tags?: string[];
}): string {
  const parts = [`Professional overhead food photography of "${recipe.name}".`];
  if (recipe.description) parts.push(recipe.description);
  if (recipe.tags?.length) parts.push(`Style cues: ${recipe.tags.join(', ')}.`);
  parts.push(
    'Appetizing presentation on a rustic wooden surface, natural daylight, shallow depth of field, vibrant but realistic colors. No text, no logos, no people.',
  );
  return parts.join(' ');
}
