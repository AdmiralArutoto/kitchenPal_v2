import type { ComponentProps, ReactNode } from 'react';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'chip';
type Size = 'sm' | 'md';

type Props = {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
} & ComponentProps<'button'>;

const variantClasses: Record<Variant, string> = {
  primary:
    'rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed',
  accent:
    'rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed',
  secondary:
    'rounded-lg bg-bg-card text-text-default border border-border-subtle hover:bg-bg-toggle disabled:opacity-60 disabled:cursor-not-allowed',
  ghost:
    'rounded-lg bg-transparent text-text-default hover:bg-bg-toggle disabled:opacity-60 disabled:cursor-not-allowed',
  chip:
    'rounded-full bg-bg-page text-text-body border border-border-subtle hover:bg-bg-toggle disabled:opacity-60 disabled:cursor-not-allowed',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-sm',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...rest
}: Props) {
  const base =
    'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
  const width = fullWidth ? 'w-full' : '';
  return (
    <button
      className={`${base} ${variantClasses[variant]} ${sizeClasses[size]} ${width} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
