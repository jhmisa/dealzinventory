import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as kaitoriService from '@/services/kaitori'
import type { KaitoriRequestInsert, KaitoriStatus, KaitoriPaymentMethod } from '@/lib/types'

interface KaitoriFilters {
  status?: string
  search?: string
}

export function useKaitoriRequests(filters: KaitoriFilters = {}) {
  return useQuery({
    queryKey: queryKeys.kaitori.list(filters),
    queryFn: () => kaitoriService.getKaitoriRequests(filters),
  })
}

export function useKaitoriRequest(id: string) {
  return useQuery({
    queryKey: queryKeys.kaitori.detail(id),
    queryFn: () => kaitoriService.getKaitoriRequest(id),
    enabled: !!id,
  })
}

export function useKaitoriRequestByCode(code: string) {
  return useQuery({
    queryKey: queryKeys.kaitori.byCode(code),
    queryFn: () => kaitoriService.getKaitoriRequestByCode(code),
    enabled: !!code,
  })
}

export function useCreateKaitoriRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (req: Omit<KaitoriRequestInsert, 'kaitori_code'>) => {
      const code = await kaitoriService.generateKaitoriCode()
      return kaitoriService.createKaitoriRequest({ ...req, kaitori_code: code })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kaitori.all })
    },
  })
}

export function useUpdateKaitoriStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: KaitoriStatus }) =>
      kaitoriService.updateKaitoriStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kaitori.all })
    },
  })
}

export function useRevisePrice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, finalPrice, reason }: { id: string; finalPrice: number; reason: string }) =>
      kaitoriService.revisePrice(id, finalPrice, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kaitori.all })
    },
  })
}

export function useSellerAcceptRevision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, accepted }: { id: string; accepted: boolean }) =>
      kaitoriService.sellerAcceptRevision(id, accepted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kaitori.all })
    },
  })
}

export function useProcessPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, paymentMethod, paidBy }: { id: string; paymentMethod: KaitoriPaymentMethod; paidBy: string }) =>
      kaitoriService.processPayment(id, paymentMethod, paidBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kaitori.all })
    },
  })
}

export function useStartInspection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, inspectedBy }: { id: string; inspectedBy: string }) =>
      kaitoriService.startInspection(id, inspectedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kaitori.all })
    },
  })
}

export function useApproveKaitori() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, finalPrice }: { id: string; finalPrice: number }) =>
      kaitoriService.approveKaitori(id, finalPrice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kaitori.all })
    },
  })
}

export function useLookupQuote() {
  return useMutation({
    mutationFn: ({ productModelId, batteryCondition, screenCondition, bodyCondition, configGroupId }: {
      productModelId: string
      batteryCondition: string
      screenCondition: string
      bodyCondition: string
      configGroupId?: string | null
    }) => kaitoriService.lookupQuote(productModelId, batteryCondition, screenCondition, bodyCondition, configGroupId),
  })
}

// --- Price List Hooks ---

export function useKaitoriPriceList() {
  return useQuery({
    queryKey: queryKeys.kaitori.priceList(),
    queryFn: () => kaitoriService.getKaitoriPriceList(),
  })
}

export function useCreatePriceEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: kaitoriService.createPriceEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kaitori.priceList() })
    },
  })
}

export function useUpdatePriceEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { purchase_price?: number; active?: boolean } }) =>
      kaitoriService.updatePriceEntry(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kaitori.priceList() })
    },
  })
}

export function useDeletePriceEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => kaitoriService.deletePriceEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kaitori.priceList() })
    },
  })
}

export function useAddKaitoriMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ kaitoriRequestId, fileUrl, role }: { kaitoriRequestId: string; fileUrl: string; role?: string }) =>
      kaitoriService.addKaitoriMedia(kaitoriRequestId, fileUrl, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kaitori.all })
    },
  })
}
