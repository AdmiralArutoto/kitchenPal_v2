import Card from '../components/Card';

// Settings — placeholder for now. A few preview rows hint at what's planned; the controls are
// disabled until wired to the backend.
const PREVIEW: { label: string; description: string; control: 'toggle' | 'segment'; options?: string[] }[] = [
  {
    label: 'Appearance',
    description: 'Light or dark theme across the app.',
    control: 'segment',
    options: ['Light', 'Dark'],
  },
  {
    label: 'Measurement units',
    description: 'Show ingredient amounts in metric or imperial.',
    control: 'segment',
    options: ['Metric', 'Imperial'],
  },
  {
    label: 'Daily recommendations',
    description: 'Get a fresh batch of ideas every morning.',
    control: 'toggle',
  },
  {
    label: 'Email updates',
    description: 'Occasional product news and tips.',
    control: 'toggle',
  },
];

export default function Settings() {
  return (
    <div className="mx-auto flex w-full max-w-[896px] flex-col gap-8 px-6 pt-12 pb-20">
      <Card variant="bordered" padding="lg">
        <div className="flex items-center justify-between gap-3 border-b border-black/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-primary">
              <GearIcon />
            </span>
            <div>
              <h2 className="text-2xl font-semibold text-text-default">Settings</h2>
              <p className="text-sm text-text-muted">Preferences for how KitchenPal works</p>
            </div>
          </div>
          <span className="inline-flex items-center rounded-full bg-bg-toggle px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Coming soon
          </span>
        </div>

        <div className="mt-2 flex flex-col divide-y divide-black/5">
          {PREVIEW.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 py-4 opacity-60">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text-default">{row.label}</span>
                <span className="text-sm text-text-muted">{row.description}</span>
              </div>
              {row.control === 'toggle' ? (
                <span
                  aria-hidden="true"
                  className="inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-bg-toggle p-0.5"
                >
                  <span className="h-5 w-5 rounded-full bg-bg-card shadow" />
                </span>
              ) : (
                <span className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border-subtle" aria-hidden="true">
                  {row.options!.map((opt, i) => (
                    <span
                      key={opt}
                      className={`px-3 py-1.5 text-xs font-medium ${
                        i === 0 ? 'bg-bg-toggle text-text-default' : 'bg-bg-card text-text-muted'
                      }`}
                    >
                      {opt}
                    </span>
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
