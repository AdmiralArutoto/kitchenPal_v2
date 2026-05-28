type Props = {
  sourceUrl?: string | null;
  sourcePlatform?: string | null;
  sourceCreator?: string | null;
};

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// "From {creator} · {host}" attribution strip for imported recipes. Renders nothing when there's
// nothing to attribute. Used in the import draft review and in RecipeModal view mode.
export default function SourceAttribution({ sourceUrl, sourcePlatform, sourceCreator }: Props) {
  if (!sourceUrl && !sourceCreator && !sourcePlatform) return null;

  const where = sourceUrl ? hostLabel(sourceUrl) : (sourcePlatform ?? null);
  const parts = [sourceCreator, where].filter((p): p is string => Boolean(p));
  const label = parts.length ? `From ${parts.join(' · ')}` : 'Imported';

  const inner = (
    <span className="inline-flex items-center gap-1.5">
      <LinkIcon />
      {label}
    </span>
  );

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-page px-3 py-2 text-sm text-text-muted">
      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex hover:text-primary hover:underline"
        >
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
}

function LinkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
