import { useState } from 'react';
import Modal from './Modal';
import Input from './Input';
import Button from './Button';
import AddRecipeModal from './AddRecipeModal';
import GenerateModal from './GenerateModal';
import ImportModal from './ImportModal';

type Props = {
  onClose: () => void;
};

type Mode = 'choose' | 'import' | 'manual' | 'generate';

// Import-first intake for "+ Add Recipe": a dominant "Import from a link" card with the URL field
// inline (paste → Import hands the URL to ImportModal, which opens on its platform-confirm step),
// plus secondary Manual (AddRecipeModal) and Generate (GenerateModal) cards. Matches v2_import_modal.
export default function AddRecipeChooser({ onClose }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [url, setUrl] = useState('');

  function startImport() {
    if (!url.trim()) return;
    setMode('import');
  }

  if (mode === 'import') return <ImportModal initialUrl={url.trim()} onClose={onClose} />;
  if (mode === 'manual') return <AddRecipeModal onClose={onClose} />;
  if (mode === 'generate') return <GenerateModal onClose={onClose} />;

  return (
    <Modal open ariaLabel="Add a recipe" onClose={onClose} size="lg">
      <div className="flex flex-col gap-5 p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-serif text-lg font-semibold text-text-default">Add a recipe</h2>
            <p className="text-sm text-text-muted">Choose how you’d like to add one</p>
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

        {/* Dominant import card */}
        <div className="flex flex-col gap-3 rounded-xl border border-accent-peach bg-accent-bg-soft p-5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">
              Recommended
            </span>
            <span className="text-accent">
              <SparkleIcon />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-text-default">Import from a link</h3>
            <p className="text-sm text-text-muted">
              Paste a reel, short, TikTok, or blog URL — we’ll extract the recipe.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              autoFocus
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  startImport();
                }
              }}
              placeholder="instagram.com/reel/Cx4hN2…"
              className="bg-bg-card"
            />
            <Button type="button" variant="accent" onClick={startImport} disabled={!url.trim()}>
              Import
            </Button>
          </div>
        </div>

        {/* Secondary options */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SecondaryCard
            kicker="Manual"
            icon={<PencilIcon />}
            title="Type it in"
            description="Full control. Best for your own recipes or pulled from a cookbook."
            onClick={() => setMode('manual')}
          />
          <SecondaryCard
            kicker="AI"
            icon={<SparkleIcon />}
            title="Generate with AI"
            description="Describe a dish — we’ll sketch a starting point."
            onClick={() => setMode('generate')}
          />
        </div>
      </div>
    </Modal>
  );
}

function SecondaryCard({
  kicker,
  icon,
  title,
  description,
  onClick,
}: {
  kicker: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1.5 rounded-xl border border-border-subtle bg-bg-card p-4 text-left transition-colors hover:border-primary hover:bg-bg-page"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-text-placeholder">
        {kicker}
      </span>
      <span className="flex items-center gap-2 text-base font-semibold text-text-default">
        <span className="text-primary">{icon}</span>
        {title}
      </span>
      <span className="text-sm text-text-muted">{description}</span>
    </button>
  );
}

function SparkleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
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
