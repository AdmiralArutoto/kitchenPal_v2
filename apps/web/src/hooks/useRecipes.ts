import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import type { RecipeBody } from '../lib/recipe';
import type { Recipe } from '../types/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const RECIPES_KEY = ['recipes'] as const;

export function useRecipes() {
  const { session } = useAuth();
  return useQuery<Recipe[]>({
    queryKey: RECIPES_KEY,
    queryFn: () => apiFetch<Recipe[]>('/api/recipes'),
    enabled: !!session,
  });
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { showToast } = useToast();

  return useMutation<Recipe, Error, RecipeBody, { prev: Recipe[] | undefined; tempId: string }>({
    mutationFn: (body) =>
      apiFetch<Recipe>('/api/recipes', { method: 'POST', body: JSON.stringify(body) }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: RECIPES_KEY });
      const prev = qc.getQueryData<Recipe[]>(RECIPES_KEY);
      const tempId = `temp-${crypto.randomUUID()}`;
      const nowIso = new Date().toISOString();
      const optimistic: Recipe = {
        ...body,
        id: tempId,
        userId: user?.id ?? '',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      qc.setQueryData<Recipe[]>(RECIPES_KEY, (old) => [optimistic, ...(old ?? [])]);
      return { prev, tempId };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(RECIPES_KEY, ctx.prev);
      showToast('Failed to save recipe. Please try again.', 'error');
    },
    onSuccess: (real, _body, ctx) => {
      qc.setQueryData<Recipe[]>(RECIPES_KEY, (old) =>
        (old ?? []).map((r) => (r.id === ctx.tempId ? real : r)),
      );
    },
  });
}

export function useUpdateRecipe() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  return useMutation<
    Recipe,
    Error,
    { id: string; body: RecipeBody },
    { prev: Recipe[] | undefined }
  >({
    mutationFn: ({ id, body }) =>
      apiFetch<Recipe>(`/api/recipes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: RECIPES_KEY });
      const prev = qc.getQueryData<Recipe[]>(RECIPES_KEY);
      const nowIso = new Date().toISOString();
      qc.setQueryData<Recipe[]>(RECIPES_KEY, (old) =>
        (old ?? []).map((r) => (r.id === id ? { ...r, ...body, updatedAt: nowIso } : r)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(RECIPES_KEY, ctx.prev);
      showToast('Failed to save changes. Please try again.', 'error');
    },
    onSuccess: (real) => {
      qc.setQueryData<Recipe[]>(RECIPES_KEY, (old) =>
        (old ?? []).map((r) => (r.id === real.id ? real : r)),
      );
    },
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  return useMutation<void, Error, string, { prev: Recipe[] | undefined }>({
    mutationFn: (id) =>
      apiFetch<void>(`/api/recipes/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: RECIPES_KEY });
      const prev = qc.getQueryData<Recipe[]>(RECIPES_KEY);
      qc.setQueryData<Recipe[]>(RECIPES_KEY, (old) => (old ?? []).filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(RECIPES_KEY, ctx.prev);
      showToast('Failed to delete recipe. Please try again.', 'error');
    },
  });
}
