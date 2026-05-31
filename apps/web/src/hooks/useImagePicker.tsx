import { useEffect, useRef, useState, type ReactNode } from 'react';
import Button from '../components/Button';

type ImageMode = 'none' | 'upload' | 'generate';

export type ImageWork = { type: 'upload'; file: File } | { type: 'generate' } | undefined;

// Recipe image picker (Upload / Generate with AI / Skip) shared by AddRecipeModal (new recipe)
// and ImportModal (imported draft). Renders as the RecipeEditForm imageSlot; the chosen path
// becomes `imageWork` passed to useCreateRecipe, which runs the matching image work after create.
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
    setImageMode((prev) => (prev === 'generate' ? 'none' : 'generate'));
  }

  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(null);
    setPreviewUrl(null);
    setImageMode('none');
  }

  const imageWork: ImageWork =
    imageMode === 'upload' && imageFile
      ? { type: 'upload', file: imageFile }
      : imageMode === 'generate'
        ? { type: 'generate' }
        : undefined;

  const slot = (
    <div className="flex flex-col gap-2">
      <div className="relative flex h-48 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[linear-gradient(139deg,var(--color-accent-soft)_0%,var(--color-card-blob-pink)_50%,var(--color-card-blob-yellow)_100%)]">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-7xl" aria-hidden="true">
            {emoji}
          </span>
        )}
        {imageMode === 'generate' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-medium text-white">
            ✨ AI image will generate after save
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
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
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload
        </Button>
        <Button
          type="button"
          variant={imageMode === 'generate' ? 'primary' : 'secondary'}
          size="sm"
          onClick={armGenerate}
        >
          Generate with AI
        </Button>
        {imageMode !== 'none' && (
          <button
            type="button"
            onClick={clearImage}
            className="inline-flex h-8 items-center rounded-lg border border-border-subtle bg-bg-card px-3 text-sm font-medium text-text-muted hover:bg-bg-toggle"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );

  return { slot, imageWork };
}
