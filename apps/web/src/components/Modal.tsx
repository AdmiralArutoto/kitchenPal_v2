import { useEffect, type ReactNode } from 'react';
import Panel from './Panel';

type Size = 'sm' | 'lg';

type Props = {
  open: boolean;
  onClose: () => void;
  ariaLabel?: string;
  size?: Size;
  children: ReactNode;
};

const SIZE_CLASS: Record<Size, string> = {
  sm: 'max-w-[510px]',
  lg: 'max-w-[820px]',
};

// Centered overlay modal. Wraps content in Panel chrome.
// Closes on ESC and backdrop click. Locks body scroll while open.
// Renders nothing when closed.
export default function Modal({ open, onClose, ariaLabel, size = 'sm', children }: Props) {
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
      <div className={`relative z-10 w-full ${SIZE_CLASS[size]} max-h-[90vh] overflow-y-auto`}>
        <Panel padding="none" className="relative">
          {children}
        </Panel>
      </div>
    </div>
  );
}
