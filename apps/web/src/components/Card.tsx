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
    'shadow-[0px_4px_20px_rgba(62,86,65,0.06),0px_1px_3px_rgba(62,86,65,0.04)]',
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
