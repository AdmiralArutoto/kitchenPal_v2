import { forwardRef, type ComponentProps } from 'react';

type Props = ComponentProps<'textarea'>;

// Multi-line counterpart of Input. Same `bg-bg-input` default + focus ring.
// Override via className for surfaces that need a different bg (e.g. modify panel).
const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { className = '', rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={`w-full resize-none rounded-lg border border-transparent bg-bg-input px-3 py-2 text-sm text-text-default placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-bg-page disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...rest}
    />
  );
});

export default Textarea;
