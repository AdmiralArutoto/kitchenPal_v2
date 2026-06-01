import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import {
  importFromUrl,
  importFromText,
  importFromImage,
  importDraftToFormValues,
  pollImport,
  detectPlatform,
  normalizeUrl,
  type DetectedPlatform,
} from '../lib/import';
import { useCreateRecipe } from '../hooks/useRecipes';
import { useImagePicker } from '../hooks/useImagePicker';
import { useToast } from '../contexts/ToastContext';
import type { ModifyResponse, ImportResult, ImportStage } from '../types/api';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Textarea from './Textarea';
import TabToggle from './TabToggle';
import RecipeEditForm, { type RecipeFormValues } from './RecipeEditForm';
import SourceAttribution from './SourceAttribution';

type Props = {
  onClose: () => void;
  // When the chooser already collected a URL, ImportModal opens on the platform-confirm step.
  initialUrl?: string;
};

type Phase = 'entry' | 'confirm' | 'extracting' | 'paste' | 'draft';

const SOURCE_BADGES = ['🌐 Web', 'Instagram', 'TikTok', 'YouTube'];

// Per-platform copy for the confirm card — what we'll read for each source.
const PLATFORM_META: Record<DetectedPlatform, { emoji: string; label: string; hint: string }> = {
  instagram: { emoji: '🎬', label: 'Instagram · Reel', hint: 'We’ll read the caption & comments.' },
  tiktok: { emoji: '🎵', label: 'TikTok', hint: 'We’ll read the description.' },
  youtube: { emoji: '▶️', label: 'YouTube', hint: 'We’ll read the transcript.' },
  website: { emoji: '🌐', label: 'Recipe site', hint: 'We’ll read the page.' },
  unknown: { emoji: '🔗', label: 'Link', hint: 'We’ll try to extract the recipe.' },
};

// Recipe import flow: confirm source → extract → review → save. Falls back to manual paste when the
// URL path fails (blocked site, no recipe found, video URL). The draft is reviewed/edited via the
// shared RecipeEditForm and saved through useCreateRecipe with source: 'imported'.
export default function ImportModal({ onClose, initialUrl }: Props) {
  const [phase, setPhase] = useState<Phase>(initialUrl ? 'confirm' : 'entry');
  const [url, setUrl] = useState(initialUrl ?? '');
  const [pasteText, setPasteText] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [fallbackMode, setFallbackMode] = useState<'text' | 'image'>('text');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageComment, setImageComment] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<ImportStage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useCreateRecipe();
  const { showToast } = useToast();

  // Image picker for the draft review (Upload / Generate / Skip), same as AddRecipeModal. Hook is
  // called unconditionally (before the draft early-return); emoji is just the placeholder display.
  const draftEmoji = result ? importDraftToFormValues(result.draft).emoji ?? '🍽️' : '🍽️';
  const { slot: imageSlot, imageWork } = useImagePicker(draftEmoji);

  // Abort any in-flight extraction if the modal unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Revoke the screenshot preview blob URL when it changes or the modal unmounts.
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  function pickImage(file: File) {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  }

  function isAbort(e: unknown): boolean {
    return e instanceof DOMException && e.name === 'AbortError';
  }

  function pushStage(s: ImportStage) {
    setStages((prev) => (prev[prev.length - 1] === s ? prev : [...prev, s]));
  }

  async function runUrlExtract() {
    const trimmed = url.trim() ? normalizeUrl(url) : '';
    if (!trimmed || busy) return;
    setError(null);
    setStages([]);
    setBusy(true);
    setPhase('extracting');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Website/YouTube stream stages via onStage; IG/TikTok return a pending job.
      const start = await importFromUrl(trimmed, { onStage: pushStage, signal: controller.signal });
      if (start.status === 'done') {
        setResult(start);
        setPhase('draft');
        return;
      }
      // IG/TikTok → poll for the real stage (queued → scraping → extracting). Once 'extracting'
      // (Apify done), the next poll carries finalize:true so the server runs the cascade.
      const job = {
        runId: start.runId,
        datasetId: start.datasetId,
        url: start.url,
        platform: start.platform,
      };
      const deadline = Date.now() + 120_000;
      let readyToFinalize = false;
      for (;;) {
        await delay(readyToFinalize ? 0 : 4000, controller.signal);
        const poll = await pollImport(job, { finalize: readyToFinalize, signal: controller.signal });
        if (poll.status === 'done') {
          setResult(poll);
          setPhase('draft');
          return;
        }
        pushStage(poll.stage);
        if (poll.stage === 'extracting') readyToFinalize = true;
        if (Date.now() > deadline) {
          setError('This is taking a while — try Paste text or Screenshot.');
          setPasteUrl(trimmed);
          setPhase('paste');
          return;
        }
      }
    } catch (e) {
      if (isAbort(e)) return; // Cancel already reset state.
      const message = e instanceof ApiError ? e.message : 'Extraction failed. Please try again.';
      if (e instanceof ApiError && e.status === 400) {
        setError(message);
        setPhase('entry');
      } else {
        // 422 (blocked / no recipe) or 5xx → offer manual paste, prefilled with the URL.
        setError(message);
        setPasteUrl(trimmed);
        setPhase('paste');
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function runTextExtract() {
    const text = pasteText.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await importFromText(
        { text, source_url: pasteUrl.trim() || null },
        controller.signal,
      );
      setResult(res);
      setPhase('draft');
    } catch (e) {
      if (isAbort(e)) return;
      setError(e instanceof ApiError ? e.message : 'Extraction failed. Please try again.');
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function runImageExtract() {
    if (!imageFile || busy) return;
    setError(null);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await importFromImage(
        { file: imageFile, comment: imageComment, source_url: pasteUrl.trim() || null },
        controller.signal,
      );
      setResult(res);
      setPhase('draft');
    } catch (e) {
      if (isAbort(e)) return;
      setError(e instanceof ApiError ? e.message : 'Extraction failed. Please try again.');
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function cancelExtraction() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setError(null);
    setStages([]);
    setPhase('entry');
  }

  function goToPaste() {
    setError(null);
    setPhase('paste');
  }

  function handleSave(values: RecipeFormValues) {
    if (!result) return;
    createMutation.mutate({
      body: {
        name: values.name,
        description: values.description,
        ingredients: values.ingredients,
        steps: values.steps,
        tags: values.tags,
        cookingTime: values.cookingTime,
        servings: values.servings,
        emoji: values.emoji,
        source: 'imported',
        sourceUrl: result.source_url,
        sourcePlatform: result.source_platform,
        sourceCreator: result.source_creator,
      },
      imageWork,
    });
    showToast('Recipe imported to your catalog', 'success');
    onClose();
  }

  // Inline Modify-with-AI for the draft: run the current edited values through /api/ai/modify and
  // hand the result back to RecipeEditForm (which applies it into its own fields). Mirrors the
  // RecipeModal modify path; the recipe stays a draft until the user clicks Save.
  async function handleModify(
    current: RecipeFormValues,
    comment: string,
  ): Promise<RecipeFormValues> {
    const { recipe } = await apiFetch<ModifyResponse>('/api/ai/modify', {
      method: 'POST',
      body: JSON.stringify({
        recipe: {
          name: current.name,
          description: current.description,
          ingredients: current.ingredients,
          steps: current.steps,
          tags: current.tags,
          cookingTime: current.cookingTime,
          servings: current.servings,
          emoji: current.emoji,
        },
        comment,
      }),
    });
    return {
      name: recipe.name,
      description: recipe.description,
      cookingTime: recipe.cooking_time,
      servings: recipe.servings,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      tags: recipe.tags,
      emoji: recipe.emoji,
    };
  }

  // ──────────────── draft review ────────────────
  if (phase === 'draft' && result) {
    return (
      <Modal open ariaLabel="Review imported recipe" onClose={onClose} size="lg">
        <div className="flex flex-col">
          <div className="px-5 pt-5">
            <SourceAttribution
              sourceUrl={result.source_url}
              sourcePlatform={result.source_platform}
              sourceCreator={result.source_creator}
            />
          </div>
          <RecipeEditForm
            title="Review & Save"
            subtitle="Edit anything before adding it to your collection"
            initialValues={importDraftToFormValues(result.draft)}
            onCancel={onClose}
            onSave={handleSave}
            saving={false}
            submitLabel="Save Recipe"
            imageSlot={imageSlot}
            onModify={handleModify}
          />
        </div>
      </Modal>
    );
  }

  // ──────────────── entry / extracting / paste ────────────────
  return (
    <Modal open ariaLabel="Import a recipe" onClose={onClose} size="sm">
      <div className="flex flex-col gap-5 p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-text-default">
              {phase === 'paste' ? 'Add it manually' : 'Import a recipe'}
            </h2>
            <p className="text-sm text-text-muted">
              {phase === 'paste'
                ? 'Paste the text or upload a screenshot — we’ll extract the recipe.'
                : phase === 'confirm'
                  ? 'Confirm the source, then extract.'
                  : 'Paste a link from a recipe site, Instagram, TikTok, or YouTube.'}
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

        {phase === 'entry' && (
          <>
            <div className="flex flex-wrap gap-2">
              {SOURCE_BADGES.map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center rounded-full bg-bg-toggle px-2.5 py-1 text-xs font-medium text-text-body"
                >
                  {b}
                </span>
              ))}
            </div>
            <Input
              autoFocus
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runUrlExtract();
                }
              }}
              placeholder="https://example.com/best-pasta-recipe"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={goToPaste}
                className="text-sm font-medium text-primary hover:underline"
              >
                Or paste recipe text instead
              </button>
              <Button type="button" variant="accent" onClick={runUrlExtract} disabled={!url.trim() || busy}>
                Extract recipe
              </Button>
            </div>
          </>
        )}

        {phase === 'confirm' && (
          <>
            <Input
              autoFocus
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runUrlExtract();
                }
              }}
              placeholder="instagram.com/reel/Cx4hN2…"
            />
            <DetectedSourceCard platform={detectPlatform(url)} />
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={goToPaste}
                className="text-sm font-medium text-primary hover:underline"
              >
                Or paste recipe text instead
              </button>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="button" variant="accent" onClick={runUrlExtract} disabled={!url.trim() || busy}>
                  Extract recipe
                </Button>
              </div>
            </div>
          </>
        )}

        {phase === 'extracting' && (
          <>
            <div className="truncate rounded-lg bg-bg-input px-3 py-2 text-sm text-text-muted">
              {url}
            </div>
            <ExtractProgress stages={stages} />
            <p className="text-xs text-text-placeholder">
              This can take up to a minute for videos.
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={cancelExtraction}>
                Cancel
              </Button>
            </div>
          </>
        )}

        {phase === 'paste' && (
          <>
            <TabToggle
              options={[
                { value: 'text', label: 'Paste text' },
                { value: 'image', label: 'Screenshot' },
              ]}
              value={fallbackMode}
              onChange={(v) => {
                setError(null);
                setFallbackMode(v);
              }}
            />

            {error && <p className="text-sm text-danger">{error}</p>}

            {fallbackMode === 'text' ? (
              <>
                <Textarea
                  autoFocus
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste the recipe text or caption here…"
                  rows={7}
                />
                <Input
                  type="url"
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  placeholder="Source link (optional)"
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setPhase('entry');
                    }}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Back to link
                  </button>
                  <Button
                    type="button"
                    variant="accent"
                    onClick={runTextExtract}
                    disabled={!pasteText.trim() || busy}
                  >
                    {busy ? 'Extracting…' : 'Extract recipe'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) pickImage(f);
                  }}
                  className="hidden"
                />
                {imagePreview ? (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Screenshot preview"
                      className="max-h-60 w-full rounded-lg bg-bg-input object-contain"
                    />
                    <button
                      type="button"
                      onClick={clearImage}
                      aria-label="Remove screenshot"
                      className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <XIcon />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-subtle bg-bg-input text-sm text-text-muted hover:border-primary hover:text-text-default"
                  >
                    <span className="text-2xl" aria-hidden="true">
                      🖼️
                    </span>
                    Upload a screenshot (PNG, JPG, WEBP)
                  </button>
                )}
                <Textarea
                  value={imageComment}
                  onChange={(e) => setImageComment(e.target.value)}
                  placeholder="Add a note (optional) — e.g. “make it vegan”, “ignore the intro”"
                  rows={2}
                />
                <Input
                  type="url"
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  placeholder="Source link (optional)"
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setPhase('entry');
                    }}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Back to link
                  </button>
                  <Button type="button" variant="accent" onClick={runImageExtract} disabled={!imageFile || busy}>
                    {busy ? 'Reading image…' : 'Extract recipe'}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// Platform-confirm card — shows which source we detected from the URL before extracting (display
// only; the actual classification happens server-side on Extract).
function DetectedSourceCard({ platform }: { platform: DetectedPlatform }) {
  const meta = PLATFORM_META[platform];
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-input p-3">
      <span className="text-2xl" aria-hidden="true">
        {meta.emoji}
      </span>
      <div className="flex flex-col">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-placeholder">
          {meta.label}
        </span>
        <span className="text-sm text-text-body">{meta.hint}</span>
      </div>
    </div>
  );
}

// Real progress: each stage the server reports (streamed via SSE for website/YouTube, polled for
// IG/TikTok) is rendered as it arrives — the latest is active (spinner), earlier ones are done.
const STAGE_LABELS: Record<ImportStage, string> = {
  fetching: 'Fetching the page',
  'reading-structured': 'Reading structured recipe data',
  'ai-extracting': 'Reading the page with AI',
  'parsing-ingredients': 'Parsing ingredients',
  'fetching-transcript': 'Fetching the transcript',
  transcribing: 'Generating a transcript',
  extracting: 'Extracting the recipe',
  queued: 'Starting…',
  scraping: 'Reading the post',
};

function ExtractProgress({ stages }: { stages: ImportStage[] }) {
  if (stages.length === 0) {
    return <p className="text-sm text-text-muted">Starting…</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {stages.map((stage, i) => {
        const active = i === stages.length - 1;
        return (
          <li key={`${stage}-${i}`} className="flex items-center gap-3 text-sm">
            <StepDot state={active ? 'active' : 'done'} />
            <span className={active ? 'text-text-default' : 'text-text-muted'}>
              {STAGE_LABELS[stage]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function StepDot({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }
  if (state === 'active') {
    return <span className="h-5 w-5 animate-pulse rounded-full border-2 border-primary bg-accent-soft" aria-hidden="true" />;
  }
  return <span className="h-5 w-5 rounded-full border-2 border-border-subtle" aria-hidden="true" />;
}

// Abortable sleep — rejects with AbortError when the in-flight extraction is cancelled, so the
// polling loop unwinds through the same isAbort() path as a fetch abort.
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
