import type { ReactNode } from 'react';

type Variant = 'default' | 'compact' | 'accent' | 'recipe-tag';

type Props = {
  children: ReactNode;
  variant?: Variant;
  onRemove?: () => void;
};

const variantClasses: Record<Variant, string> = {
  default: 'h-[30px] rounded-lg bg-pill-bg text-pill-text px-2 text-xs font-medium',
  compact: 'h-5 rounded-sm bg-bg-toggle text-text-muted px-2 text-xs font-medium',
  accent: 'h-6 rounded-full bg-accent-soft text-accent-text px-2.5 text-xs font-normal',
  'recipe-tag': 'h-6 rounded-sm bg-bg-toggle text-text-body px-2 text-xs font-normal',
};

export default function Pill({ children, variant = 'default', onRemove }: Props) {
  return (
    <span className={`inline-flex items-center gap-1 ${variantClasses[variant]}`}>
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-pill-text/10"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M3 3 L9 9 M9 3 L3 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
