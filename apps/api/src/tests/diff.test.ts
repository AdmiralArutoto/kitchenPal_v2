import { describe, it, expect } from 'vitest';
import { buildModifyDiff, tokenDiff } from '../lib/diff.js';

describe('buildModifyDiff — ingredients', () => {
  it('tags scale, substitution, and unchanged rows', () => {
    const { ingredients } = buildModifyDiff(
      {
        ingredients: [
          { name: 'spaghetti', amount: 200, unit: 'g' },
          { name: 'miso', amount: 3, unit: 'tbsp' },
          { name: 'parmesan', amount: 0, unit: '' },
          { name: 'lemon', amount: 1, unit: '' },
        ],
        steps: [],
      },
      {
        ingredients: [
          { name: 'spaghetti', amount: 100, unit: 'g' },
          { name: 'miso', amount: 1.5, unit: 'tbsp' },
          { name: 'nutritional yeast', amount: 0, unit: '' },
          { name: 'lemon', amount: 1, unit: '' },
        ],
        steps: [],
      },
    );

    expect(ingredients).toEqual([
      { status: 'changed', old: '200 g spaghetti', new: '100 g spaghetti' },
      { status: 'changed', old: '3 tbsp miso', new: '1.5 tbsp miso' },
      { status: 'changed', old: 'parmesan', new: 'nutritional yeast' },
      { status: 'unchanged', old: '1 lemon', new: '1 lemon' },
    ]);
  });

  it('flags pure additions and removals', () => {
    const { ingredients } = buildModifyDiff(
      { ingredients: [{ name: 'butter', amount: 2, unit: 'tbsp' }], steps: [] },
      { ingredients: [{ name: 'olive oil', amount: 1, unit: 'tbsp' }], steps: [] },
    );
    expect(ingredients).toEqual([
      { status: 'changed', old: '2 tbsp butter', new: '1 tbsp olive oil' },
    ]);

    const removed = buildModifyDiff(
      { ingredients: [{ name: 'salt', amount: 1, unit: 'tsp' }], steps: [] },
      { ingredients: [], steps: [] },
    );
    expect(removed.ingredients).toEqual([{ status: 'removed', old: '1 tsp salt' }]);
  });
});

describe('buildModifyDiff — steps', () => {
  it('keeps unchanged steps and word-highlights changed ones', () => {
    const { steps } = buildModifyDiff(
      {
        ingredients: [],
        steps: ['Boil pasta in salted water.', 'Melt butter, whisk in miso.'],
      },
      {
        ingredients: [],
        steps: ['Boil pasta in salted water.', 'Melt vegan butter, whisk in miso.'],
      },
    );

    expect(steps[0]).toEqual({
      status: 'unchanged',
      old: 'Boil pasta in salted water.',
      tokens: ['Boil', 'pasta', 'in', 'salted', 'water.'].map((text) => ({ text, changed: false })),
    });
    expect(steps[1]).toEqual({
      status: 'changed',
      old: 'Melt butter, whisk in miso.',
      tokens: [
        { text: 'Melt', changed: false },
        { text: 'vegan', changed: true },
        { text: 'butter,', changed: false },
        { text: 'whisk', changed: false },
        { text: 'in', changed: false },
        { text: 'miso.', changed: false },
      ],
    });
  });
});

describe('tokenDiff', () => {
  it('flags only inserted words in the new text', () => {
    expect(tokenDiff('add salt', 'add a pinch of salt')).toEqual([
      { text: 'add', changed: false },
      { text: 'a', changed: true },
      { text: 'pinch', changed: true },
      { text: 'of', changed: true },
      { text: 'salt', changed: false },
    ]);
  });
});
