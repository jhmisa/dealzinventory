import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as shootService from '@/services/shoots'
import type { ShootInsert, ShootUpdate, ShootStatus } from '@/lib/types'

export function useShoots() {
  return useQuery({
    queryKey: queryKeys.shoots.lists(),
    queryFn: () => shootService.getShoots(),
  })
}

export function useCreateShoot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ShootInsert) => shootService.createShoot(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.shoots.all }),
  })
}

export function useUpdateShoot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: ShootUpdate }) =>
      shootService.updateShoot(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.shoots.all }),
  })
}

export function useUpdateShootStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ShootStatus }) =>
      shootService.updateShootStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.shoots.all }),
  })
}

export function useDeleteShoot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => shootService.deleteShoot(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.shoots.all }),
  })
}
