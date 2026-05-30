import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import {
  importFromUrl,
  importFromText,
  importFromImage,
  importDraftToFormValues,
  pollImport,
} from '../lib/import';
import { useCreateRecipe } from '../hooks/useRecipes';
import { useToast } from '../contexts/ToastContext';
import type { ImportResult } from '../types/api';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Textarea from './Textarea';
import TabToggle from './TabToggle';
import RecipeEditForm, { type RecipeFormValues } from './RecipeEditForm';
import SourceAttribution from './SourceAttribution';

type Props = {
  onClose: () => void;
};

type Phase = 'entry' | 'extracting' | 'paste' | 'draft';

const SOURCE_BADGES = ['🌐 Web', 'Instagram', 'TikTok', 'YouTube'];

// Recipe import flow: paste URL → extract → review → save. Falls back to manual paste when the URL
// path fails (blocked site, no recipe found, video URL). The draft is reviewed/edited via the
// shared RecipeEditForm and saved through useCreateRecipe with source: 'imported'.
export default function ImportModal({ onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('entry');
  const [url, setUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [fallbackMode, setFallbackMode] = useState<'text' | 'image'>('text');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageComment, setImageComment] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useCreateRecipe();
  const { showToast } = useToast();

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

  async function runUrlExtract() {
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    setError(null);
    setBusy(true);
    setPhase('extracting');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const start = await importFromUrl(trimmed, controller.signal);
      if (start.status === 'done') {
        setResult(start);
        setPhase('draft');
        return;
      }
      // Instagram → async Apify job: poll until done / failed / client cap.
      const job = {
        runId: start.runId,
        datasetId: start.datasetId,
        url: start.url,
        platform: start.platform,
      };
      const deadline = Date.now() + 120_000;
      for (;;) {
        await delay(4000, controller.signal);
        const poll = await pollImport(job, controller.signal);
        if (poll.status === 'done') {
          setResult(poll);
          setPhase('draft');
          return;
        }
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
    });
    showToast('Recipe imported to your catalog', 'success');
    onClose();
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
              <Button type="button" onClick={runUrlExtract} disabled={!url.trim() || busy}>
                Extract recipe
              </Button>
            </div>
          </>
        )}

        {phase === 'extracting' && (
          <>
            <div className="truncate rounded-lg bg-bg-input px-3 py-2 text-sm text-text-muted">
              {url}
            </div>
            <ExtractProgress />
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
                  <Button type="button" onClick={runImageExtract} disabled={!imageFile || busy}>
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

// Timed 2-step indicator. Steps animate on a timer (website extraction is ~2–5s); not tied to real
// server progress — that arrives with the SSE upgrade alongside the video pipeline.
function ExtractProgress() {
  const steps = ['Fetching the source', 'Extracting the recipe'];
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setActive(1), 1600);
    return () => clearTimeout(t);
  }, []);

  return (
    <ul className="flex flex-col gap-3">
      {steps.map((label, i) => {
        const state = i < active ? 'done' : i === active ? 'active' : 'pending';
        return (
          <li key={label} className="flex items-center gap-3 text-sm">
            <StepDot state={state} />
            <span className={state === 'pending' ? 'text-text-placeholder' : 'text-text-default'}>
              {label}
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
