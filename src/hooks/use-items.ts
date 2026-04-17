import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as itemsService from '@/services/items'
import { searchAvailableAccessories } from '@/services/accessories'
import type { ItemInsert, ItemUpdate } from '@/lib/types'
import type { AvailableInventoryResult, InventorySearchFilters } from '@/services/items'

interface ItemFilters {
  search?: string
  status?: string
  grade?: string
  source?: string
  supplierId?: string
  isLiveSelling?: boolean
}

export function useItems(filters: ItemFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.items.list(filters),
    queryFn: () => itemsService.getItems(filters),
    enabled: options?.enabled,
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

export function useItemStatusCounts(filters: Omit<ItemFilters, 'status'> = {}) {
  return useQuery({
    queryKey: [...queryKeys.items.all, 'status-counts', filters] as const,
    queryFn: () => itemsService.getItemStatusCounts(filters),
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

// --- Live Selling ---

export function useToggleLiveSelling() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemIds, value }: { itemIds: string[]; value: boolean }) =>
      itemsService.toggleLiveSelling(itemIds, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
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

// --- Inventory Search (for messaging) ---

export function useAvailableInventorySearch(query: string, filters: InventorySearchFilters = {}) {
  const hasQuery = query.trim().length >= 2
  const hasFilters = !!(filters.brand || filters.categoryId || filters.priceMin != null || filters.priceMax != null)
  return useQuery({
    queryKey: [...queryKeys.items.all, 'available-search', query, filters] as const,
    queryFn: async (): Promise<AvailableInventoryResult[]> => {
      const [items, accessories] = await Promise.all([
        itemsService.searchAvailableItems(query, filters),
        hasQuery ? searchAvailableAccessories(query) : Promise.resolve([]),
      ])
      // Sort: exact code matches first, then alphabetically
      const all = [...items, ...accessories as unknown as AvailableInventoryResult[]]
      const q = query.toLowerCase()
      return all.sort((a, b) => {
        const aExact = a.code.toLowerCase() === q ? 0 : 1
        const bExact = b.code.toLowerCase() === q ? 0 : 1
        if (aExact !== bExact) return aExact - bExact
        return a.description.localeCompare(b.description)
      })
    },
    enabled: hasQuery || hasFilters,
  })
}

export function useAvailableBrands() {
  return useQuery({
    queryKey: [...queryKeys.items.all, 'available-brands'] as const,
    queryFn: () => itemsService.getAvailableBrands(),
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
