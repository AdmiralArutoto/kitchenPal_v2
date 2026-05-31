// Shown in place of the emoji while a recipe's AI image is generating in the background (after
// create). Same gradient block as RecipeCard's emoji fallback + a spinner. Used by RecipeCard and
// RecipeModal so the loader carries over even after the create/draft modal closes.
export default function ImageGeneratingPlaceholder({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 bg-[linear-gradient(139deg,var(--color-accent-soft)_0%,var(--color-card-blob-pink)_50%,var(--color-card-blob-yellow)_100%)] ${className}`}
      aria-label="Generating image"
    >
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/70 border-t-transparent" aria-hidden="true" />
      <span className="text-xs font-medium text-text-body">Generating image…</span>
    </div>
  );
}
