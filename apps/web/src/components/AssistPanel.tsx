import { useState } from 'react';
import Panel from './Panel';
import Button from './Button';

type Props = {
  onSelect: (pill: string) => void;
  onClose: () => void;
};

// Recipe-assist guided flow from Figma frame 8:2158.
// 4 single-choice steps; each non-Skip selection emits a pill upward.
// Closes itself after the last step or on × click.
const STEPS = [
  {
    question: 'Meal type?',
    options: ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert', 'Drink'],
  },
  {
    question: 'Cuisine?',
    options: [
      'Italian',
      'Asian',
      'Mediterranean',
      'Mexican',
      'American',
      'Middle Eastern',
      'Indian',
    ],
  },
  {
    question: 'Dietary?',
    // "None" is omitted — equivalent to Skip per SPEC §5.2
    options: ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Keto'],
  },
  {
    question: 'Vibe?',
    options: ['Quick (<30 min)', 'Budget-friendly', 'Kid-friendly', 'Meal prep'],
  },
] as const;

export default function AssistPanel({ onSelect, onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex]!;
  const total = STEPS.length;

  function advance() {
    if (stepIndex + 1 >= total) onClose();
    else setStepIndex(stepIndex + 1);
  }

  function pick(option: string) {
    onSelect(option);
    advance();
  }

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-medium text-text-default">{step.question}</h3>
          <span className="text-xs text-text-muted">
            {stepIndex + 1} / {total}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close recipe assistant"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-bg-toggle hover:text-text-default"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M4 4 L12 12 M12 4 L4 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {step.options.map((opt) => (
          <Button key={opt} variant="chip" size="sm" onClick={() => pick(opt)}>
            {opt}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={advance}>
          Skip
        </Button>
      </div>
    </Panel>
  );
}
