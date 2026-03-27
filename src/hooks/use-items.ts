import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as itemsService from '@/services/items'
import type { ItemInsert, ItemUpdate } from '@/lib/types'

interface ItemFilters {
  search?: string
  status?: string
  grade?: string
  source?: string
  supplierId?: string
}

export function useItems(filters: ItemFilters = {}) {
  return useQuery({
    queryKey: queryKeys.items.list(filters),
    queryFn: () => itemsService.getItems(filters),
  })
}

export function useItem(id: string) {
  return useQuery({
    queryKey: queryKeys.items.detail(id),
    queryFn: () => itemsService.getItem(id),
    enabled: !!id,
  })
}

export function useItemByCode(code: string) {
  return useQuery({
    queryKey: queryKeys.items.byCode(code),
    queryFn: () => itemsService.getItemByCode(code),
    enabled: !!code,
  })
}

export function useItemStats() {
  return useQuery({
    queryKey: queryKeys.items.stats(),
    queryFn: () => itemsService.getItemStats(),
  })
}

export function useIntakeItems() {
  return useQuery({
    queryKey: queryKeys.items.intake(),
    queryFn: () => itemsService.getIntakeItems(),
  })
}

export function useCreateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (item: Omit<ItemInsert, 'item_code'>) => {
      const code = await itemsService.generateItemCode()
      return itemsService.createItem({ ...item, item_code: code })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useCreateBulkItems() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ count, defaults }: { count: number; defaults: Omit<ItemInsert, 'item_code'> }) => {
      const codes = await Promise.all(
        Array.from({ length: count }, () => itemsService.generateItemCode())
      )
      const items: ItemInsert[] = codes.map((code) => ({ ...defaults, item_code: code }))
      return itemsService.createBulkItems(items)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useUpdateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: ItemUpdate }) =>
      itemsService.updateItem(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.all })
    },
  })
}

// --- Item Costs ---

export function useAddItemCost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: { itemId: string; description: string; amount: number }) =>
      itemsService.addItemCost(params.itemId, params.description, params.amount),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.items.detail(vars.itemId) })
    },
  })
}

export function useDeleteItemCost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: { costId: string; itemId: string }) =>
      itemsService.deleteItemCost(params.costId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.items.detail(vars.itemId) })
    },
  })
}

// --- Item Media ---

export function useAddItemMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: { itemId: string; fileUrl: string; description?: string; mediaType?: 'image' | 'video'; thumbnailUrl?: string }) =>
      itemsService.addItemMedia(params.itemId, params.fileUrl, params.description, params.mediaType, params.thumbnailUrl),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.items.detail(vars.itemId) })
    },
  })
}

export function useUpdateItemMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: { mediaId: string; itemId: string; updates: { description?: string; visible?: boolean } }) =>
      itemsService.updateItemMedia(params.mediaId, params.updates),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.items.detail(vars.itemId) })
    },
  })
}

export function useDeleteItemMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: { mediaId: string; itemId: string }) =>
      itemsService.deleteItemMedia(params.mediaId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.items.detail(vars.itemId) })
    },
  })
}
