import { useEffect, useRef, useState } from 'react';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  availableTags: string[];
};

// Tag multi-select popover for /catalog. Replaces the stub Filter button.
// Closes on outside click + Escape. OR semantics — selecting any tag includes recipes
// that have at least one match (matches backend `?tags=a,b` behavior).
export default function FilterPopover({ value, onChange, availableTags }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(tag: string) {
    onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);
  }

  const count = value.length;
  const label = count > 0 ? `Filter (${count})` : 'Filter';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex h-9 items-center gap-2 rounded-lg border bg-bg-card px-3 text-sm font-medium hover:bg-bg-toggle ${
          count > 0
            ? 'border-primary text-primary'
            : 'border-border-subtle text-text-default'
        }`}
      >
        <FilterIcon />
        <span>{label}</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute right-0 z-20 mt-1 min-w-[200px] max-w-[280px] overflow-hidden rounded-lg border border-border-subtle bg-bg-card shadow-md"
        >
          {availableTags.length === 0 ? (
            <p className="px-3 py-3 text-sm text-text-muted">No tags yet.</p>
          ) : (
            <>
              <ul className="max-h-[260px] overflow-y-auto py-1">
                {availableTags.map((tag) => {
                  const checked = value.includes(tag);
                  return (
                    <li key={tag}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={checked}
                        onClick={() => toggle(tag)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                          checked
                            ? 'bg-bg-toggle text-text-default'
                            : 'text-text-default hover:bg-bg-toggle'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked
                              ? 'border-primary bg-primary text-white'
                              : 'border-border-subtle bg-bg-card'
                          }`}
                        >
                          {checked && <CheckIcon />}
                        </span>
                        <span className="truncate">{tag}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="block w-full border-t border-border-subtle px-3 py-2 text-left text-xs font-medium text-text-muted hover:bg-bg-page hover:text-text-default"
                >
                  Clear all
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FilterIcon() {
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
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="10"
      height="10"
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
