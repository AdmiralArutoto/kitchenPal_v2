import Modal from './Modal';
import Button from './Button';

type Props = {
  open: boolean;
  onClose: () => void;
  value: string[];
  onChange: (next: string[]) => void;
  availableTags: string[];
};

// Tag multi-select as a modal dialog (replaces the old dropdown popover). OR semantics — selecting
// any tag includes recipes with at least one match. Opened from the Catalog "Filter" button and the
// "+N" overflow chip.
export default function FilterDialog({ open, onClose, value, onChange, availableTags }: Props) {
  if (!open) return null;

  function toggle(tag: string) {
    onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);
  }

  const count = value.length;

  return (
    <Modal open ariaLabel="Filter by tags" onClose={onClose} size="sm">
      <div className="flex flex-col gap-5 p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-text-default">Filter by tags</h2>
            <p className="text-sm text-text-muted">
              {count > 0 ? `${count} selected` : 'Show recipes matching any selected tag'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-toggle"
          >
            <XIcon />
          </button>
        </header>

        {availableTags.length === 0 ? (
          <p className="text-sm text-text-muted">No tags yet.</p>
        ) : (
          <div className="scrollbar-thin -mx-1 flex max-h-[50vh] flex-wrap gap-2 overflow-y-auto px-1">
            {availableTags.map((tag) => {
              const active = value.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(tag)}
                  className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary text-white'
                      : 'border border-border-subtle bg-bg-card text-text-body hover:bg-bg-toggle'
                  }`}
                >
                  {active && <CheckIcon />}
                  {tag}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-4">
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={count === 0}
            className="text-sm font-medium text-text-muted hover:text-text-default disabled:opacity-50"
          >
            Clear all
          </button>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 8 7 12 13 4" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
