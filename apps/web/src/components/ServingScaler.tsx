type Props = {
  value: number;
  min?: number;
  onChange: (next: number) => void;
};

// View-only +/- scaler from Figma 8:7024. 24x24 round bordered buttons with 12px icons.
// Decrement disabled at `min` (defaults to 1).
export default function ServingScaler({ value, min = 1, onChange }: Props) {
  const canDecrement = value > min;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => canDecrement && onChange(value - 1)}
        disabled={!canDecrement}
        aria-label="Decrease servings"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-subtle text-text-body hover:bg-bg-toggle disabled:cursor-not-allowed disabled:opacity-40"
      >
        <MinusIcon />
      </button>
      <span className="text-sm font-medium text-text-body">
        {value} {value === 1 ? 'serving' : 'servings'}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="Increase servings"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-subtle text-text-body hover:bg-bg-toggle"
      >
        <PlusIcon />
      </button>
    </div>
  );
}

function MinusIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="2" y1="6" x2="10" y2="6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="2" y1="6" x2="10" y2="6" />
      <line x1="6" y1="2" x2="6" y2="10" />
    </svg>
  );
}
