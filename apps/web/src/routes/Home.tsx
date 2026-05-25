import { useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { useCreateRecipe } from '../hooks/useRecipes';
import { useToast } from '../contexts/ToastContext';
import type { Draft, FullRecipeResponse } from '../types/api';
import Hero from '../components/Hero';
import GenBar from '../components/GenBar';
import Card from '../components/Card';
import Pill from '../components/Pill';
import AssistPanel from '../components/AssistPanel';
import DraftsPanel from '../components/DraftsPanel';
import FinalRecipePanel from '../components/FinalRecipePanel';

const CATEGORIES = [
  { emoji: '🍝', label: 'Italian' },
  { emoji: '🍜', label: 'Asian' },
  { emoji: '🍰', label: 'Desserts' },
  { emoji: '🥗', label: 'Vegetarian' },
  { emoji: '⚡', label: 'Quick Meals' },
  { emoji: '🐟', label: 'Seafood' },
];

const FEATURED_RECIPES = [
  { title: 'Grilled Fish with Herbs', cookingTime: 25, servings: 2, tags: ['Seafood', 'Healthy'] },
  { title: 'Gourmet Plated Dinner', cookingTime: 45, servings: 4, tags: ['Gourmet', 'Vegetarian'] },
  { title: 'Fresh Pasta Carbonara', cookingTime: 30, servings: 3, tags: ['Italian', 'Pasta'] },
  { title: 'Eggplant Plated Cuisine', cookingTime: 40, servings: 2, tags: ['Vegetarian', 'Mediterranean'] },
  { title: 'Berry Breakfast Bowl', cookingTime: 10, servings: 1, tags: ['Breakfast', 'Quick'] },
  { title: 'Pasta Ingredients Prep', cookingTime: 15, servings: 4, tags: ['Italian', 'Quick'] },
];

type Phase = 'idle' | 'assist' | 'drafts' | 'final';
type Busy = 'drafts' | 'full' | 'regenerate' | null;

export default function Home() {
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
    setRecipe(null);
    setDrafts([]);
    setPills([]);
    setPrompt('');
    setPhase('idle');
    setError(null);
    showToast('Recipe saved — generating image…', 'success');
  }

  function onDeleteFinal() {
    setRecipe(null);
    setPhase('idle');
    setError(null);
  }

  function onAssistClose() {
    setPhase('idle');
  }

  const dimmed = phase === 'drafts' || phase === 'final';

  return (
    <>
      <Hero />
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

      {error && (
        <div className="mx-auto w-full max-w-[1024px] px-6 pt-4">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {phase === 'assist' && (
        <section className="bg-bg-page">
          <div className="mx-auto w-full max-w-[1024px] px-6 pt-6">
            <AssistPanel
              onSelect={(pill) =>
                setPills((prev) => (prev.includes(pill) ? prev : [...prev, pill]))
              }
              onClose={onAssistClose}
            />
          </div>
        </section>
      )}

      {phase === 'drafts' && drafts.length > 0 && (
        <section className="bg-bg-page">
          <div className="mx-auto w-full max-w-[1024px] px-6 pt-6">
            <DraftsPanel
              drafts={drafts}
              onSelect={onSelectDraft}
              onRegenerate={onGenerate}
              loading={busy === 'drafts'}
              selecting={busy === 'full'}
            />
          </div>
        </section>
      )}

      {phase === 'final' && recipe && (
        <section className="bg-bg-page">
          <div className="mx-auto w-full max-w-[1024px] px-6 pt-6">
            <FinalRecipePanel
              recipe={recipe}
              onDelete={onDeleteFinal}
              onEdit={setRecipe}
              onRegenerate={onRegenerate}
              onApprove={onApprove}
              regenerating={busy === 'regenerate'}
              approving={false}
            />
          </div>
        </section>
      )}

      <section className="bg-bg-page">
        <div className="mx-auto w-full max-w-[1024px] px-6 py-10">
          <h2 className="mb-6 text-2xl font-semibold text-text-default">Browse by Category</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {CATEGORIES.map((cat) => (
              <Card
                key={cat.label}
                variant="bordered"
                padding="none"
                className="flex flex-col items-center justify-center gap-2 py-5"
              >
                <span className="text-3xl" aria-hidden="true">
                  {cat.emoji}
                </span>
                <span className="text-sm font-medium text-text-default">{cat.label}</span>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-bg-page">
        <div className="mx-auto w-full max-w-[1024px] px-6 pb-12">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-text-default">Featured Recipes</h2>
            <a href="#" className="text-sm font-medium text-primary hover:text-primary-hover">
              View All →
            </a>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURED_RECIPES.map((r) => (
              <Card key={r.title} variant="bordered" padding="none" className="overflow-hidden">
                <div className="h-32 bg-bg-input" aria-hidden="true" />
                <div className="p-4">
                  <h3 className="text-base font-semibold text-text-default">{r.title}</h3>
                  <div className="mt-2 flex gap-3 text-xs text-text-muted">
                    <span>⏱ {r.cookingTime} min</span>
                    <span>🍽 {r.servings} servings</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {r.tags.map((tag) => (
                      <Pill key={tag} variant="recipe-tag">
                        {tag}
                      </Pill>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
