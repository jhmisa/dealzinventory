import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as sellGroupsService from '@/services/sell-groups'
import type { SellGroupInsert, SellGroupUpdate } from '@/lib/types'

interface SellGroupFilters {
  search?: string
  active?: boolean
  configGroupId?: string
  grade?: string
}

export function useSellGroups(filters: SellGroupFilters = {}) {
  return useQuery({
    queryKey: queryKeys.sellGroups.list(filters),
    queryFn: () => sellGroupsService.getSellGroups(filters),
  })
}

export function useSellGroupByCode(code: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sellGroups.byCode(code ?? ''),
    queryFn: () => sellGroupsService.getSellGroupByCode(code!),
    enabled: !!code,
  })
}

export function useSellGroup(id: string) {
  return useQuery({
    queryKey: queryKeys.sellGroups.detail(id),
    queryFn: () => sellGroupsService.getSellGroup(id),
    enabled: !!id,
  })
}

export function useSellGroupItems(sellGroupId: string) {
  return useQuery({
    queryKey: queryKeys.sellGroups.items(sellGroupId),
    queryFn: () => sellGroupsService.getSellGroupItems(sellGroupId),
    enabled: !!sellGroupId,
  })
}

export function useAvailableItems(sellGroupId: string) {
  return useQuery({
    queryKey: queryKeys.sellGroups.available(sellGroupId),
    queryFn: () => sellGroupsService.getAvailableItems(sellGroupId),
    enabled: !!sellGroupId,
  })
}

export function useCreateSellGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sg: Omit<SellGroupInsert, 'sell_group_code'>) => {
      const code = await sellGroupsService.generateSellGroupCode()
      return sellGroupsService.createSellGroup({ ...sg, sell_group_code: code })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sellGroups.all })
    },
  })
}

export function useUpdateSellGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: SellGroupUpdate }) =>
      sellGroupsService.updateSellGroup(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sellGroups.all })
    },
  })
}

export function useDeleteSellGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sellGroupsService.deleteSellGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sellGroups.all })
    },
  })
}

export function useAssignItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sellGroupId, itemId }: { sellGroupId: string; itemId: string }) =>
      sellGroupsService.assignItemToSellGroup(sellGroupId, itemId),
    onSuccess: (_, { sellGroupId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sellGroups.items(sellGroupId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.sellGroups.available(sellGroupId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.sellGroups.lists() })
    },
  })
}

export function useRemoveItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sellGroupItemId, sellGroupId }: { sellGroupItemId: string; sellGroupId: string }) =>
      sellGroupsService.removeItemFromSellGroup(sellGroupItemId),
    onSuccess: (_, { sellGroupId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sellGroups.items(sellGroupId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.sellGroups.available(sellGroupId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.sellGroups.lists() })
    },
  })
}

interface UnassignedItemFilters {
  search?: string
  grade?: string
}

export function useUnassignedItems(filters: UnassignedItemFilters = {}) {
  return useQuery({
    queryKey: queryKeys.sellGroups.unassigned(filters),
    queryFn: () => sellGroupsService.getUnassignedAvailableItems(filters),
  })
}

export function useCreateSellGroupWithItems() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ sg, itemIds }: { sg: Omit<SellGroupInsert, 'sell_group_code'>; itemIds: string[] }) => {
      const code = await sellGroupsService.generateSellGroupCode()
      return sellGroupsService.createSellGroupWithItems({ ...sg, sell_group_code: code }, itemIds)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sellGroups.all })
    },
  })
}

export function useBulkAssignItems() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sellGroupId, itemIds }: { sellGroupId: string; itemIds: string[] }) =>
      sellGroupsService.bulkAssignItems(sellGroupId, itemIds),
    onSuccess: (_, { sellGroupId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sellGroups.items(sellGroupId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.sellGroups.available(sellGroupId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.sellGroups.lists() })
    },
  })
}

export function useToggleSellGroupLiveSelling() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sellGroupId, value }: { sellGroupId: string; value: boolean }) =>
      sellGroupsService.toggleSellGroupLiveSelling(sellGroupId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sellGroups.all })
    },
  })
}

export function useLiveSellingSellGroups(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.sellGroups.list({ _type: 'live-selling' }),
    queryFn: () => sellGroupsService.getLiveSellingSellGroups(),
    enabled,
  })
}

export function useSellGroupLiveSellingCount() {
  return useQuery({
    queryKey: queryKeys.sellGroups.list({ _type: 'live-selling-count' }),
    queryFn: () => sellGroupsService.getSellGroupLiveSellingCount(),
  })
}
