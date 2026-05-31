import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { Recipe, ProfileResponse, RecommendationsResponse } from '../types/api';

// Same key as useRecommendations — keep in sync (the batch is cached per UTC day).
function todayUTC(): string {
  return new Date().toISOString().split('T')[0]!;
}

// On first login the React Query cache is empty, so navigating between pages would each hit the
// network. Warm the three main caches once per user so the catalog, recommendations, and account
// pages render instantly while the cache builds. Each query has staleTime: Infinity, so the
// prefetched data is reused without a refetch when the matching component mounts.
export function usePrefetchOnLogin() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;
    void qc.prefetchQuery({
      queryKey: ['recipes'],
      queryFn: () => apiFetch<Recipe[]>('/api/recipes'),
    });
    void qc.prefetchQuery({
      queryKey: ['recommendations', todayUTC()],
      queryFn: () => apiFetch<RecommendationsResponse>('/api/recommendations'),
    });
    void qc.prefetchQuery({
      queryKey: ['profile'],
      queryFn: () => apiFetch<ProfileResponse>('/api/profile'),
    });
  }, [userId, qc]);
}
