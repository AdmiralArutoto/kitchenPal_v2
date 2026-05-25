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

export async function callOpenAIJson<T>(opts: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodSchema<T>;
}): Promise<T> {
  let raw: string | null = null;
  try {
    const completion = await openai.chat.completions.create({
      model: opts.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userPrompt },
      ],
    });
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
