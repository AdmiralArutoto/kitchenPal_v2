type Props = {
  message: string;
  kind?: 'success' | 'error';
  onDismiss: () => void;
};

// Single toast notification. Position is owned by ToastViewport.
export default function Toast({ message, kind = 'success', onDismiss }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-card px-4 py-3 shadow-lg"
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
          kind === 'success' ? 'bg-accent-soft text-accent-text' : 'bg-danger-light text-danger'
        }`}
        aria-hidden="true"
      >
        {kind === 'success' ? (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 8 7 12 13 4" />
          </svg>
        ) : (
          <span className="text-xs font-bold leading-none">!</span>
        )}
      </span>
      <span className="text-sm text-text-default">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded text-text-muted hover:bg-bg-toggle hover:text-text-default"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
