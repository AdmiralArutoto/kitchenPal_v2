import { useEffect, type ReactNode } from 'react';
import Panel from './Panel';

type Props = {
  open: boolean;
  onClose: () => void;
  ariaLabel?: string;
  children: ReactNode;
};

// Centered overlay modal. Wraps content in Panel chrome.
// Closes on ESC and backdrop click. Locks body scroll while open.
// Renders nothing when closed.
export default function Modal({ open, onClose, ariaLabel, children }: Props) {
  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-[510px] max-h-[90vh] overflow-y-auto">
        <Panel padding="none" className="relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 inline-flex h-6 w-6 items-center justify-center rounded text-text-default opacity-70 hover:bg-bg-toggle hover:opacity-100"
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
          {children}
        </Panel>
      </div>
    </div>
  );
}
