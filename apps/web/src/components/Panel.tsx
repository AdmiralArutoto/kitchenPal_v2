import type { ComponentProps, ReactNode } from 'react';

type Padding = 'none' | 'sm' | 'md';

type Props = {
  children: ReactNode;
  padding?: Padding;
} & ComponentProps<'div'>;

const paddingClasses: Record<Padding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
};

// Floating panel chrome — white bg + subtle border + drop shadow + rounded-[10px].
// Used by AssistPanel, DraftsPanel, FinalRecipePanel.
// Distinct from `Card` because: smaller radius and the shadow+border combo.
export default function Panel({ padding = 'md', className = '', children, ...rest }: Props) {
  return (
    <div
      className={`rounded-[10px] border border-border-subtle bg-bg-card shadow-[0px_10px_7.5px_-1px_rgba(0,0,0,0.1),0px_4px_3px_-1px_rgba(0,0,0,0.1)] ${paddingClasses[padding]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
