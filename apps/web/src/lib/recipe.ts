import type { Recipe, RecipeSource } from '../types/api';

export type RecipeBody = {
  name: string;
  description: string | null;
  ingredients: Recipe['ingredients'];
  steps: string[];
  tags: string[];
  cookingTime: number | null;
  servings: number | null;
  emoji: string | null;
  imageUrl?: string | null;
  source: RecipeSource;
  sourceUrl?: string | null;
  sourcePlatform?: string | null;
  sourceCreator?: string | null;
};

export function toRecipeBody(recipe: Recipe): RecipeBody {
  return {
    name: recipe.name,
    description: recipe.description,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    tags: recipe.tags,
    cookingTime: recipe.cookingTime,
    servings: recipe.servings,
    emoji: recipe.emoji,
    source: recipe.source,
    sourceUrl: recipe.sourceUrl,
    sourcePlatform: recipe.sourcePlatform,
    sourceCreator: recipe.sourceCreator,
  };
}

// Common cooking fractions, used to render amounts as "1/2" instead of "0.5".
const FRACTION_LABELS: [value: number, label: string][] = [
  [1 / 8, '1/8'],
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [3 / 8, '3/8'],
  [1 / 2, '1/2'],
  [5 / 8, '5/8'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
  [7 / 8, '7/8'],
];

// Render a numeric amount as a cooking-friendly mixed fraction: 0.5 → "1/2", 1.5 → "1 1/2",
// 0.25 → "1/4", 1.75 → "1 3/4". Falls back to a trimmed decimal for values that aren't a common
// fraction. Returns "" for ~0 so a fallback ingredient (amount 0, free text held in the unit)
// renders without a stray leading "0". Inverse of parseAmount.
export function formatAmount(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 1e-6) return '';
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.02) return String(whole);
  const hit = FRACTION_LABELS.find(([value]) => Math.abs(frac - value) < 0.02);
  if (hit) return whole === 0 ? hit[1] : `${whole} ${hit[1]}`;
  return String(Math.round(n * 100) / 100); // trimmed-decimal fallback
}

// Parse an editable amount string back into { amount, unit }. Accepts mixed fractions
// ("1 1/2 cup"), bare fractions ("3/4 tsp"), and decimals ("0.5 cup", "2 cloves"). Returns null
// when there's no leading number (the caller then treats the whole string as a free-text unit).
export function parseAmount(s: string): { amount: number; unit: string } | null {
  const trimmed = s.trim();

  let m = trimmed.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)\b\s*(.*)$/); // "1 1/2 cup"
  if (m) {
    const denom = Number(m[3]);
    if (denom) return { amount: Number(m[1]) + Number(m[2]) / denom, unit: (m[4] ?? '').trim() };
  }

  m = trimmed.match(/^(\d+)\s*\/\s*(\d+)\b\s*(.*)$/); // "3/4 tsp"
  if (m) {
    const denom = Number(m[2]);
    if (denom) return { amount: Number(m[1]) / denom, unit: (m[3] ?? '').trim() };
  }

  m = trimmed.match(/^([\d.]+)\s*(.*)$/); // "0.5 cup" / "2 cloves"
  if (m) {
    const amount = parseFloat(m[1]!);
    if (!isNaN(amount)) return { amount, unit: (m[2] ?? '').trim() };
  }

  return null;
}

// Display-side unit abbreviations (presentation only — stored data is untouched unless re-saved).
const UNIT_ABBREVIATIONS: Record<string, string> = {
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
};

// Abbreviate spelled-out units for display: "teaspoons" → "tsp", "tablespoon" → "tbsp"
// (case-insensitive). Anything else (cup, clove, free text) passes through unchanged.
export function formatUnit(unit: string): string {
  return UNIT_ABBREVIATIONS[unit.trim().toLowerCase()] ?? unit;
}
