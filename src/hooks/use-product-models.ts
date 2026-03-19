import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as productModelsService from '@/services/product-models'
import type { ProductModelInsert, ProductModelUpdate } from '@/lib/types'

export function useProductModels(filters: productModelsService.ProductModelFilters = {}) {
  return useQuery({
    queryKey: queryKeys.productModels.list(filters),
    queryFn: () => productModelsService.getProductModels(filters),
  })
}

export function useProductModelsWithHeroImage(search?: string) {
  return useQuery({
    queryKey: queryKeys.productModels.list({ search, withHero: true }),
    queryFn: () => productModelsService.getProductModelsWithHeroImage(search),
  })
}

export function useProductModel(id: string) {
  return useQuery({
    queryKey: queryKeys.productModels.detail(id),
    queryFn: () => productModelsService.getProductModel(id),
    enabled: !!id,
  })
}

export function useCreateProductModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (model: ProductModelInsert) => productModelsService.createProductModel(model),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.productModels.all })
    },
  })
}

export function useUpdateProductModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: ProductModelUpdate }) =>
      productModelsService.updateProductModel(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.productModels.all })
    },
  })
}

export function useDeleteProductModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => productModelsService.deleteProductModel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.productModels.all })
    },
  })
}

export function useAddProductMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: { productId: string; fileUrl: string; role?: 'hero' | 'gallery'; mediaType?: 'image' | 'video' }) =>
      productModelsService.addProductMedia(params.productId, params.fileUrl, params.role, params.mediaType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.productModels.all })
    },
  })
}

export function useDeleteProductMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (mediaId: string) => productModelsService.deleteProductMedia(mediaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.productModels.all })
    },
  })
}

export function useReorderProductMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: { id: string; sort_order: number }[]) =>
      productModelsService.reorderProductMedia(items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.productModels.all })
    },
  })
}
