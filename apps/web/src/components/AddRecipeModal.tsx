import { useEffect, useRef, useState } from 'react';
import { useCreateRecipe } from '../hooks/useRecipes';
import Modal from './Modal';
import Button from './Button';
import RecipeEditForm, { type RecipeFormValues } from './RecipeEditForm';

type Props = {
  onClose: () => void;
};

type ImageMode = 'none' | 'upload' | 'generate';

const EMOJIS = ['🍝', '🥗', '🍕', '🥘', '🍳', '🍔', '🌮', '🍣', '🍜', '🥪', '🥟', '🍲', '🥞', '🍱', '🍰'];

// Add Recipe modal from Figma 8:9872. Wraps RecipeEditForm; emoji auto-assigned at mount.
// Image picker is rendered as the form's imageSlot; on save the chosen path
// (upload | generate | skip) fires the matching image mutation after create resolves.
export default function AddRecipeModal({ onClose }: Props) {
  const [emoji] = useState(() => EMOJIS[Math.floor(Math.random() * EMOJIS.length)]!);
  const [imageMode, setImageMode] = useState<ImageMode>('none');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useCreateRecipe();

  // Revoke any previous preview blob URL when it changes or the modal unmounts.
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

  function handleSave(values: RecipeFormValues) {
    const imageWork =
      imageMode === 'upload' && imageFile
        ? ({ type: 'upload', file: imageFile } as const)
        : imageMode === 'generate'
          ? ({ type: 'generate' } as const)
          : undefined;

    createMutation.mutate({
      body: {
        name: values.name,
        description: values.description,
        ingredients: values.ingredients,
        steps: values.steps,
        tags: values.tags,
        cookingTime: values.cookingTime,
        servings: values.servings,
        emoji: values.emoji ?? emoji,
        source: 'manual',
      },
      imageWork,
    });
    onClose();
  }

  const imageSlot = (
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

  return (
    <Modal open ariaLabel="Add new recipe" onClose={onClose} size="lg">
      <RecipeEditForm
        title="Add New Recipe"
        subtitle="Create a new recipe for your collection"
        initialValues={{
          name: '',
          description: null,
          cookingTime: null,
          servings: 2,
          ingredients: [],
          steps: [],
          tags: [],
          emoji,
        }}
        onCancel={onClose}
        onSave={handleSave}
        saving={false}
        submitLabel="Add Recipe"
        imageSlot={imageSlot}
      />
    </Modal>
  );
}
