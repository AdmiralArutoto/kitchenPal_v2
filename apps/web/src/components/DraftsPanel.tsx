import type { Draft } from '../types/api';
import Panel from './Panel';
import Pill from './Pill';

type Props = {
  drafts: Draft[];
  onSelect: (draft: Draft) => void;
  onRegenerate: () => void;
  loading?: boolean;
  selecting?: boolean;
};

// Inline drafts panel — Figma 8:3514.
// Header bar (bg-page) with title + reload button. Body: 3 stacked draft buttons.
// `loading` while drafts are being regenerated; `selecting` while a full recipe is being fetched.
export default function DraftsPanel({
  drafts,
  onSelect,
  onRegenerate,
  loading = false,
  selecting = false,
}: Props) {
  const busy = loading || selecting;
  return (
    <Panel padding="none" className="overflow-hidden">
      <header className="flex items-center justify-between border-b border-black/10 bg-bg-page px-4 py-4">
        <h3 className="text-lg font-semibold text-text-default">Choose a recipe to generate</h3>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={busy}
          aria-label="Regenerate drafts"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-toggle hover:text-text-default disabled:opacity-50"
        >
          <RefreshIcon />
        </button>
      </header>

      <div className="flex flex-col gap-3 p-6">
        {selecting && (
          <p className="text-sm text-text-muted">Generating full recipe…</p>
        )}
        {drafts.map((d) => (
          <button
            key={d.title}
            type="button"
            onClick={() => onSelect(d)}
            disabled={busy}
            className="rounded-[10px] border border-border-subtle p-4 text-left transition-colors hover:bg-bg-page disabled:opacity-60 disabled:hover:bg-bg-card"
          >
            <h4 className="text-base font-semibold text-text-default">{d.title}</h4>
            <p className="mt-1 text-sm font-medium text-text-muted">{d.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {d.keyIngredients.map((ki) => (
                <Pill key={ki} variant="compact">
                  {ki}
                </Pill>
              ))}
            </div>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
    </svg>
  );
}
