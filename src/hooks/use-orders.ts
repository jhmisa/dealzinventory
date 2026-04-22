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
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useCancelOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, cancellationCategory, cancellationNotes }: {
      orderId: string
      cancellationCategory?: string
      cancellationNotes?: string
    }) => ordersService.cancelOrder(orderId, cancellationCategory, cancellationNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
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

export function useUpdateOrderLineItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderItemId, updates }: {
      orderItemId: string
      updates: { unit_price?: number; discount?: number; quantity?: number; description?: string }
    }) => ordersService.updateOrderLineItem(orderItemId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useAddOrderLineItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, item }: {
      orderId: string
      item: { item_id: string | null; accessory_id?: string | null; description: string; quantity: number; unit_price: number; discount: number }
    }) => ordersService.addOrderLineItem(orderId, item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useRemoveOrderLineItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderItemId: string) => ordersService.removeOrderLineItem(orderItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useRecalculateOrderTotal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderId: string) => ordersService.recalculateOrderTotal(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useOrderAuditLogs(orderId: string) {
  return useQuery({
    queryKey: [...queryKeys.orders.detail(orderId), 'audit-logs'],
    queryFn: () => ordersService.getOrderAuditLogs(orderId),
    enabled: !!orderId,
  })
}

export function useUpdateOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Record<string, unknown> }) =>
      ordersService.updateOrder(id, updates as Parameters<typeof ordersService.updateOrder>[1]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
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

export function useConfirmedForInvoice(enabled = true) {
  return useQuery({
    queryKey: queryKeys.orders.list({ _type: 'invoice-unprinted' }),
    queryFn: () => ordersService.getConfirmedOrdersForInvoice(),
    enabled,
  })
}

export function useConfirmedForDempyo(enabled = true) {
  return useQuery({
    queryKey: queryKeys.orders.list({ _type: 'dempyo-unprinted' }),
    queryFn: () => ordersService.getConfirmedOrdersForDempyo(),
    enabled,
  })
}

export function useStampInvoicePrinted() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderIds: string[]) => ordersService.stampInvoicePrinted(orderIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useStampDempyoPrinted() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderIds: string[]) => ordersService.stampDempyoPrinted(orderIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useClearInvoicePrinted() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderIds: string[]) => ordersService.clearInvoicePrinted(orderIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useClearDempyoPrinted() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderIds: string[]) => ordersService.clearDempyoPrinted(orderIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useCheckYamatoTracking() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, trackingNumber }: { orderId: string; trackingNumber: string }) =>
      ordersService.checkYamatoTracking(orderId, trackingNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useRefreshAllYamatoStatuses() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => ordersService.refreshAllYamatoStatuses(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useDeliveryIssueOrders() {
  return useQuery({
    queryKey: queryKeys.orders.list({ _type: 'delivery-issues' }),
    queryFn: () => ordersService.getDeliveryIssueOrders(),
  })
}

export function useBulkApplyTracking() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      updates: { orderCode: string; trackingNumber: string }[]
      autoAdvance: boolean
    }) => ordersService.bulkApplyTracking(params.updates, params.autoAdvance),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}
