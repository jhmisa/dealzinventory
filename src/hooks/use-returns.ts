import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as returnsService from '@/services/returns'
import type { ReturnStatus, ReturnResolution } from '@/lib/constants'

interface ReturnFilters {
  search?: string
  status?: string
  reason?: string
}

export function useReturns(filters: ReturnFilters = {}) {
  return useQuery({
    queryKey: queryKeys.returns.list(filters),
    queryFn: () => returnsService.getReturnRequests(filters),
  })
}

export function useReturnRequest(id: string) {
  return useQuery({
    queryKey: queryKeys.returns.detail(id),
    queryFn: () => returnsService.getReturnRequest(id),
    enabled: !!id,
  })
}

export function useCustomerReturns(customerId: string) {
  return useQuery({
    queryKey: queryKeys.returns.customer(customerId),
    queryFn: () => returnsService.getCustomerReturns(customerId),
    enabled: !!customerId,
  })
}

export function useCreateReturnRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: returnsService.createReturnRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.all })
    },
  })
}

export function useCreateAdminReturn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: returnsService.createAdminReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useUpdateReturnStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, staffNotes }: { id: string; status: ReturnStatus; staffNotes?: string }) =>
      returnsService.updateReturnStatus(id, status, staffNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useResolveReturn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolution, refundAmount, notes }: {
      id: string; resolution: ReturnResolution; refundAmount?: number; notes?: string
    }) => returnsService.resolveReturn(id, resolution, refundAmount, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.all })
    },
  })
}

export function useRejectReturn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      returnsService.rejectReturn(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useUploadReturnMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ returnRequestId, file, mediaType }: {
      returnRequestId: string; file: Blob | File; mediaType?: 'image' | 'video'
    }) =>
      returnsService.uploadReturnMedia(returnRequestId, file, mediaType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.returns.all })
    },
  })
}
