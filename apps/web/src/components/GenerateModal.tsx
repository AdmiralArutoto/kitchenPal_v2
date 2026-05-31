import { useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { useCreateRecipe } from '../hooks/useRecipes';
import { useToast } from '../contexts/ToastContext';
import type { Draft, FullRecipeResponse } from '../types/api';
import Modal from './Modal';
import GenBar from './GenBar';
import AssistPanel from './AssistPanel';
import DraftsPanel from './DraftsPanel';
import FinalRecipePanel from './FinalRecipePanel';

type Props = {
  onClose: () => void;
};

type Phase = 'idle' | 'assist' | 'drafts' | 'final';
type Busy = 'drafts' | 'full' | 'regenerate' | null;

// AI generation, now a secondary path reached from the "+ Add Recipe" chooser. Hosts the
// prompt → drafts → full-recipe flow (formerly the Home page) inside a modal: GenBar composes the
// prompt, DraftsPanel picks a direction, FinalRecipePanel reviews/edits, Approve saves + closes.
export default function GenerateModal({ onClose }: Props) {
  const [prompt, setPrompt] = useState('');
  const [pills, setPills] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [recipe, setRecipe] = useState<FullRecipeResponse | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateRecipe();
  const { showToast } = useToast();

  function composePrompt(): string {
    const pillStr = pills.join(', ');
    const free = prompt.trim();
    if (pills.length && free) return `${pillStr}. ${free}`;
    return pills.length ? pillStr : free;
  }

  async function onGenerate() {
    if (busy) return;
    setBusy('drafts');
    setError(null);
    try {
      const result = await apiFetch<Draft[]>('/api/ai/generate-drafts', {
        method: 'POST',
        body: JSON.stringify({ prompt: composePrompt() }),
      });
      setDrafts(result);
      setPhase('drafts');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to generate drafts');
    } finally {
      setBusy(null);
    }
  }

  async function onSelectDraft(draft: Draft) {
    if (busy) return;
    setBusy('full');
    setError(null);
    try {
      const result = await apiFetch<FullRecipeResponse>('/api/ai/generate-full', {
        method: 'POST',
        body: JSON.stringify({ input: draft }),
      });
      setRecipe(result);
      setPhase('final');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to generate recipe');
    } finally {
      setBusy(null);
    }
  }

  async function onRegenerate(comment: string) {
    if (busy || !recipe) return;
    setBusy('regenerate');
    setError(null);
    try {
      const result = await apiFetch<FullRecipeResponse>('/api/ai/generate-full', {
        method: 'POST',
        body: JSON.stringify({ input: recipe, comment }),
      });
      setRecipe(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to regenerate');
    } finally {
      setBusy(null);
    }
  }

  function onApprove() {
    if (!recipe) return;
    createMutation.mutate({
      body: {
        name: recipe.name,
        description: recipe.description,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        tags: recipe.tags,
        cookingTime: recipe.cooking_time,
        servings: recipe.servings,
        emoji: recipe.emoji,
        source: 'ai_generated',
      },
      imageWork: { type: 'generate' },
    });
    showToast('Recipe saved — generating image…', 'success');
    onClose();
  }

  function onDeleteFinal() {
    setRecipe(null);
    setPhase('idle');
    setError(null);
  }

  const dimmed = phase === 'drafts' || phase === 'final';

  return (
    <Modal open ariaLabel="Generate a recipe" onClose={onClose} size="lg">
      <div className="flex flex-col">
        <header className="flex items-start justify-between gap-4 p-6 pb-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-text-default">Generate with AI</h2>
            <p className="text-sm text-text-muted">
              Describe a dish and we’ll draft it — edit before saving.
            </p>
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

        <GenBar
          value={prompt}
          onChange={setPrompt}
          pills={pills}
          onRemovePill={(p) => setPills((prev) => prev.filter((x) => x !== p))}
          onAssist={() => setPhase((cur) => (cur === 'assist' ? 'idle' : 'assist'))}
          onGenerate={onGenerate}
          generating={busy === 'drafts'}
          dimmed={dimmed}
        />

        <div className="flex flex-col gap-4 p-6">
          {error && <p className="text-sm text-danger">{error}</p>}

          {phase === 'idle' && !error && (
            <p className="text-sm text-text-muted">
              Add a few details or tap the sparkle for ideas, then Generate.
            </p>
          )}

          {phase === 'assist' && (
            <AssistPanel
              onSelect={(pill) =>
                setPills((prev) => (prev.includes(pill) ? prev : [...prev, pill]))
              }
              onClose={() => setPhase('idle')}
            />
          )}

          {phase === 'drafts' && drafts.length > 0 && (
            <DraftsPanel
              drafts={drafts}
              onSelect={onSelectDraft}
              onRegenerate={onGenerate}
              loading={busy === 'drafts'}
              selecting={busy === 'full'}
            />
          )}

          {phase === 'final' && recipe && (
            <FinalRecipePanel
              recipe={recipe}
              onDelete={onDeleteFinal}
              onEdit={setRecipe}
              onRegenerate={onRegenerate}
              onApprove={onApprove}
              regenerating={busy === 'regenerate'}
              approving={false}
            />
          )}
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
