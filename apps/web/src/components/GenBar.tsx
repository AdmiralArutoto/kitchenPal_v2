import Button from './Button';
import Pill from './Pill';

type Props = {
  value: string;
  onChange: (value: string) => void;
  pills?: string[];
  onRemovePill?: (pill: string) => void;
  onGenerate?: () => void;
  onAssist?: () => void;
  dimmed?: boolean;
  generating?: boolean;
};

// AI generate bar — Figma dY6CJtDlp8tW2RQ0k1DTL4:1:11 + 8:1775 (pills variant).
// Composite tag-input: pills + free text share one input area.
// Generate disabled when there's no content (no pills AND no text), or while generating.
// `dimmed` locks the bar (opacity-50 + pointer-events-none) while a result panel is shown.
export default function GenBar({
  value,
  onChange,
  pills = [],
  onRemovePill,
  onGenerate,
  onAssist,
  dimmed = false,
  generating = false,
}: Props) {
  const hasContent = pills.length > 0 || value.trim().length > 0;
  const placeholder = pills.length
    ? 'Add more details...'
    : "Describe a recipe you'd like to create...";

  return (
    <section className="border-b border-black/10 bg-bg-card">
      <div
        className={`mx-auto flex w-full max-w-[1024px] items-center gap-3 px-6 py-4 transition-opacity ${
          dimmed ? 'pointer-events-none opacity-50' : ''
        }`}
        aria-disabled={dimmed}
      >
        <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-primary-deep">
          <SparkleStarIcon />
          AI Generate
        </span>

        <div className="flex min-h-[38px] flex-1 flex-wrap items-center gap-1 rounded-lg bg-bg-page px-2 py-1">
          {pills.map((pill) => (
            <Pill key={pill} onRemove={onRemovePill ? () => onRemovePill(pill) : undefined}>
              {pill}
            </Pill>
          ))}
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hasContent && !generating) {
                e.preventDefault();
                onGenerate?.();
              }
            }}
            placeholder={placeholder}
            disabled={dimmed}
            className="min-w-[120px] flex-1 border-none bg-transparent text-sm text-text-default outline-none placeholder:text-text-default/50"
          />
        </div>

        <button
          type="button"
          onClick={onAssist}
          disabled={dimmed}
          aria-label="Recipe assist"
          className="inline-flex h-9 w-[42px] shrink-0 items-center justify-center rounded-lg border border-accent-peach bg-bg-card text-primary-deep hover:bg-accent-peach/20"
        >
          <SparkleIcon />
        </button>

        <Button type="button" onClick={onGenerate} disabled={!hasContent || generating}>
          {generating ? 'Generating…' : 'Generate'}
        </Button>
      </div>
    </section>
  );
}

function SparkleStarIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.667"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.281 12.917a2.32 2.32 0 0 0-1.198-1.198L1.97 10.4a.42.42 0 0 1 0-.8l5.113-1.32a2.32 2.32 0 0 0 1.197-1.197L9.6 1.97a.42.42 0 0 1 .8 0l1.32 5.113a2.32 2.32 0 0 0 1.197 1.198l5.113 1.319a.42.42 0 0 1 0 .8l-5.113 1.319a2.32 2.32 0 0 0-1.197 1.198l-1.32 5.113a.42.42 0 0 1-.8 0L8.28 12.917Z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.333"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13.573 1.573 14.427 2.427a.799.799 0 0 1 0 1.146L3.573 14.427a.798.798 0 0 1-1.146 0L1.573 13.573a.798.798 0 0 1 0-1.146L12.427 1.573a.798.798 0 0 1 1.146 0Z" />
    </svg>
  );
}
