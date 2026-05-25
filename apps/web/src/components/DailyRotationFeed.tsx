import { useRecommendations } from '../hooks/useRecommendations';
import RecommendationCard from './RecommendationCard';
import Card from './Card';

// Daily rotation section on Home. Replaces the mock Featured Recipes block.
// 6 cards, generated lazily on first request of the UTC day (~30-60s wait on first load).
export default function DailyRotationFeed() {
  const { data, isLoading, isError, refetch } = useRecommendations();

  return (
    <section className="bg-bg-page">
      <div className="mx-auto w-full max-w-[1024px] px-6 pb-12">
        <h2 className="text-2xl font-semibold text-text-default">Today's Recipes</h2>
        <p className="mt-1 text-sm text-text-muted">
          Six fresh ideas, picked for you every day.
        </p>

        {isError && (
          <div className="mt-6 flex flex-col items-start gap-2 rounded-lg border border-border-subtle bg-bg-card p-4">
            <p className="text-sm text-danger">Couldn't load today's recipes.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-sm font-medium text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {isLoading && (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} variant="bordered" padding="none" className="overflow-hidden">
                <div className="h-48 animate-pulse bg-bg-input" aria-hidden="true" />
                <div className="flex flex-col gap-2 p-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-bg-input" />
                  <div className="h-3 w-full animate-pulse rounded bg-bg-input" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-bg-input" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {data && (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.recipes.map((r, i) => (
              <RecommendationCard key={`${data.batchDate}-${i}`} recipe={r} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
