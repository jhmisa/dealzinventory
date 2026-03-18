import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as addressService from '@/services/customer-addresses'
import type { CustomerAddressInsert, CustomerAddressUpdate } from '@/lib/types'

export function useCustomerAddresses(customerId: string) {
  return useQuery({
    queryKey: queryKeys.customerAddresses.list(customerId),
    queryFn: () => addressService.getCustomerAddresses(customerId),
    enabled: !!customerId,
  })
}

export function useCreateCustomerAddress() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (address: CustomerAddressInsert) =>
      addressService.createCustomerAddress(address),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.customerAddresses.list(variables.customer_id),
      })
    },
  })
}

export function useUpdateCustomerAddress(customerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: CustomerAddressUpdate }) =>
      addressService.updateCustomerAddress(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.customerAddresses.list(customerId),
      })
    },
  })
}

export function useDeleteCustomerAddress(customerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => addressService.deleteCustomerAddress(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.customerAddresses.list(customerId),
      })
    },
  })
}
