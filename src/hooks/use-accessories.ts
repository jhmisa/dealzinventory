import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as accessoriesService from '@/services/accessories'
import type { AccessoryUpdate, AccessoryAdjustmentReason } from '@/lib/types'

interface AccessoryFilters {
  search?: string
  categoryId?: string
  active?: boolean
  inStock?: boolean
}

export function useAccessories(filters: AccessoryFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.accessories.list(filters),
    queryFn: () => accessoriesService.getAccessories(filters),
    enabled: options?.enabled,
  })
}

export function useAccessory(id: string) {
  return useQuery({
    queryKey: queryKeys.accessories.detail(id),
    queryFn: () => accessoriesService.getAccessory(id),
    enabled: !!id,
  })
}

export function useAccessoryByCode(code: string) {
  return useQuery({
    queryKey: queryKeys.accessories.byCode(code),
    queryFn: () => accessoriesService.getAccessoryByCode(code),
    enabled: !!code,
  })
}

export function useCreateAccessory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: accessoriesService.createAccessory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accessories.all })
    },
  })
}

export function useUpdateAccessory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: AccessoryUpdate }) =>
      accessoriesService.updateAccessory(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accessories.all })
    },
  })
}

export function useDeactivateAccessory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => accessoriesService.deactivateAccessory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accessories.all })
    },
  })
}

export function useUploadAccessoryMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ accessoryId, file }: { accessoryId: string; file: File }) =>
      accessoriesService.uploadAccessoryMedia(accessoryId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accessories.all })
    },
  })
}

export function useAddAccessoryMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: { accessoryId: string; fileUrl: string; mediaType: 'image' | 'video' }) =>
      accessoriesService.addAccessoryMediaRecord(params.accessoryId, params.fileUrl, params.mediaType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accessories.all })
    },
  })
}

export function useDeleteAccessoryMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (mediaId: string) => accessoriesService.deleteAccessoryMedia(mediaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accessories.all })
    },
  })
}

export function useAddStockEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: accessoriesService.addStockEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accessories.all })
    },
  })
}

export function useAddStockAdjustment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      accessory_id: string
      quantity: number
      reason: AccessoryAdjustmentReason
      supplier_id?: string | null
      notes?: string | null
    }) => accessoriesService.addStockAdjustment(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accessories.all })
    },
  })
}

export function useStockHistory(accessoryId: string) {
  return useQuery({
    queryKey: queryKeys.accessories.stockHistory(accessoryId),
    queryFn: () => accessoriesService.getStockHistory(accessoryId),
    enabled: !!accessoryId,
  })
}

export function useAvailableAccessories(search: string) {
  return useQuery({
    queryKey: queryKeys.accessories.list({ _type: 'available', search }),
    queryFn: () => accessoriesService.getAvailableAccessories(search),
    enabled: !!search && search.length >= 1,
  })
}

export function useAccessoryTabCounts() {
  return useQuery({
    queryKey: queryKeys.accessories.list({ _type: 'tab-counts' }),
    queryFn: () => accessoriesService.getAccessoryCountForTabs(),
  })
}

export function useShopAccessories(filters: { search?: string; categoryId?: string; sort?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.accessories.list({ _type: 'shop', ...filters }),
    queryFn: () => accessoriesService.getShopAccessories(filters),
  })
}
