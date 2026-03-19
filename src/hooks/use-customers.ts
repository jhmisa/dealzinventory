import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as customersService from '@/services/customers'
import type { CustomerUpdate } from '@/lib/types'

export function useCustomers(search?: string) {
  return useQuery({
    queryKey: queryKeys.customers.list({ search }),
    queryFn: () => customersService.getCustomers({ search }),
  })
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id),
    queryFn: () => customersService.getCustomer(id),
    enabled: !!id,
  })
}

export function useCustomerWithDetails(id: string) {
  return useQuery({
    queryKey: [...queryKeys.customers.detail(id), 'details'],
    queryFn: () => customersService.getCustomerWithDetails(id),
    enabled: !!id,
  })
}

export function useCustomerOrders(customerId: string) {
  return useQuery({
    queryKey: [...queryKeys.customers.detail(customerId), 'orders'],
    queryFn: () => customersService.getCustomerOrders(customerId),
    enabled: !!customerId,
  })
}

export function useCustomerKaitoriRequests(customerId: string) {
  return useQuery({
    queryKey: [...queryKeys.customers.detail(customerId), 'kaitori'],
    queryFn: () => customersService.getCustomerKaitoriRequests(customerId),
    enabled: !!customerId,
  })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: customersService.createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
    },
  })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: CustomerUpdate }) =>
      customersService.updateCustomer(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
    },
  })
}

export function useVerifyCustomerId() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => customersService.verifyCustomerId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
    },
  })
}
