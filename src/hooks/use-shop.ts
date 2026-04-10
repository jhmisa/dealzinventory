import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as shopService from '@/services/shop'
import * as accessoriesService from '@/services/accessories'

interface ShopFilters {
  search?: string
  brand?: string
  grade?: string
  minPrice?: number
  maxPrice?: number
  sort?: 'price_asc' | 'price_desc' | 'newest'
}

export function useShopProducts(filters: ShopFilters = {}) {
  return useQuery({
    queryKey: queryKeys.shop.products(filters),
    queryFn: () => shopService.getShopProducts(filters),
  })
}

export function useProductDetail(configGroupId: string) {
  return useQuery({
    queryKey: queryKeys.shop.productDetail(configGroupId),
    queryFn: () => shopService.getProductDetail(configGroupId),
    enabled: !!configGroupId,
  })
}

export function useSellGroupByCode(code: string) {
  return useQuery({
    queryKey: queryKeys.shop.sellGroupByCode(code),
    queryFn: () => shopService.getSellGroupByCode(code),
    enabled: !!code,
  })
}

export function useShopBrands() {
  return useQuery({
    queryKey: queryKeys.shop.brands(),
    queryFn: () => shopService.getShopBrands(),
  })
}

export function useShopEnabled() {
  return useQuery({
    queryKey: queryKeys.shop.enabled(),
    queryFn: () => shopService.getShopEnabled(),
  })
}

export function useShopAccessories(filters: { search?: string; categoryId?: string; sort?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.shop.accessories(filters),
    queryFn: () => accessoriesService.getShopAccessories(filters),
  })
}
