import { forwardRef, type ComponentProps } from 'react';

type Props = ComponentProps<'input'>;

const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`h-9 w-full rounded-lg border border-transparent bg-bg-input px-3 py-1 text-sm text-text-default placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-bg-page disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...rest}
    />
  );
});

export default Input;
