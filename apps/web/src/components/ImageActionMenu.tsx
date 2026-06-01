import { useEffect, useRef, useState, type ReactNode } from 'react';

export type ImageMenuAction = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

// Compact overlay menu for image actions (Generate / Upload / Remove…). Sits at the top-right
// INSIDE a `relative` image container with a slight inset. Click-outside + ESC to close (same
// pattern as AvatarMenu). Shared by RecipeModal (existing recipe) and useImagePicker (create flow).
export default function ImageActionMenu({
  actions,
  ariaLabel = 'Image options',
}: {
  actions: ImageMenuAction[];
  ariaLabel?: string;
}) {
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

  return (
    <div ref={rootRef} className="absolute right-2 top-2 z-10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-white/90 text-text-default shadow-sm backdrop-blur-sm transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <DotsIcon />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-border-subtle bg-bg-card shadow-[0px_10px_7.5px_-1px_rgba(0,0,0,0.1),0px_4px_3px_-1px_rgba(0,0,0,0.1)]"
        >
          <div className="py-1">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  setOpen(false);
                  action.onClick();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-bg-toggle disabled:cursor-not-allowed disabled:opacity-50 ${
                  action.danger ? 'text-danger' : 'text-text-default'
                }`}
              >
                {action.icon && (
                  <span className={action.danger ? 'text-danger' : 'text-text-muted'}>
                    {action.icon}
                  </span>
                )}
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}
