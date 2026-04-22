import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as service from '@/services/inventory-removals'

interface RemovalFilters {
  search?: string
  status?: string
}

export function useInventoryRemovals(filters: RemovalFilters = {}) {
  return useQuery({
    queryKey: queryKeys.inventoryRemovals.list(filters),
    queryFn: () => service.getInventoryRemovals(filters),
  })
}

export function useInventoryRemoval(id: string) {
  return useQuery({
    queryKey: queryKeys.inventoryRemovals.detail(id),
    queryFn: () => service.getInventoryRemoval(id),
    enabled: !!id,
  })
}

export function useCreateInventoryRemoval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: service.createInventoryRemoval,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryRemovals.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useApproveRemoval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => service.approveRemoval(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryRemovals.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useRejectRemoval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      service.rejectRemoval(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventoryRemovals.all })
    },
  })
}
