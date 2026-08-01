import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const profileQueryKeys = { all: ['profiles'] as const };

export function useProfiles() {
  return useQuery({ queryKey: profileQueryKeys.all, queryFn: apiClient.listProfiles });
}

export async function refreshProfiles(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: profileQueryKeys.all, refetchType: 'none' });
  await queryClient.refetchQueries(
    { queryKey: profileQueryKeys.all, type: 'active' },
    { throwOnError: true },
  );
}

export function useSaveProfile() {
  return useMutation({ mutationFn: apiClient.saveProfile });
}

export function useRemoveProfile() {
  return useMutation({ mutationFn: apiClient.removeProfile });
}
