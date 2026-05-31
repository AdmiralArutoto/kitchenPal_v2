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

// Optional follow-up image work the caller wants run after a recipe is created.
// Lives on the mutation variables (NOT a per-call onSuccess) so it survives the
// component unmounting — caller modals (e.g., AddRecipeModal) typically close
// immediately after firing the mutation, which would drop a per-call callback.
export type CreateRecipeVars = {
  body: RecipeBody;
  imageWork?: { type: 'generate' } | { type: 'upload'; file: File };
};

function patchRecipeInCache(qc: ReturnType<typeof useQueryClient>, fresh: Recipe) {
  qc.setQueryData<Recipe[]>(RECIPES_KEY, (old) =>
    (old ?? []).map((r) => (r.id === fresh.id ? fresh : r)),
  );
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { showToast } = useToast();

  return useMutation<Recipe, Error, CreateRecipeVars, { prev: Recipe[] | undefined; tempId: string }>({
    mutationFn: ({ body }) =>
      apiFetch<Recipe>('/api/recipes', { method: 'POST', body: JSON.stringify(body) }),
    onMutate: async ({ body, imageWork }) => {
      await qc.cancelQueries({ queryKey: RECIPES_KEY });
      const prev = qc.getQueryData<Recipe[]>(RECIPES_KEY);
      const tempId = `temp-${crypto.randomUUID()}`;
      const nowIso = new Date().toISOString();
      const optimistic: Recipe = {
        ...body,
        id: tempId,
        userId: user?.id ?? '',
        imageUrl: body.imageUrl ?? null,
        sourceUrl: body.sourceUrl ?? null,
        sourcePlatform: body.sourcePlatform ?? null,
        sourceCreator: body.sourceCreator ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
        // Show the generating loader from first paint when image work is queued. Survives the
        // calling modal unmounting; cleared when the image work resolves/fails in onSuccess.
        imageGenerating: Boolean(imageWork),
      };
      qc.setQueryData<Recipe[]>(RECIPES_KEY, (old) => [optimistic, ...(old ?? [])]);
      return { prev, tempId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(RECIPES_KEY, ctx.prev);
      showToast('Failed to save recipe. Please try again.', 'error');
    },
    onSuccess: (real, vars, ctx) => {
      const work = vars.imageWork;
      // Server `real` has no imageGenerating field; keep the loader on until the image work
      // resolves below (it carries over to the card even if the create modal already closed).
      const merged: Recipe = work ? { ...real, imageGenerating: true } : real;
      qc.setQueryData<Recipe[]>(RECIPES_KEY, (old) =>
        (old ?? []).map((r) => (r.id === ctx.tempId ? merged : r)),
      );

      // Chain follow-up image work via direct apiFetch (not via the image hooks)
      // so it runs even if the calling component has already unmounted.
      if (!work) return;

      const apply = work.type === 'upload'
        ? () => {
            const fd = new FormData();
            fd.append('file', work.file);
            return apiFetch<Recipe>(`/api/recipes/${real.id}/image/upload`, {
              method: 'POST',
              body: fd,
            });
          }
        : () => apiFetch<Recipe>(`/api/recipes/${real.id}/image/generate`, { method: 'POST' });

      apply()
        .then((fresh) => patchRecipeInCache(qc, fresh))
        .catch(() => {
          // Clear the loader → fall back to the emoji, and surface a retry hint.
          patchRecipeInCache(qc, { ...real, imageGenerating: false });
          showToast(
            work.type === 'upload'
              ? 'Image upload failed. You can retry from the recipe.'
              : 'Image generation failed. You can retry from the recipe.',
            'error',
          );
        });
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

export function useGenerateImage() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  return useMutation<Recipe, Error, string>({
    mutationFn: (recipeId) =>
      apiFetch<Recipe>(`/api/recipes/${recipeId}/image/generate`, { method: 'POST' }),
    onSuccess: (fresh) => patchRecipeInCache(qc, fresh),
    onError: () => showToast('Image generation failed. You can retry from the recipe.', 'error'),
  });
}

export function useUploadImage() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  return useMutation<Recipe, Error, { recipeId: string; file: File }>({
    mutationFn: ({ recipeId, file }) => {
      const fd = new FormData();
      fd.append('file', file);
      return apiFetch<Recipe>(`/api/recipes/${recipeId}/image/upload`, {
        method: 'POST',
        body: fd,
      });
    },
    onSuccess: (fresh) => patchRecipeInCache(qc, fresh),
    onError: () => showToast('Image upload failed. Please try again.', 'error'),
  });
}

export function useRemoveImage() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  return useMutation<Recipe, Error, string>({
    mutationFn: (recipeId) =>
      apiFetch<Recipe>(`/api/recipes/${recipeId}/image`, { method: 'DELETE' }),
    onSuccess: (fresh) => patchRecipeInCache(qc, fresh),
    onError: () => showToast('Failed to remove image. Please try again.', 'error'),
  });
}
