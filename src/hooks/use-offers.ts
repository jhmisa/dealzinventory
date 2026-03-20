import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as offersService from '@/services/offers'

interface OfferFilters {
  search?: string
  status?: string
}

export function useOffers(filters: OfferFilters = {}) {
  return useQuery({
    queryKey: queryKeys.offers.list(filters),
    queryFn: () => offersService.getOffers(filters),
  })
}

export function useOfferByCode(code: string) {
  return useQuery({
    queryKey: queryKeys.offers.byCode(code),
    queryFn: () => offersService.getOfferByCode(code),
    enabled: !!code,
  })
}

export function useActiveOfferForItem(itemId: string) {
  return useQuery({
    queryKey: queryKeys.offers.forItem(itemId),
    queryFn: () => offersService.getActiveOfferForItem(itemId),
    enabled: !!itemId,
  })
}

export function useCreateOfferOrAddItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: offersService.createOfferOrAddItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useAddCustomOfferItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ offerId, item, addedBy }: {
      offerId: string
      item: { description: string; unit_price: number; quantity: number }
      addedBy?: string
    }) => offersService.addCustomOfferItem(offerId, item, addedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.all })
    },
  })
}

export function useAddItemByCode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ offerId, code }: { offerId: string; code: string }) =>
      offersService.addItemByCode(offerId, code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useClaimOffer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: offersService.claimOffer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useCancelOffer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: offersService.cancelOffer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useRemoveOfferItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: offersService.removeOfferItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}
