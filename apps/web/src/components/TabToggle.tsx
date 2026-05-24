type Option<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  options: [Option<T>, Option<T>];
  value: T;
  onChange: (next: T) => void;
};

export default function TabToggle<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <div
      role="tablist"
      className="flex h-11 w-full items-center gap-2 rounded-[10px] bg-bg-toggle p-1"
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(opt.value)}
            className={`h-9 flex-1 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-bg-card text-text-default shadow-[0px_1px_1.5px_rgba(0,0,0,0.1),0px_1px_1px_rgba(0,0,0,0.1)]'
                : 'text-text-muted hover:text-text-default'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
