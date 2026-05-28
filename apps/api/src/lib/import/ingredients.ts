import {
  callOpenAIJson,
  INGREDIENT_PARSE_SYSTEM_PROMPT,
  buildIngredientParsePrompt,
  MODEL_DRAFTS,
} from '../openai.js';
import { ParsedIngredientsSchema } from '../../schemas/import.js';
import type { Ingredient } from '../../schemas/recipe.js';

// Units we recognize so "2 cups flour" → unit "cups" but "2 eggs" → no unit, name "eggs".
const UNITS = new Set([
  'cup', 'cups', 'tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tablespoon', 'tablespoons',
  'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'mg', 'ml', 'milliliter', 'milliliters',
  'l', 'liter', 'liters', 'litre', 'litres', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'pinch', 'pinches', 'dash', 'dashes', 'clove', 'cloves', 'slice', 'slices', 'can', 'cans',
  'package', 'packages', 'pkg', 'stick', 'sticks', 'handful', 'piece', 'pieces', 'sprig', 'sprigs',
  'bunch', 'bunches', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons', 'stalk', 'stalks',
]);

function parseQuantity(raw: string): number | null {
  const s = raw.trim();
  // Mixed number: "1 1/2"
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den === 0) return null;
    return whole + num / den;
  }
  // Simple fraction: "1/2"
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (den === 0) return null;
    return Number(frac[1]) / den;
  }
  // Range "2-3" → take the first number.
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*\d+(?:\.\d+)?$/);
  if (range) return Number(range[1]);
  // Plain int or decimal.
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  return null;
}

// Attempts to parse one ingredient line with regex. Returns null when no leading numeric
// quantity is confidently found — the caller routes those lines to the LLM fallback.
function parseLineRegex(line: string): Ingredient | null {
  const cleaned = line.replace(/^[\s•\-*·]+/, '').trim();
  const m = cleaned.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?)\s+(.+)$/);
  if (!m) return null;

  const amount = parseQuantity(m[1]!);
  if (amount === null) return null;

  let rest = m[2]!.trim();
  let unit = '';
  const firstWord = rest.split(/\s+/)[0] ?? '';
  const firstWordClean = firstWord.replace(/[.,]$/, '').toLowerCase();
  if (UNITS.has(firstWordClean)) {
    unit = firstWordClean;
    rest = rest.slice(firstWord.length).trim();
  }
  rest = rest.replace(/^of\s+/i, '').trim();
  if (!rest) return null;

  return { name: rest, amount, unit };
}

// Parses an array of ingredient strings into structured {name, amount, unit}.
// Regex handles the common cases for free; the remainder goes to a single batched gpt-4o-mini call.
export async function parseIngredients(lines: string[]): Promise<Ingredient[]> {
  const cleaned = lines.map((l) => l.trim()).filter(Boolean);
  if (cleaned.length === 0) return [];

  const slots: (Ingredient | null)[] = new Array(cleaned.length).fill(null);
  const unparsedIdx: number[] = [];

  cleaned.forEach((line, i) => {
    const parsed = parseLineRegex(line);
    if (parsed) slots[i] = parsed;
    else unparsedIdx.push(i);
  });

  if (unparsedIdx.length > 0) {
    const unparsedLines = unparsedIdx.map((i) => cleaned[i]!);
    const result = await callOpenAIJson({
      model: MODEL_DRAFTS,
      systemPrompt: INGREDIENT_PARSE_SYSTEM_PROMPT,
      userPrompt: buildIngredientParsePrompt(unparsedLines),
      schema: ParsedIngredientsSchema,
    });
    unparsedIdx.forEach((slotIdx, k) => {
      // Best-effort zip by order; fall back to a name-only entry if the model under-returns.
      slots[slotIdx] = result.ingredients[k] ?? {
        name: cleaned[slotIdx]!,
        amount: 0,
        unit: '',
      };
    });
  }

  return slots.filter((s): s is Ingredient => s !== null);
}
