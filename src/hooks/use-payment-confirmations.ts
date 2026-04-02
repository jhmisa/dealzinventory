import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as paymentConfirmationsService from '@/services/payment-confirmations'

export function usePaymentConfirmations(orderId: string) {
  return useQuery({
    queryKey: queryKeys.paymentConfirmations.forOrder(orderId),
    queryFn: () => paymentConfirmationsService.getPaymentConfirmations(orderId),
    enabled: !!orderId,
  })
}

export function useCreatePaymentConfirmation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      orderId: string
      amount: number
      screenshotUrl: string
      notes?: string
    }) => paymentConfirmationsService.createPaymentConfirmation(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.paymentConfirmations.forOrder(variables.orderId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(variables.orderId) })
    },
  })
}

export function useDeletePaymentConfirmation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, screenshotUrl, orderId }: { id: string; screenshotUrl: string; orderId: string }) =>
      paymentConfirmationsService.deletePaymentConfirmation(id, screenshotUrl),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.paymentConfirmations.forOrder(variables.orderId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(variables.orderId) })
    },
  })
}
