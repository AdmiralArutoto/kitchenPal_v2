import { useId, type ReactNode } from 'react';

type Props = {
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string }) => ReactNode;
};

export default function FormField({ label, hint, error, children }: Props) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-text-default">
        {label}
      </label>
      {children({ id })}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
