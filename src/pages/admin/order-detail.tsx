import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Circle, Package, Pencil, X, Plus, History, Truck, Search, Loader2, Printer, RefreshCw, AlertTriangle, ExternalLink, Undo2, RotateCcw, Merge, Ticket, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  PageHeader,
  StatusBadge,
  GradeBadge,
  CodeDisplay,
  PriceDisplay,
  ConfirmDialog,
  FormSkeleton,
} from '@/components/shared'
import { CancelOrderDialog } from '@/components/orders/cancel-order-dialog'
import { MergeOrdersDialog } from '@/components/orders/merge-orders-dialog'
import { CreateReturnTicketDialog, CreateTicketDialog } from '@/components/tickets'
import type { ReturnableItem } from '@/components/tickets'
import { TicketListTable } from '@/components/tickets'
import { AddressDisplay } from '@/components/shared/address-display'
import { useCustomerAddresses } from '@/hooks/use-customer-addresses'
import {
  useOrder,
  useUpdateOrderStatus,
  useUpdateOrderLineItem,
  useRemoveOrderLineItem,
  useRecalculateOrderTotal,
  useOrderAuditLogs,
  useUpdateOrder,
  useCancelOrder,
  useAvailableItems,
  useAddOrderLineItem,
  useStampInvoicePrinted,
  useCheckYamatoTracking,
  useClearInvoicePrinted,
  useClearDempyoPrinted,
} from '@/hooks/use-orders'
import { useAvailableAccessories } from '@/hooks/use-accessories'
import * as ordersService from '@/services/orders'
import { printInvoice } from '@/components/orders/invoice-pdf'
import { useAuth } from '@/hooks/use-auth'
import { useSystemSetting } from '@/hooks/use-settings'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { ORDER_STATUSES, ORDER_SOURCES, YAMATO_TIME_SLOTS, YAMATO_TRACKING_URL, PAYMENT_METHODS, getPaymentMethodLabel, getYamatoStatusConfig, requiresPaymentConfirmation, getCancellationCategoryLabel } from '@/lib/constants'
import { useOrderTickets } from '@/hooks/use-tickets'
import { formatDateTime, formatPrice, formatCustomerName, cn, buildShortDescription } from '@/lib/utils'
import { useState, useRef, useEffect } from 'react'
import type { ShippingAddress } from '@/lib/address-types'
import { usePaymentConfirmations } from '@/hooks/use-payment-confirmations'
import { PaymentConfirmationSection } from '@/components/orders/payment-confirmation-section'

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const STATUS_FLOW = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'] as const
const EDITABLE_STATUSES = ['PENDING', 'CONFIRMED', 'PACKED']

function getNextStatus(current: string): string | null {
  const idx = STATUS_FLOW.indexOf(current as typeof STATUS_FLOW[number])
  if (idx === -1 || idx >= STATUS_FLOW.length - 1) return null
  return STATUS_FLOW[idx + 1]
}

function getPrevStatus(current: string): string | null {
  const idx = STATUS_FLOW.indexOf(current as typeof STATUS_FLOW[number])
  if (idx <= 0) return null
  return STATUS_FLOW[idx - 1]
}

function getNextStatusLabel(status: string | null): string {
  if (!status) return ''
  return ORDER_STATUSES.find(s => s.value === status)?.label ?? status
}

function parseShippingAddress(raw: string | null): ShippingAddress | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as ShippingAddress
  } catch {
    return null
  }
}

const ORDER_AUDIT_FIELD_LABELS: Record<string, string> = {
  order_status: 'Status',
  order_source: 'Source',
  total_price: 'Total',
  quantity: 'Quantity',
  shipping_cost: 'Delivery Fee',
  shipping_address: 'Address',
  delivery_date: 'Delivery Date',
  delivery_time_code: 'Time Slot',
  payment_method: 'Payment Method',
  payment_method_code: 'Payment Code',
  notes: 'Notes',
  shipped_date: 'Shipped Date',
  tracking_number: 'Tracking Number',
  unit_price: 'Unit Price',
  discount: 'Discount',
  description: 'Description',
  packed_date: 'Packed Date',
  packed_by: 'Packed By',
  item_added: 'Item Added',
  item_removed: 'Item Removed',
}

interface OrderItemRow {
  id: string
  item_id: string | null
  description: string | null
  quantity: number
  unit_price: number
  discount: number
  packed_at: string | null
  packed_by: string | null
  items: { id: string; item_code: string; condition_grade: string; item_status: string } | null
  accessories: { id: string; accessory_code: string; name: string; brand: string | null } | null
}

interface EditingItem {
  unit_price: number
  discount: number
  quantity: number
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session, displayName } = useAuth()
  const { data: order, isLoading } = useOrder(id!)
  const statusMutation = useUpdateOrderStatus()
  const cancelMutation = useCancelOrder()
  const updateLineItem = useUpdateOrderLineItem()
  const removeLineItem = useRemoveOrderLineItem()
  const recalcTotal = useRecalculateOrderTotal()
  const updateOrder = useUpdateOrder()
  const stampInvoice = useStampInvoicePrinted()
  const clearInvoice = useClearInvoicePrinted()
  const clearDempyo = useClearDempyoPrinted()
  const { data: auditLogs } = useOrderAuditLogs(id!)
  const queryClient = useQueryClient()
  const { data: surchargeRate } = useSystemSetting('credit_card_surcharge_pct')
  const { data: customerAddresses } = useCustomerAddresses(order?.customer_id ?? '')
  const { data: paymentConfirmations = [] } = usePaymentConfirmations(id!)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [revertOpen, setRevertOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [ticketTypeSlug, setTicketTypeSlug] = useState<string | undefined>()
  const [mergeOpen, setMergeOpen] = useState(false)
  const { data: orderTickets = [] } = useOrderTickets(id!)
  const [isEditing, setIsEditing] = useState(false)
  const [editingItems, setEditingItems] = useState<Record<string, EditingItem>>({})
  const [editShippingCost, setEditShippingCost] = useState(1000)
  const [editTrackingNumber, setEditTrackingNumber] = useState('')
  const [editDeliveryBoxCount, setEditDeliveryBoxCount] = useState(1)
  const [showAuditLog, setShowAuditLog] = useState(false)
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)
  const [addItemSearch, setAddItemSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [addingCustom, setAddingCustom] = useState(false)
  const [customDesc, setCustomDesc] = useState('')
  const [customPrice, setCustomPrice] = useState(0)
  const [customQty, setCustomQty] = useState(1)
  const [editOrderSource, setEditOrderSource] = useState('')
  const [editPaymentMethod, setEditPaymentMethod] = useState('')
  const [editDeliveryTimeCode, setEditDeliveryTimeCode] = useState('')
  const [editDeliveryDate, setEditDeliveryDate] = useState('')
  const [pickingAddress, setPickingAddress] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const addLineItem = useAddOrderLineItem()
  const checkTracking = useCheckYamatoTracking()

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(addItemSearch), 300)
    return () => clearTimeout(timer)
  }, [addItemSearch])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const { data: availableData, isLoading: searchLoading } = useAvailableItems({ search: debouncedSearch })
  const searchResults = availableData?.items ?? []
  const { data: accessoryResults, isLoading: accessorySearchLoading } = useAvailableAccessories(debouncedSearch)

  if (isLoading) return <FormSkeleton fields={6} />
  if (!order) return <div className="text-center py-12 text-muted-foreground">Order not found.</div>

  const customer = order.customers as { customer_code: string; last_name: string; first_name: string | null; email: string | null; phone: string | null } | null
  const sg = order.sell_groups as {
    sell_group_code: string
    condition_grade: string
    base_price: number
    product_models: { brand: string; model_name: string; color: string } | null
  } | null
  const orderItems = (order.order_items ?? []) as OrderItemRow[]
  const statusCfg = ORDER_STATUSES.find(s => s.value === order.order_status)
  const sourceCfg = ORDER_SOURCES.find(s => s.value === order.order_source)
  const nextStatus = getNextStatus(order.order_status)
  const prevStatus = getPrevStatus(order.order_status)
  const canCancel = order.order_status !== 'DELIVERED' && order.order_status !== 'CANCELLED'
  const canCreateReturn = order.order_status === 'SHIPPED' || order.order_status === 'DELIVERED'
  const canEdit = EDITABLE_STATUSES.includes(order.order_status)
  const needsPaymentProof = requiresPaymentConfirmation(order.payment_method) && order.order_status === 'PENDING'
  const confirmedPaymentTotal = paymentConfirmations.reduce((sum, c) => sum + c.amount, 0)
  const paymentProofMissing = needsPaymentProof && confirmedPaymentTotal === 0

  const shippingAddr = parseShippingAddress(order.shipping_address as string | null)
  const deliveryDate = (order as Record<string, unknown>).delivery_date as string | null
  const deliveryTimeCode = (order as Record<string, unknown>).delivery_time_code as string | null
  const orderNotes = (order as Record<string, unknown>).notes as string | null
  const shippingCost = ((order as Record<string, unknown>).shipping_cost as number) ?? 0
  const shippedDate = (order as Record<string, unknown>).shipped_date as string | null
  const trackingNumber = (order as Record<string, unknown>).tracking_number as string | null
  const packedDate = (order as Record<string, unknown>).packed_date as string | null
  const packedBy = (order as Record<string, unknown>).packed_by as string | null
  const deliveryBoxCount = ((order as Record<string, unknown>).delivery_box_count as number) ?? 1
  const invoicePrintedAt = (order as Record<string, unknown>).invoice_printed_at as string | null
  const dempyoPrintedAt = (order as Record<string, unknown>).dempyo_printed_at as string | null
  const yamatoStatus = (order as Record<string, unknown>).yamato_status as string | null
  const yamatoLastChecked = (order as Record<string, unknown>).yamato_last_checked_at as string | null
  const deliveryIssueFlag = (order as Record<string, unknown>).delivery_issue_flag as boolean
  const timeSlot = YAMATO_TIME_SLOTS.find(s => s.code === deliveryTimeCode)

  // Compute totals from line items
  const subtotal = orderItems.reduce((sum, oi) => sum + (oi.unit_price * oi.quantity), 0)
  const totalDiscount = orderItems.reduce((sum, oi) => sum + oi.discount, 0)

  function enterEditMode() {
    const items: Record<string, EditingItem> = {}
    for (const oi of orderItems) {
      items[oi.id] = { unit_price: oi.unit_price, discount: oi.discount, quantity: oi.quantity }
    }
    setEditingItems(items)
    setEditShippingCost(shippingCost)
    setEditTrackingNumber(trackingNumber ?? '')
    setEditDeliveryBoxCount(deliveryBoxCount)
    setEditOrderSource(order.order_source)
    setEditPaymentMethod(order.payment_method ?? 'COD')
    setEditDeliveryTimeCode(deliveryTimeCode ?? '')
    setEditDeliveryDate(deliveryDate ?? '')
    setIsEditing(true)
  }

  async function saveEdits() {
    try {
      // Update each changed line item
      for (const oi of orderItems) {
        const edited = editingItems[oi.id]
        if (!edited) continue
        if (
          edited.unit_price !== oi.unit_price ||
          edited.discount !== oi.discount ||
          edited.quantity !== oi.quantity
        ) {
          await updateLineItem.mutateAsync({
            orderItemId: oi.id,
            updates: {
              unit_price: edited.unit_price,
              discount: edited.discount,
              quantity: edited.quantity,
            },
          })
        }
      }

      // Update order-level fields
      const orderUpdates: Record<string, unknown> = {}
      if (editShippingCost !== shippingCost) {
        orderUpdates.shipping_cost = editShippingCost
      }
      if (editTrackingNumber !== (trackingNumber ?? '')) {
        orderUpdates.tracking_number = editTrackingNumber || null
      }
      if (editDeliveryBoxCount !== deliveryBoxCount) {
        orderUpdates.delivery_box_count = editDeliveryBoxCount
      }
      if (editOrderSource !== order.order_source) {
        orderUpdates.order_source = editOrderSource
      }
      if (editPaymentMethod !== (order.payment_method ?? 'COD')) {
        orderUpdates.payment_method = editPaymentMethod
      }
      if (editDeliveryTimeCode !== (deliveryTimeCode ?? '')) {
        orderUpdates.delivery_time_code = editDeliveryTimeCode || null
      }
      if (editDeliveryDate !== (deliveryDate ?? '')) {
        orderUpdates.delivery_date = editDeliveryDate || null
      }
      if (Object.keys(orderUpdates).length > 0) {
        await updateOrder.mutateAsync({ id: order.id, updates: orderUpdates })
      }

      // Ensure correct credit card surcharge state (idempotent)
      if (editPaymentMethod === 'CREDIT_CARD') {
        const rate = parseFloat(surchargeRate ?? '4')
        await ordersService.addCreditCardSurcharge(order.id, rate)
      } else {
        await ordersService.removeCreditCardSurcharge(order.id)
      }

      // Recalculate total
      await recalcTotal.mutateAsync(order.id)

      // If order was PACKED and items changed, revert to CONFIRMED
      if (order.order_status === 'PACKED') {
        const hasItemChanges = orderItems.some((oi) => {
          const edited = editingItems[oi.id]
          return edited && (
            edited.unit_price !== oi.unit_price ||
            edited.discount !== oi.discount ||
            edited.quantity !== oi.quantity
          )
        })
        if (hasItemChanges) {
          await ordersService.resetOrderPacking(order.id)
          await statusMutation.mutateAsync({ id: order.id, status: 'CONFIRMED' })
          toast.warning('Order reverted to Confirmed — packing checklist reset')
        }
      }

      setIsEditing(false)
      toast.success('Order updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save changes')
    }
  }

  async function handleRemoveItem(orderItemId: string) {
    try {
      await removeLineItem.mutateAsync(orderItemId)
      await recalcTotal.mutateAsync(order.id)

      // Remove from editing state
      const updated = { ...editingItems }
      delete updated[orderItemId]
      setEditingItems(updated)

      if (order.order_status === 'PACKED') {
        await ordersService.resetOrderPacking(order.id)
        await statusMutation.mutateAsync({ id: order.id, status: 'CONFIRMED' })
        toast.warning('Order reverted to Confirmed — packing checklist reset')
      }

      toast.success('Item removed')
      setRemoveConfirmId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove item')
    }
  }

  function handleAdvance() {
    if (!nextStatus) return

    // Safety check: block PENDING → CONFIRMED without payment proof for pre-pay methods
    if (paymentProofMissing) {
      toast.error('Upload payment proof before confirming this order')
      return
    }

    const updates: Record<string, unknown> = {}
    // Auto-set packed_date when advancing to PACKED
    if (nextStatus === 'PACKED') {
      updates.packed_date = new Date().toISOString()
      updates.packed_by = session?.user?.id ?? null
    }
    // Auto-set shipped_date when advancing to SHIPPED
    if (nextStatus === 'SHIPPED') {
      updates.shipped_date = new Date().toISOString()
    }

    statusMutation.mutate(
      { id: order!.id, status: nextStatus },
      {
        onSuccess: async () => {
          if (Object.keys(updates).length > 0) {
            await updateOrder.mutateAsync({ id: order!.id, updates })
          }
          // Mark items as SOLD when order is shipped
          if (nextStatus === 'SHIPPED') {
            await ordersService.markOrderItemsSold(order!.id)
          }
          toast.success(`Order ${getNextStatusLabel(nextStatus).toLowerCase()}`)
          setAdvanceOpen(false)
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function handleCancel(category: string, notes: string) {
    cancelMutation.mutate(
      { orderId: order!.id, cancellationCategory: category, cancellationNotes: notes || undefined },
      {
        onSuccess: () => { toast.success('Order cancelled'); setCancelOpen(false) },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function openTicketDialog(typeSlug: string) {
    setTicketTypeSlug(typeSlug)
    setTicketOpen(true)
  }

  // IDs of inventory items already in the order (to prevent duplicates)
  const existingItemIds = new Set(
    orderItems.filter((oi) => oi.item_id).map((oi) => oi.item_id)
  )

  async function handleAddInventoryItem(item: { id: string; item_code: string; condition_grade: string; selling_price: number | null; product_models: { brand: string; model_name: string } | null }) {
    if (existingItemIds.has(item.id)) return
    try {
      const pm = item.product_models
      const description = pm ? `${pm.brand} ${pm.model_name}` : item.item_code
      await addLineItem.mutateAsync({
        orderId: order.id,
        item: {
          item_id: item.id,
          description,
          quantity: 1,
          unit_price: item.selling_price ?? 0,
          discount: 0,
        },
      })
      await recalcTotal.mutateAsync(order.id)
      setAddItemSearch('')
      setDebouncedSearch('')
      setShowSearchDropdown(false)
      toast.success(`Added ${item.item_code}`)

      if (order.order_status === 'PACKED') {
        await ordersService.resetOrderPacking(order.id)
        await statusMutation.mutateAsync({ id: order.id, status: 'CONFIRMED' })
        toast.warning('Order reverted to Confirmed — packing checklist reset')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add item')
    }
  }

  async function handleAddAccessoryItem(acc: { id: string; accessory_code: string; name: string; brand: string | null; selling_price: number }) {
    try {
      const description = acc.brand ? `${acc.brand} ${acc.name}` : acc.name
      await addLineItem.mutateAsync({
        orderId: order.id,
        item: {
          item_id: null,
          accessory_id: acc.id,
          description,
          quantity: 1,
          unit_price: acc.selling_price ?? 0,
          discount: 0,
        },
      })
      await recalcTotal.mutateAsync(order.id)
      setAddItemSearch('')
      setDebouncedSearch('')
      setShowSearchDropdown(false)
      toast.success(`Added ${acc.accessory_code}`)

      if (order.order_status === 'PACKED') {
        await ordersService.resetOrderPacking(order.id)
        await statusMutation.mutateAsync({ id: order.id, status: 'CONFIRMED' })
        toast.warning('Order reverted to Confirmed — packing checklist reset')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add accessory')
    }
  }

  async function handleAddCustomItem() {
    if (!customDesc.trim()) {
      toast.error('Description is required')
      return
    }
    try {
      await addLineItem.mutateAsync({
        orderId: order.id,
        item: {
          item_id: null,
          description: customDesc.trim(),
          quantity: customQty,
          unit_price: customPrice,
          discount: 0,
        },
      })
      await recalcTotal.mutateAsync(order.id)
      setCustomDesc('')
      setCustomPrice(0)
      setCustomQty(1)
      setAddingCustom(false)
      toast.success('Custom item added')

      if (order.order_status === 'PACKED') {
        await ordersService.resetOrderPacking(order.id)
        await statusMutation.mutateAsync({ id: order.id, status: 'CONFIRMED' })
        toast.warning('Order reverted to Confirmed — packing checklist reset')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add item')
    }
  }

  // Build address options from customer_addresses + legacy fallback
  const addressOptions: { id: string; label: string; receiverName?: string | null; receiverFirstName?: string | null; receiverLastName?: string | null; address: ShippingAddress }[] = []
  if (customerAddresses) {
    for (const addr of customerAddresses) {
      const rName = [addr.receiver_first_name, addr.receiver_last_name].filter(Boolean).join(' ') || null
      addressOptions.push({
        id: addr.id,
        label: addr.label,
        receiverName: rName,
        receiverFirstName: addr.receiver_first_name ?? null,
        receiverLastName: addr.receiver_last_name ?? null,
        address: addr.address as unknown as ShippingAddress,
      })
    }
  }
  if (addressOptions.length === 0 && customer) {
    const legacyRaw = (customer as Record<string, unknown>).shipping_address
    if (legacyRaw) {
      let legacyAddr: ShippingAddress | null = null
      try {
        legacyAddr = typeof legacyRaw === 'string' ? JSON.parse(legacyRaw) : legacyRaw as unknown as ShippingAddress
      } catch { /* skip */ }
      if (legacyAddr) {
        addressOptions.push({ id: '__legacy__', label: 'Primary Address', receiverName: null, address: legacyAddr })
      }
    }
  }

  // Receiver info from order snapshot
  const orderReceiverName = [
    (order as Record<string, unknown>).receiver_first_name as string | null,
    (order as Record<string, unknown>).receiver_last_name as string | null,
  ].filter(Boolean).join(' ') || null
  const orderReceiverPhone = (order as Record<string, unknown>).receiver_phone as string | null

  async function handlePickAddress(option: typeof addressOptions[number]) {
    try {
      await updateOrder.mutateAsync({
        id: order.id,
        updates: {
          shipping_address: JSON.stringify(option.address),
          receiver_first_name: option.receiverFirstName ?? null,
          receiver_last_name: option.receiverLastName ?? null,
        },
      })
      setPickingAddress(false)
      toast.success('Shipping address updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update address')
    }
  }

  // Compute editing totals
  const editSubtotal = isEditing
    ? orderItems.reduce((sum, oi) => {
        const e = editingItems[oi.id]
        return sum + (e ? e.unit_price * e.quantity : oi.unit_price * oi.quantity)
      }, 0)
    : subtotal
  const editTotalDiscount = isEditing
    ? orderItems.reduce((sum, oi) => {
        const e = editingItems[oi.id]
        return sum + (e ? e.discount : oi.discount)
      }, 0)
    : totalDiscount
  const displayShippingCost = isEditing ? editShippingCost : shippingCost
  const displayTotal = editSubtotal - editTotalDiscount + displayShippingCost

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/orders')} aria-label="Back to orders">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={order.order_code}
          actions={
            <div className="flex gap-2">
              {canEdit && !isEditing && (
                <Button variant="outline" size="sm" onClick={enterEditMode}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit Order
                </Button>
              )}
              {isEditing && (
                <>
                  <Button size="sm" onClick={saveEdits} disabled={updateLineItem.isPending || updateOrder.isPending}>
                    Save Changes
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                  {prevStatus && (
                    <Button variant="outline" size="sm" onClick={() => setRevertOpen(true)}>
                      <Undo2 className="h-4 w-4 mr-1" />
                      Revert to {getNextStatusLabel(prevStatus)}
                    </Button>
                  )}
                </>
              )}
              {!isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    printInvoice({
                      order: order as Parameters<typeof printInvoice>[0]['order'],
                      salesAgent: displayName ?? '',
                      paymentMethod: order.payment_method,
                      paymentConfirmations: paymentConfirmations.map(c => ({
                        confirmedBy: (c.staff_profiles as { display_name: string } | null)?.display_name ?? 'Unknown',
                        confirmedAt: c.created_at,
                        amount: c.amount,
                      })),
                    })
                    stampInvoice.mutate([order.id])
                  }}
                >
                  <Printer className="h-4 w-4 mr-1" />
                  Print Invoice
                </Button>
              )}
              {!isEditing && nextStatus && order.order_status !== 'CANCELLED' && (
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setAdvanceOpen(true)} disabled={paymentProofMissing}>
                    Advance to {getNextStatusLabel(nextStatus)}
                  </Button>
                  {paymentProofMissing && (
                    <span className="text-xs text-amber-600">Upload payment proof before confirming</span>
                  )}
                </div>
              )}
              {!isEditing && canCreateReturn && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Ticket className="h-4 w-4 mr-1" />
                      Create Ticket
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setReturnOpen(true)}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Return
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openTicketDialog('delivery')}>
                      <Truck className="h-4 w-4 mr-2" />
                      Delivery Issue
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openTicketDialog('complaint')}>
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Complaint
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {!isEditing && (order.order_status === 'PENDING' || order.order_status === 'CONFIRMED') && (
                <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
                  <Merge className="h-4 w-4 mr-1" />
                  Merge
                </Button>
              )}
              {!isEditing && canCancel && (
                <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
                  Cancel Order
                </Button>
              )}
            </div>
          }
        />
      </div>

      {/* Status Stepper */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            {STATUS_FLOW.map((step, i) => {
              const stepIdx = STATUS_FLOW.indexOf(order.order_status as typeof STATUS_FLOW[number])
              const isCancelled = order.order_status === 'CANCELLED'
              const isActive = !isCancelled && step === order.order_status
              const isCompleted = !isCancelled && stepIdx > i
              const stepCfg = ORDER_STATUSES.find(s => s.value === step)

              return (
                <div key={step} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all',
                        isCompleted && 'bg-primary border-primary text-primary-foreground',
                        isActive && 'border-primary bg-primary/10',
                        !isCompleted && !isActive && 'border-muted text-muted-foreground',
                      )}
                    >
                      {isCompleted ? (
                        <Check className="h-4 w-4" />
                      ) : isActive ? (
                        <Circle className="h-3 w-3 fill-primary text-primary" />
                      ) : (
                        <span className="text-xs">{i + 1}</span>
                      )}
                    </div>
                    <span className={cn(
                      'text-xs',
                      (isActive || isCompleted) ? 'font-medium' : 'text-muted-foreground',
                    )}>
                      {stepCfg?.label}
                    </span>
                  </div>
                  {i < STATUS_FLOW.length - 1 && (
                    <div className={cn(
                      'flex-1 h-0.5 mx-2',
                      isCompleted ? 'bg-primary' : 'bg-muted',
                    )} />
                  )}
                </div>
              )
            })}
          </div>
          {order.order_status === 'CANCELLED' && (
            <div className="mt-4 text-center space-y-1">
              <StatusBadge label="Cancelled" color="bg-red-100 text-red-800 border-red-300" />
              {(order as Record<string, unknown>).cancellation_category && (
                <div className="text-sm text-muted-foreground">
                  Reason: {getCancellationCategoryLabel((order as Record<string, unknown>).cancellation_category as string)}
                  {(order as Record<string, unknown>).cancellation_notes && (
                    <span className="ml-1">— {(order as Record<string, unknown>).cancellation_notes as string}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Order Info */}
        <Card>
          <CardHeader>
            <CardTitle>Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Code</span><CodeDisplay code={order.order_code} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span>{statusCfg && <StatusBadge label={statusCfg.label} color={statusCfg.color} />}</div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Source</span>
              {isEditing ? (
                <Select value={editOrderSource} onValueChange={setEditOrderSource}>
                  <SelectTrigger className="w-[140px] h-7 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span>{sourceCfg?.label ?? order.order_source}</span>
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Payment</span>
              {isEditing ? (
                <Select value={editPaymentMethod} onValueChange={setEditPaymentMethod}>
                  <SelectTrigger className="w-[140px] h-7 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span>{getPaymentMethodLabel(order.payment_method ?? 'COD')}</span>
              )}
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quantity</span><span>{order.quantity}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total</span><PriceDisplay amount={order.total_price} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{formatDateTime(order.created_at)}</span></div>
            {invoicePrintedAt && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Invoice Printed</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{formatDateTime(invoicePrintedAt)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-red-600"
                    title="Mark as not printed (allow reprint)"
                    onClick={() => clearInvoice.mutate([order.id], {
                      onSuccess: () => toast.success('Invoice print status cleared'),
                      onError: (err) => toast.error(err.message),
                    })}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
            {dempyoPrintedAt && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Dempyo Printed</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{formatDateTime(dempyoPrintedAt)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-red-600"
                    title="Mark as not printed (allow reprint)"
                    onClick={() => clearDempyo.mutate([order.id], {
                      onSuccess: () => toast.success('Dempyo print status cleared'),
                      onError: (err) => toast.error(err.message),
                    })}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
            {orderNotes && (
              <div className="pt-2 border-t">
                <p className="text-muted-foreground text-xs mb-1">Notes</p>
                <p className="whitespace-pre-wrap">{orderNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer Info */}
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {customer ? (
              <>
                {orderReceiverName ? (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Receiver</span><span className="font-medium">{orderReceiverName}</span></div>
                    {orderReceiverPhone && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{orderReceiverPhone}</span></div>}
                    <div className="flex justify-between"><span className="text-muted-foreground">Account Holder</span><span className="text-muted-foreground text-xs">{formatCustomerName(customer)} ({customer.customer_code})</span></div>
                    {!orderReceiverPhone && customer.phone && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{customer.phone}</span></div>}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Code</span><CodeDisplay code={customer.customer_code} /></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span>{formatCustomerName(customer)}</span></div>
                    {customer.phone && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{customer.phone}</span></div>}
                  </>
                )}
                {customer.email && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{customer.email}</span></div>}
              </>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between mb-1">
                <p className="text-muted-foreground text-xs">Shipping Address</p>
                {canEdit && customer && addressOptions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPickingAddress(!pickingAddress)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Change shipping address"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {pickingAddress ? (
                <div className="space-y-2">
                  {addressOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="w-full text-left p-2 rounded-md border hover:bg-accent/50 transition-colors"
                      onClick={() => handlePickAddress(option)}
                      disabled={updateOrder.isPending}
                    >
                      <p className="font-medium text-xs">{option.label}</p>
                      {option.receiverName && (
                        <p className="text-xs text-muted-foreground">Receiver: {option.receiverName}</p>
                      )}
                      <div className="mt-1">
                        <AddressDisplay address={option.address} format="jp" />
                      </div>
                    </button>
                  ))}
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setPickingAddress(false)}>
                    Cancel
                  </Button>
                </div>
              ) : shippingAddr ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Japanese</p>
                    <AddressDisplay address={shippingAddr} format="jp" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">English</p>
                    <AddressDisplay address={shippingAddr} format="en" />
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Shipping & Delivery Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Shipping & Delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Expected Delivery</span>
              {isEditing ? (
                <Input
                  type="date"
                  className="w-[180px] h-7 text-sm"
                  value={editDeliveryDate}
                  onChange={(e) => setEditDeliveryDate(e.target.value)}
                />
              ) : (
                <span>{deliveryDate ?? '—'}</span>
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Time Slot</span>
              {isEditing ? (
                <Select value={editDeliveryTimeCode || 'none'} onValueChange={(v) => setEditDeliveryTimeCode(v === 'none' ? '' : v)}>
                  <SelectTrigger className="w-[180px] h-7 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {YAMATO_TIME_SLOTS.map((s) => (
                      <SelectItem key={s.code} value={s.code}>{s.label_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span>{timeSlot?.label_en ?? '—'}</span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Packed Date</span>
              <span>{packedDate ? formatDateTime(packedDate) : '—'}</span>
            </div>
            {packedBy && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Packed By</span>
                <span className="text-xs">{session?.user?.id === packedBy ? session?.user?.email?.split('@')[0] ?? 'You' : packedBy.slice(0, 8)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipped Date</span>
              <span>{shippedDate ? formatDateTime(shippedDate) : '—'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Tracking Number</span>
              {isEditing ? (
                <Input
                  className="w-40 h-7 text-sm"
                  value={editTrackingNumber}
                  onChange={(e) => setEditTrackingNumber(e.target.value)}
                  placeholder="e.g. 1234-5678-9012"
                />
              ) : trackingNumber ? (
                <a
                  href={`${YAMATO_TRACKING_URL}?pno=${trackingNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  {trackingNumber}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span>—</span>
              )}
            </div>
            {/* Yamato Tracking Status */}
            {order.order_status === 'SHIPPED' && trackingNumber && (
              <>
                {deliveryIssueFlag && (
                  <div className="flex items-start gap-2 rounded-md border border-orange-300 bg-orange-50 p-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-orange-800">
                        Delivery issue: {getYamatoStatusConfig(yamatoStatus)?.label_en ?? yamatoStatus}
                      </p>
                      <p className="text-orange-700 text-xs">Follow up with customer.</p>
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Yamato Status</span>
                  <div className="flex items-center gap-2">
                    {yamatoStatus ? (
                      <StatusBadge
                        label={`${getYamatoStatusConfig(yamatoStatus)?.label_en ?? yamatoStatus} (${getYamatoStatusConfig(yamatoStatus)?.label ?? ''})`}
                        color={getYamatoStatusConfig(yamatoStatus)?.color ?? 'bg-gray-100 text-gray-800 border-gray-300'}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">Not checked yet</span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Last Checked</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {yamatoLastChecked ? formatRelativeTime(yamatoLastChecked) : 'Never'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      disabled={checkTracking.isPending}
                      onClick={() => {
                        checkTracking.mutate(
                          { orderId: order.id, trackingNumber },
                          {
                            onSuccess: () => toast.success('Tracking status updated'),
                            onError: (err) => toast.error(err.message),
                          }
                        )
                      }}
                    >
                      {checkTracking.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      <span className="ml-1">Check Now</span>
                    </Button>
                  </div>
                </div>
              </>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Delivery Boxes</span>
              {isEditing ? (
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="w-20 text-right border rounded px-2 py-1 text-sm"
                  value={editDeliveryBoxCount}
                  onChange={(e) => setEditDeliveryBoxCount(parseInt(e.target.value) || 1)}
                />
              ) : (
                <span>{deliveryBoxCount}</span>
              )}
            </div>
            {sg && (
              <div className="pt-2 border-t">
                <p className="text-muted-foreground text-xs mb-1">Sell Group</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Code</span><CodeDisplay code={sg.sell_group_code} /></div>
                {sg.product_models && (
                  <div className="flex justify-between mt-1"><span className="text-muted-foreground">Model</span><span>{sg.product_models.brand} {sg.product_models.model_name}</span></div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Confirmation Section — for pre-pay methods */}
      {requiresPaymentConfirmation(order.payment_method) && (
        <PaymentConfirmationSection orderId={order.id} orderTotal={order.total_price} />
      )}

      {/* Order Items — Line Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Order Items ({orderItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orderItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No items in this order.</p>
          ) : (
            <div className="overflow-hidden">
              {/* Table Header */}
              <div className={cn(
                'gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase border-b',
                isEditing
                  ? 'grid grid-cols-[2rem_1fr_4rem_6rem_6rem_6rem_2rem]'
                  : 'grid grid-cols-[2rem_1fr_4rem_6rem_6rem_6rem_5rem]',
              )}>
                <span>#</span>
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Discount</span>
                <span className="text-right">Subtotal</span>
                <span className="text-center">{isEditing ? '' : 'Packed'}</span>
              </div>

              {/* Table Rows */}
              {orderItems.map((oi, idx) => {
                const item = oi.items
                const edited = editingItems[oi.id]
                const displayPrice = isEditing && edited ? edited.unit_price : oi.unit_price
                const displayDiscount = isEditing && edited ? edited.discount : oi.discount
                const displayQty = isEditing && edited ? edited.quantity : oi.quantity
                const lineSubtotal = displayPrice * displayQty - displayDiscount

                return (
                  <div
                    key={oi.id}
                    className={cn(
                      'gap-2 items-center px-3 py-2.5 border-b last:border-0',
                      isEditing
                        ? 'grid grid-cols-[2rem_1fr_4rem_6rem_6rem_6rem_2rem]'
                        : 'grid grid-cols-[2rem_1fr_4rem_6rem_6rem_6rem_5rem]',
                      !isEditing && oi.packed_at ? 'bg-green-50' : '',
                    )}
                  >
                    <span className="text-sm text-muted-foreground">{idx + 1}</span>
                    <div className="min-w-0">
                      {item ? (() => {
                        const pm = item.product_models as Record<string, unknown> | null
                        const shortDesc = (pm?.short_description as string) || (() => {
                          const descFields = (pm?.categories as Record<string, unknown> | null)?.description_fields as string[] | undefined
                          if (descFields && descFields.length > 0) {
                            const resolved: Record<string, unknown> = {}
                            for (const key of descFields) {
                              resolved[key] = (item as Record<string, unknown>)[key] ?? (pm as Record<string, unknown> | null)?.[key]
                            }
                            return buildShortDescription(resolved, descFields) || undefined
                          }
                          return undefined
                        })()
                        return (
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <CodeDisplay code={item.item_code} className="text-[28px] shrink-0" />
                              <GradeBadge grade={item.condition_grade} />
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5 pl-0.5">{shortDesc || oi.description}</p>
                            {item.condition_notes && (
                              <p className="text-xs text-muted-foreground mt-0.5 pl-0.5">{item.condition_notes}</p>
                            )}
                          </div>
                        )
                      })() : oi.accessories ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <CodeDisplay code={oi.accessories.accessory_code} className="text-[28px]" />
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5 pl-0.5">{oi.description}</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{oi.description ?? 'Custom item'}</span>
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">(custom)</span>
                        </div>
                      )}
                    </div>

                    {/* Qty */}
                    {isEditing ? (
                      <Input
                        type="number"
                        min={1}
                        className="h-7 text-sm text-right px-1"
                        value={displayQty}
                        onChange={(e) => setEditingItems(prev => ({
                          ...prev,
                          [oi.id]: { ...prev[oi.id], quantity: parseInt(e.target.value) || 1 },
                        }))}
                      />
                    ) : (
                      <span className="text-sm text-right">{displayQty}</span>
                    )}

                    {/* Unit Price */}
                    {isEditing ? (
                      <Input
                        type="number"
                        min={0}
                        className="h-7 text-sm text-right px-1"
                        value={displayPrice}
                        onChange={(e) => setEditingItems(prev => ({
                          ...prev,
                          [oi.id]: { ...prev[oi.id], unit_price: parseInt(e.target.value) || 0 },
                        }))}
                      />
                    ) : (
                      <span className="text-sm text-right">{formatPrice(displayPrice)}</span>
                    )}

                    {/* Discount */}
                    {isEditing ? (
                      <Input
                        type="number"
                        min={0}
                        className="h-7 text-sm text-right px-1"
                        value={displayDiscount}
                        onChange={(e) => setEditingItems(prev => ({
                          ...prev,
                          [oi.id]: { ...prev[oi.id], discount: parseInt(e.target.value) || 0 },
                        }))}
                      />
                    ) : (
                      <span className="text-sm text-right">{oi.discount > 0 ? `-${formatPrice(oi.discount)}` : '—'}</span>
                    )}

                    <span className="text-sm font-medium text-right">{formatPrice(lineSubtotal)}</span>

                    {/* Packed / Remove */}
                    {isEditing ? (
                      <button
                        type="button"
                        onClick={() => setRemoveConfirmId(oi.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove item"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : (
                      <div className="text-center">
                        {oi.packed_at ? (
                          <StatusBadge label="Packed" color="bg-green-100 text-green-800 border-green-300" />
                        ) : (
                          <StatusBadge label="Unpacked" color="bg-gray-100 text-gray-800 border-gray-300" />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Add Item (edit mode only) */}
              {isEditing && (
                <div className="border-t mt-2 pt-3 px-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <div ref={searchRef} className="relative flex-1">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-8 h-8 text-sm"
                          placeholder="Search P-code, A-code, or product name to add..."
                          value={addItemSearch}
                          onChange={(e) => {
                            setAddItemSearch(e.target.value)
                            setShowSearchDropdown(true)
                          }}
                          onFocus={() => addItemSearch && setShowSearchDropdown(true)}
                        />
                        {searchLoading && (
                          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      {showSearchDropdown && debouncedSearch && (
                        <div className="absolute z-50 mt-1 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {(searchLoading && accessorySearchLoading) ? (
                            <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
                          ) : searchResults.length === 0 && (!accessoryResults || accessoryResults.length === 0) ? (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
                              No items or accessories found
                            </div>
                          ) : (
                            <>
                              {searchResults.map((item) => {
                                const pm = item.product_models as { brand: string; model_name: string } | null
                                const alreadyAdded = existingItemIds.has(item.id)
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    disabled={alreadyAdded || addLineItem.isPending}
                                    className={cn(
                                      'w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-muted transition-colors',
                                      alreadyAdded && 'opacity-50 cursor-not-allowed',
                                    )}
                                    onClick={() => handleAddInventoryItem({
                                      id: item.id,
                                      item_code: item.item_code,
                                      condition_grade: item.condition_grade,
                                      selling_price: item.selling_price,
                                      product_models: pm,
                                    })}
                                  >
                                    <div className="flex items-center gap-2">
                                      <CodeDisplay code={item.item_code} />
                                      <GradeBadge grade={item.condition_grade} />
                                      <span className="text-muted-foreground">
                                        {pm ? `${pm.brand} ${pm.model_name}` : '—'}
                                      </span>
                                    </div>
                                    <span className="text-muted-foreground">
                                      {item.selling_price ? formatPrice(item.selling_price) : '—'}
                                    </span>
                                  </button>
                                )
                              })}
                              {accessoryResults && accessoryResults.length > 0 && (
                                <>
                                  {searchResults.length > 0 && (
                                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50 border-t">
                                      Accessories
                                    </div>
                                  )}
                                  {accessoryResults.map((acc) => (
                                    <button
                                      key={`acc-${acc.id}`}
                                      type="button"
                                      disabled={addLineItem.isPending}
                                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                                      onClick={() => handleAddAccessoryItem(acc)}
                                    >
                                      <div className="flex items-center gap-2">
                                        <CodeDisplay code={acc.accessory_code} />
                                        <span className="text-muted-foreground">
                                          {acc.brand ? `${acc.brand} ${acc.name}` : acc.name}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {acc.stock_quantity} in stock
                                        </span>
                                      </div>
                                      <span className="text-muted-foreground">
                                        {formatPrice(acc.selling_price ?? 0)}
                                      </span>
                                    </button>
                                  ))}
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddingCustom(!addingCustom)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Custom
                    </Button>
                  </div>

                  {addingCustom && (
                    <div className="flex items-end gap-2 bg-muted/50 p-3 rounded-md">
                      <div className="flex-1 space-y-1">
                        <label className="text-xs text-muted-foreground">Description</label>
                        <Input
                          className="h-8 text-sm"
                          placeholder="e.g. LAN Cable"
                          value={customDesc}
                          onChange={(e) => setCustomDesc(e.target.value)}
                        />
                      </div>
                      <div className="w-20 space-y-1">
                        <label className="text-xs text-muted-foreground">Qty</label>
                        <Input
                          type="number"
                          min={1}
                          className="h-8 text-sm text-right"
                          value={customQty}
                          onChange={(e) => setCustomQty(parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div className="w-28 space-y-1">
                        <label className="text-xs text-muted-foreground">Price (¥)</label>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 text-sm text-right"
                          value={customPrice}
                          onChange={(e) => setCustomPrice(parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <Button size="sm" className="h-8" onClick={handleAddCustomItem} disabled={addLineItem.isPending}>
                        Add
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => setAddingCustom(false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Summary */}
              <div className="border-t mt-2 pt-3 space-y-1.5 px-3">
                <div className="flex justify-end gap-8 text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="w-24 text-right font-medium">{formatPrice(editSubtotal)}</span>
                </div>
                <div className="flex justify-end gap-8 text-sm items-center">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  {isEditing ? (
                    <Input
                      type="number"
                      min={0}
                      className="w-24 h-7 text-sm text-right"
                      value={editShippingCost}
                      onChange={(e) => setEditShippingCost(parseInt(e.target.value) || 0)}
                    />
                  ) : (
                    <span className="w-24 text-right">{formatPrice(displayShippingCost)}</span>
                  )}
                </div>
                {editTotalDiscount > 0 && (
                  <div className="flex justify-end gap-8 text-sm">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="w-24 text-right text-muted-foreground">({formatPrice(editTotalDiscount)})</span>
                  </div>
                )}
                <div className="flex justify-end gap-8 text-sm font-semibold border-t pt-1.5">
                  <span>Total</span>
                  <span className="w-24 text-right">{formatPrice(displayTotal)}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tickets */}
      {orderTickets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-4 w-4" />
              Tickets
              <span className="text-xs font-normal text-muted-foreground ml-1">
                ({orderTickets.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TicketListTable tickets={orderTickets} showCustomer={false} compact />
          </CardContent>
        </Card>
      )}

      {/* Audit History */}
      <Card>
        <CardHeader>
          <CardTitle
            className="flex items-center gap-2 cursor-pointer select-none"
            onClick={() => setShowAuditLog(!showAuditLog)}
          >
            <History className="h-4 w-4" />
            Change History
            <span className="text-xs font-normal text-muted-foreground ml-1">
              ({auditLogs?.length ?? 0} entries)
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {showAuditLog ? '▲ Hide' : '▼ Show'}
            </span>
          </CardTitle>
        </CardHeader>
        {showAuditLog && (
          <CardContent>
            {!auditLogs || auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {auditLogs.map((log: Record<string, unknown>) => {
                  const fieldLabel = ORDER_AUDIT_FIELD_LABELS[log.field_name as string] ?? (log.field_name as string)
                  const isAddRemove = log.field_name === 'item_added' || log.field_name === 'item_removed'

                  return (
                    <div key={log.id as string} className="text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{fieldLabel}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {log.changed_by_email && (
                            <span title={log.changed_by_email as string}>
                              {(log.changed_by_email as string).split('@')[0]}
                              {' · '}
                            </span>
                          )}
                          {formatDateTime(log.created_at as string)}
                        </span>
                      </div>
                      <div className="text-muted-foreground mt-0.5">
                        {isAddRemove ? (
                          <span className={log.field_name === 'item_added' ? 'text-green-700' : 'text-red-600/70'}>
                            {log.field_name === 'item_added' ? '+ ' : '- '}
                            {(log.new_value ?? log.old_value) as string}
                          </span>
                        ) : (
                          <>
                            <span className="text-red-600/70 line-through">{(log.old_value as string) ?? '(empty)'}</span>
                            {' → '}
                            <span className="text-green-700">{(log.new_value as string) ?? '(empty)'}</span>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <ConfirmDialog
        open={advanceOpen}
        onOpenChange={setAdvanceOpen}
        title={`Advance to ${getNextStatusLabel(nextStatus)}`}
        description={`Move order ${order.order_code} to "${getNextStatusLabel(nextStatus)}" status?${nextStatus === 'SHIPPED' ? ' This will set the shipped date to now.' : ''}`}
        onConfirm={handleAdvance}
        isLoading={statusMutation.isPending}
      />

      <CancelOrderDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        orderCode={order.order_code}
        onConfirm={handleCancel}
        isPending={cancelMutation.isPending}
      />

      <MergeOrdersDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        sourceOrderId={order.id}
        sourceOrderCode={order.order_code}
        onSuccess={(targetId) => {
          toast.success(`Order merged successfully`)
          navigate(`/admin/orders/${targetId}`)
        }}
      />

      <CreateReturnTicketDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        orderCode={order.order_code}
        orderId={order.id}
        customerId={order.customer_id}
        orderItems={orderItems as ReturnableItem[]}
        onSuccess={(ticket) => navigate(`/admin/tickets/${ticket.id}`)}
      />

      <CreateTicketDialog
        open={ticketOpen}
        onOpenChange={setTicketOpen}
        customerId={order.customer_id}
        orderId={order.id}
        defaultTypeSlug={ticketTypeSlug}
        onSuccess={(ticket) => navigate(`/admin/tickets/${ticket.id}`)}
      />

      <ConfirmDialog
        open={!!removeConfirmId}
        onOpenChange={(open) => !open && setRemoveConfirmId(null)}
        title="Remove Item"
        description="Are you sure you want to remove this item from the order?"
        onConfirm={() => removeConfirmId && handleRemoveItem(removeConfirmId)}
        isLoading={removeLineItem.isPending}
        variant="destructive"
      />

      <ConfirmDialog
        open={revertOpen}
        onOpenChange={setRevertOpen}
        title={`Revert to ${getNextStatusLabel(prevStatus)}`}
        description={`Move order ${order.order_code} back to "${getNextStatusLabel(prevStatus)}" status? This is a manual override.`}
        onConfirm={async () => {
          if (!prevStatus) return
          try {
            if (order.order_status === 'PACKED') {
              await ordersService.resetOrderPacking(order.id)
            }
            await statusMutation.mutateAsync({ id: order.id, status: prevStatus })
            setIsEditing(false)
            setRevertOpen(false)
            toast.success(`Order reverted to ${getNextStatusLabel(prevStatus)}`)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to revert status')
          }
        }}
        isLoading={statusMutation.isPending}
      />
    </div>
  )
}
