import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import type { ProfileResponse } from '../types/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const PROFILE_KEY = ['profile'] as const;

export type ProfileUpdate = {
  name?: string | null;
  preferences?: string[];
};

export function useProfile() {
  const { session } = useAuth();
  return useQuery<ProfileResponse>({
    queryKey: PROFILE_KEY,
    queryFn: () => apiFetch<ProfileResponse>('/api/profile'),
    enabled: !!session,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  return useMutation<ProfileResponse, Error, ProfileUpdate, { prev: ProfileResponse | undefined }>({
    mutationFn: (body) =>
      apiFetch<ProfileResponse>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: PROFILE_KEY });
      const prev = qc.getQueryData<ProfileResponse>(PROFILE_KEY);
      if (prev) {
        qc.setQueryData<ProfileResponse>(PROFILE_KEY, { ...prev, ...body });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(PROFILE_KEY, ctx.prev);
      showToast('Failed to update profile. Please try again.', 'error');
    },
    onSuccess: (fresh) => {
      qc.setQueryData<ProfileResponse>(PROFILE_KEY, fresh);
    },
  });
}
