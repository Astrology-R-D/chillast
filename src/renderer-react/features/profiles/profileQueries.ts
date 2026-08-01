import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const profileQueryKeys = { all: ['profiles'] as const };

export function useProfiles() {
  return useQuery({ queryKey: profileQueryKeys.all, queryFn: apiClient.listProfiles });
}

export function useSaveProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.saveProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: profileQueryKeys.all, refetchType: 'active' });
    },
  });
}

export function useRemoveProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.removeProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: profileQueryKeys.all, refetchType: 'active' });
    },
  });
}
