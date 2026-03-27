import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as staffProfilesService from '@/services/staff-profiles'
import type { StaffProfileUpdate } from '@/lib/types'

export function useStaffProfiles() {
  return useQuery({
    queryKey: queryKeys.staffProfiles.list(),
    queryFn: () => staffProfilesService.getStaffProfiles(),
  })
}

export function useMyStaffProfile(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.staffProfiles.me(),
    queryFn: () => staffProfilesService.getMyStaffProfile(userId!),
    enabled: !!userId,
  })
}

export function useUpdateStaffProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: StaffProfileUpdate }) =>
      staffProfilesService.updateStaffProfile(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.staffProfiles.all })
    },
  })
}

export function useInviteStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email, displayName, role, password }: { email: string; displayName: string; role: string; password?: string }) =>
      staffProfilesService.inviteStaff(email, displayName, role, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.staffProfiles.all })
    },
  })
}

export function useSetStaffPassword() {
  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      staffProfilesService.setStaffPassword(userId, password),
  })
}
