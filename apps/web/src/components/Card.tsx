import type { ComponentProps, ReactNode } from 'react';

type Variant = 'shadow' | 'bordered';
type Padding = 'none' | 'sm' | 'md' | 'lg';

type Props = {
  children: ReactNode;
  variant?: Variant;
  padding?: Padding;
} & ComponentProps<'div'>;

const variantClasses: Record<Variant, string> = {
  shadow:
    'shadow-[0px_20px_25px_-5px_rgba(0,0,0,0.1),0px_8px_10px_-6px_rgba(0,0,0,0.1)]',
  bordered: 'border border-border-subtle',
};

const paddingClasses: Record<Padding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-12',
};

export default function Card({
  variant = 'shadow',
  padding = 'md',
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <div
      className={`bg-bg-card rounded-2xl ${variantClasses[variant]} ${paddingClasses[padding]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
