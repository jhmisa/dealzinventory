import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as shopService from '@/services/shop'
import * as accessoriesService from '@/services/accessories'
import type { ShopFilters } from '@/services/shop'

export function useShopItems(filters: ShopFilters = {}) {
  return useQuery({
    queryKey: [...queryKeys.shop.products(filters), 'items'],
    queryFn: () => shopService.getShopItems(filters),
  })
}

export function useShopSellGroups(filters: ShopFilters = {}) {
  return useQuery({
    queryKey: [...queryKeys.shop.products(filters), 'sell-groups'],
    queryFn: () => shopService.getShopSellGroups(filters),
  })
}

// Keep for backward compat
export function useShopProducts(filters: ShopFilters = {}) {
  return useShopSellGroups(filters)
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
