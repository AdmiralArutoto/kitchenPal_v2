import { useEffect, useRef, useState, type ReactNode } from 'react';
import ImageActionMenu from '../components/ImageActionMenu';

type ImageMode = 'none' | 'skip' | 'upload' | 'generate';

export type ImageWork = { type: 'upload'; file: File } | { type: 'generate' } | undefined;

// Recipe image picker shared by AddRecipeModal (new recipe) and ImportModal (imported draft),
// rendered as the RecipeEditForm imageSlot. The empty state shows three actions CENTERED inside the
// image container (Upload / Generate / Skip); once one is chosen the buttons disappear — Generate
// shows a loading cue (the real generate runs after save via useCreateRecipe → `imageWork`), Upload
// shows the preview, Skip keeps the emoji. After a choice, a top-right ImageActionMenu lets the user
// change their mind (mirrors the existing-recipe image menu).
export function useImagePicker(emoji: string): { slot: ReactNode; imageWork: ImageWork } {
  const [imageMode, setImageMode] = useState<ImageMode>('none');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke any previous preview blob URL when it changes or the host unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function pickFile(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setImageMode('upload');
  }

  function armGenerate() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(null);
    setPreviewUrl(null);
    setImageMode('generate');
  }

  // "Skip" — keep the emoji fallback, no image work. Distinct from 'none' so the centered
  // chooser stays dismissed (the top-right menu remains available to change later).
  function useEmoji() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(null);
    setPreviewUrl(null);
    setImageMode('skip');
  }

  const openFile = () => fileInputRef.current?.click();

  const imageWork: ImageWork =
    imageMode === 'upload' && imageFile
      ? { type: 'upload', file: imageFile }
      : imageMode === 'generate'
        ? { type: 'generate' }
        : undefined;

  const slot = (
    <div className="relative flex h-48 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[linear-gradient(139deg,var(--color-accent-soft)_0%,var(--color-card-blob-pink)_50%,var(--color-card-blob-yellow)_100%)]">
      {previewUrl ? (
        <img src={previewUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-7xl" aria-hidden="true">
          {emoji}
        </span>
      )}

      {imageMode === 'generate' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 text-white">
          <span
            className="h-7 w-7 animate-spin rounded-full border-2 border-white/40 border-t-white"
            aria-hidden="true"
          />
          <span className="px-3 text-center text-xs font-medium">
            AI image generates after you save
          </span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) pickFile(f);
        }}
        className="hidden"
      />

      {imageMode === 'none' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/15">
          <PickerButton onClick={openFile} icon={<UploadIcon />}>
            Upload
          </PickerButton>
          <PickerButton onClick={armGenerate} icon={<SparkleIcon />}>
            Generate with AI
          </PickerButton>
          <PickerButton onClick={useEmoji} icon={<SkipIcon />}>
            Skip
          </PickerButton>
        </div>
      ) : (
        <ImageActionMenu
          ariaLabel="Change image"
          actions={[
            { label: 'Upload', icon: <UploadIcon />, onClick: openFile },
            { label: 'Generate with AI', icon: <SparkleIcon />, onClick: armGenerate },
            { label: 'Use emoji', icon: <SkipIcon />, onClick: useEmoji },
          ]}
        />
      )}
    </div>
  );

  return { slot, imageWork };
}

function PickerButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-44 items-center gap-2 rounded-lg border border-black/10 bg-white/95 px-3 py-2 text-sm font-medium text-text-default shadow-sm transition-colors hover:bg-white"
    >
      <span className="text-text-muted">{icon}</span>
      {children}
    </button>
  );
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />
    </svg>
  );
}

function SkipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="5 4 15 12 5 20" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  );
}
