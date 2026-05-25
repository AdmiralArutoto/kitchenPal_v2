import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { RecommendationsResponse } from '../types/api';

// Daily rotation batch — backend caches by (userId, UTC date). Frontend cache key
// embeds today's date so a new day automatically lands on a fresh cache entry.
// Keeping Home open past UTC midnight: user needs to refresh to see the next day's batch.
function todayUTC(): string {
  return new Date().toISOString().split('T')[0]!;
}

export function useRecommendations() {
  const { session } = useAuth();
  return useQuery<RecommendationsResponse>({
    queryKey: ['recommendations', todayUTC()],
    queryFn: () => apiFetch<RecommendationsResponse>('/api/recommendations'),
    enabled: !!session,
  });
}
