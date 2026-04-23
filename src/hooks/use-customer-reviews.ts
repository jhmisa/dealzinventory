import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as customerReviewService from '@/services/customer-reviews'
import type { CustomerReviewInsert, CustomerReviewUpdate } from '@/lib/types'

export function useCustomerReviews() {
  return useQuery({
    queryKey: queryKeys.customerReviews.list(),
    queryFn: () => customerReviewService.getCustomerReviews(),
  })
}

export function useCreateCustomerReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (review: CustomerReviewInsert) =>
      customerReviewService.createCustomerReview(review),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerReviews.all })
    },
  })
}

export function useUpdateCustomerReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: CustomerReviewUpdate }) =>
      customerReviewService.updateCustomerReview(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerReviews.all })
    },
  })
}

export function useDeleteCustomerReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => customerReviewService.deleteCustomerReview(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerReviews.all })
    },
  })
}
