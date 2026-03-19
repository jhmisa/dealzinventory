import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as ordersService from '@/services/orders'
import type { OrderInsert } from '@/lib/types'

interface OrderFilters {
  search?: string
  status?: string
  source?: string
  customerId?: string
}

export function useOrders(filters: OrderFilters = {}) {
  return useQuery({
    queryKey: queryKeys.orders.list(filters),
    queryFn: () => ordersService.getOrders(filters),
  })
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: queryKeys.orders.detail(id),
    queryFn: () => ordersService.getOrder(id),
    enabled: !!id,
  })
}

export function usePackableOrders() {
  return useQuery({
    queryKey: queryKeys.orders.list({ status: 'CONFIRMED', _type: 'packable' }),
    queryFn: () => ordersService.getPackableOrders(),
  })
}

export function useCreateOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (order: Omit<OrderInsert, 'order_code'>) => {
      const code = await ordersService.generateOrderCode()
      return ordersService.createOrder({ ...order, order_code: code })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      ordersService.updateOrderStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function usePackOrderItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderItemId, packedBy }: { orderItemId: string; packedBy: string }) =>
      ordersService.packOrderItem(orderItemId, packedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

interface AvailableItemFilters {
  search?: string
  grade?: string
  page?: number
}

export function useAvailableItems(filters: AvailableItemFilters = {}) {
  return useQuery({
    queryKey: queryKeys.orders.list({ _type: 'available-items', ...filters }),
    queryFn: () => ordersService.getAvailableItems(filters),
    enabled: !!filters.search && filters.search.length >= 1,
  })
}

export function useCreateManualOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ordersService.createManualOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}
