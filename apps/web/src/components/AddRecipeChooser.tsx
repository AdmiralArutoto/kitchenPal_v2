import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import AddRecipeModal from './AddRecipeModal';
import ImportModal from './ImportModal';

type Props = {
  onClose: () => void;
};

type Mode = 'choose' | 'create' | 'import';

type Option = {
  mode: Mode | 'generate';
  emoji: string;
  title: string;
  description: string;
};

// Intake chooser for "+ Add Recipe" — Import / Create / Generate in priority order (import-first,
// per the product's shift toward an import-and-store app). Import opens the extraction flow,
// Create opens the manual form, Generate routes to Home's AI generation bar.
const OPTIONS: Option[] = [
  {
    mode: 'import',
    emoji: '🔗',
    title: 'Import from a link',
    description: 'Paste a recipe URL — or a caption from Instagram, TikTok, or YouTube.',
  },
  {
    mode: 'create',
    emoji: '✏️',
    title: 'Create manually',
    description: 'Write your own recipe from scratch.',
  },
  {
    mode: 'generate',
    emoji: '✨',
    title: 'Generate with AI',
    description: 'Describe a dish and let AI draft it for you.',
  },
];

export default function AddRecipeChooser({ onClose }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const navigate = useNavigate();

  if (mode === 'create') return <AddRecipeModal onClose={onClose} />;
  if (mode === 'import') return <ImportModal onClose={onClose} />;

  function pick(option: Option['mode']) {
    if (option === 'generate') {
      navigate('/home');
      onClose();
      return;
    }
    setMode(option);
  }

  return (
    <Modal open ariaLabel="Add a recipe" onClose={onClose} size="sm">
      <div className="flex flex-col gap-5 p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-text-default">Add a Recipe</h2>
            <p className="text-sm text-text-muted">How would you like to add it?</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-toggle"
          >
            <XIcon />
          </button>
        </header>

        <div className="flex flex-col gap-3">
          {OPTIONS.map((opt) => (
            <button
              key={opt.title}
              type="button"
              onClick={() => pick(opt.mode)}
              className="flex items-center gap-4 rounded-xl border border-border-subtle bg-bg-card p-4 text-left transition-colors hover:border-primary hover:bg-bg-page"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xl">
                {opt.emoji}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-text-default">{opt.title}</span>
                <span className="text-sm text-text-muted">{opt.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function XIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
