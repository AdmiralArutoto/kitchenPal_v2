import type { Ingredient } from '../schemas/recipe.js';
import type { ModifyDiff } from '../schemas/ai.js';

// Deterministic recipe diff for the Modify studio: align the original recipe against the AI-modified
// one (ingredients by name, steps by text) and tag each row unchanged | changed | added | removed,
// plus word-level token highlighting for changed steps. No LLM, no dependency — pure sequence diff.

type RawOp<T> =
  | { type: 'match'; old: T; new: T }
  | { type: 'del'; old: T }
  | { type: 'ins'; new: T };

type Pair<T> = { status: 'unchanged' | 'changed' | 'added' | 'removed'; old?: T; new?: T };

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// dp[i][j] = length of the longest common subsequence of a[i:] and b[j:].
function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  return dp;
}

// Edit script (match / del / ins, in order) aligning two item sequences by a string key.
function diffSequence<T>(oldItems: T[], newItems: T[], keyFn: (t: T) => string): RawOp<T>[] {
  const a = oldItems.map(keyFn);
  const b = newItems.map(keyFn);
  const dp = lcsMatrix(a, b);
  const ops: RawOp<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ type: 'match', old: oldItems[i]!, new: newItems[j]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: 'del', old: oldItems[i]! });
      i++;
    } else {
      ops.push({ type: 'ins', new: newItems[j]! });
      j++;
    }
  }
  while (i < a.length) ops.push({ type: 'del', old: oldItems[i++]! });
  while (j < b.length) ops.push({ type: 'ins', new: newItems[j++]! });
  return ops;
}

// Collapse adjacent del/ins runs into 'changed' pairs (substitutions like Parmesan → Nutritional
// yeast), with leftovers as pure removed / added. Matches stay matches.
function pairOps<T>(ops: RawOp<T>[]): Pair<T>[] {
  const result: Pair<T>[] = [];
  let dels: T[] = [];
  let inss: T[] = [];
  const flush = () => {
    const paired = Math.min(dels.length, inss.length);
    for (let k = 0; k < paired; k++) result.push({ status: 'changed', old: dels[k], new: inss[k] });
    for (let k = paired; k < dels.length; k++) result.push({ status: 'removed', old: dels[k] });
    for (let k = paired; k < inss.length; k++) result.push({ status: 'added', new: inss[k] });
    dels = [];
    inss = [];
  };
  for (const op of ops) {
    if (op.type === 'del') dels.push(op.old);
    else if (op.type === 'ins') inss.push(op.new);
    else {
      flush();
      result.push({ status: 'unchanged', old: op.old, new: op.new });
    }
  }
  flush();
  return result;
}

// Word-level diff of two steps → tokens for the NEW step, with inserted/replaced words flagged.
export function tokenDiff(oldText: string, newText: string): { text: string; changed: boolean }[] {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const an = a.map(normalizeWord);
  const bn = b.map(normalizeWord);
  const dp = lcsMatrix(an, bn);
  const out: { text: string; changed: boolean }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (an[i] === bn[j]) {
      out.push({ text: b[j]!, changed: false });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      out.push({ text: b[j]!, changed: true });
      j++;
    }
  }
  while (j < b.length) out.push({ text: b[j++]!, changed: true });
  return out;
}

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[.,;:!?()'"]/g, '');
}

export function formatIngredient(ing: Ingredient): string {
  const amount = ing.amount ? formatAmount(ing.amount) : '';
  const head = [amount, ing.unit].filter(Boolean).join(' ');
  return [head, ing.name].filter(Boolean).join(' ').trim();
}

function formatAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

// Build the full diff between the original recipe and the AI-modified one.
export function buildModifyDiff(
  original: { ingredients?: Ingredient[]; steps?: string[] },
  modified: { ingredients: Ingredient[]; steps: string[] },
): ModifyDiff {
  const ingredients = pairOps(
    diffSequence(original.ingredients ?? [], modified.ingredients, (i) => normalize(i.name)),
  ).map(({ status, old, new: next }) => {
    const oldStr = old ? formatIngredient(old) : undefined;
    const newStr = next ? formatIngredient(next) : undefined;
    const resolved = status === 'unchanged' && oldStr !== newStr ? 'changed' : status;
    return {
      status: resolved,
      ...(oldStr !== undefined ? { old: oldStr } : {}),
      ...(newStr !== undefined ? { new: newStr } : {}),
    };
  });

  const steps = pairOps(
    diffSequence(original.steps ?? [], modified.steps, (s) => normalize(s)),
  ).map(({ status, old, new: next }) => {
    const resolved = status === 'unchanged' && old !== next ? 'changed' : status;
    const tokens =
      next !== undefined
        ? resolved === 'unchanged'
          ? tokenize(next).map((text) => ({ text, changed: false }))
          : tokenDiff(old ?? '', next)
        : [];
    return {
      status: resolved,
      ...(old !== undefined ? { old } : {}),
      tokens,
    };
  });

  return { ingredients, steps };
}
