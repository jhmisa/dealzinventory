import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as service from '@/services/supplier-returns'
import type { SupplierReturnStatus, SupplierReturnResolution, RefundPaymentMethod } from '@/lib/types'

interface SupplierReturnFilters {
  search?: string
  status?: string
}

export function useSupplierReturns(filters: SupplierReturnFilters = {}) {
  return useQuery({
    queryKey: queryKeys.supplierReturns.list(filters),
    queryFn: () => service.getSupplierReturns(filters),
  })
}

export function useSupplierReturn(id: string) {
  return useQuery({
    queryKey: queryKeys.supplierReturns.detail(id),
    queryFn: () => service.getSupplierReturn(id),
    enabled: !!id,
  })
}

export function useCreateSupplierReturn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: service.createSupplierReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierReturns.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useUpdateSupplierReturnStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SupplierReturnStatus }) =>
      service.updateSupplierReturnStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierReturns.all })
    },
  })
}

export function useResolveSupplierReturn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolution, refund_amount, refund_payment_method, staff_notes }: {
      id: string
      resolution: SupplierReturnResolution
      refund_amount?: number
      refund_payment_method?: RefundPaymentMethod
      staff_notes?: string
    }) => service.resolveSupplierReturn(id, { resolution, refund_amount, refund_payment_method, staff_notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierReturns.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useMarkRefundReceived() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => service.markRefundReceived(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierReturns.all })
    },
  })
}
