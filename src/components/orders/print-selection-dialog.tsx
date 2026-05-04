import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { PriceDisplay, CodeDisplay } from '@/components/shared'
import { formatCustomerName } from '@/lib/utils'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

interface OrderForSelection {
  id: string
  order_code: string
  total_price: number
  delivery_date: string | null
  created_at: string
  quantity: number
  receiver_first_name: string | null
  receiver_last_name: string | null
  customers: {
    customer_code: string
    last_name: string
    first_name: string | null
    email: string | null
    phone: string | null
  } | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  orders: OrderForSelection[]
  actionLabel: string
  onConfirm: (selectedIds: string[]) => void
  isLoading?: boolean
}

export function PrintSelectionDialog({
  open,
  onOpenChange,
  title,
  description,
  orders,
  actionLabel,
  onConfirm,
  isLoading,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)

  // Select all by default and reset page when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(orders.map((o) => o.id)))
      setPage(0)
    }
  }, [open, orders])

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE))
  const pagedOrders = orders.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const allSelected = selectedIds.size === orders.length && orders.length > 0
  const someSelected = selectedIds.size > 0 && selectedIds.size < orders.length

  // Check if all orders on the current page are selected
  const allPageSelected = pagedOrders.length > 0 && pagedOrders.every((o) => selectedIds.has(o.id))
  const somePageSelected = pagedOrders.some((o) => selectedIds.has(o.id)) && !allPageSelected

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)))
    }
  }

  const togglePage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        for (const o of pagedOrders) next.delete(o.id)
      } else {
        for (const o of pagedOrders) next.add(o.id)
      }
      return next
    })
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectedTotal = useMemo(
    () => orders.filter((o) => selectedIds.has(o.id)).reduce((sum, o) => sum + o.total_price, 0),
    [orders, selectedIds],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Select all bar */}
        <div className="px-6 pb-3 shrink-0 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <Checkbox
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={toggleAll}
            />
            <span className="text-muted-foreground">
              {allSelected ? 'Deselect all' : `Select all ${orders.length} orders`}
            </span>
          </label>
          {totalPages > 1 && (
            <div className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto border-t border-b mx-6">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="p-3 w-12 text-center">
                  <Checkbox
                    checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                    onCheckedChange={togglePage}
                    title={allPageSelected ? 'Deselect this page' : 'Select this page'}
                  />
                </th>
                <th className="p-3 text-left font-medium">Order</th>
                <th className="p-3 text-left font-medium">Customer</th>
                <th className="p-3 text-center font-medium">Qty</th>
                <th className="p-3 text-right font-medium">Total</th>
                <th className="p-3 text-left font-medium">Delivery</th>
                <th className="p-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {pagedOrders.map((order) => {
                const isChecked = selectedIds.has(order.id)
                const receiverName = [order.receiver_first_name, order.receiver_last_name]
                  .filter(Boolean)
                  .join(' ')
                const customerName = receiverName || (order.customers ? formatCustomerName(order.customers) : '—')
                return (
                  <tr
                    key={order.id}
                    className={cn(
                      'border-t cursor-pointer hover:bg-muted/30 transition-colors',
                      isChecked && 'bg-primary/5',
                    )}
                    onClick={() => toggleOne(order.id)}
                  >
                    <td className="p-3 text-center">
                      <Checkbox checked={isChecked} onCheckedChange={() => toggleOne(order.id)} />
                    </td>
                    <td className="p-3">
                      <CodeDisplay code={order.order_code} />
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{customerName}</div>
                      {order.customers && (
                        <div className="text-xs text-muted-foreground">{order.customers.customer_code}</div>
                      )}
                    </td>
                    <td className="p-3 text-center text-muted-foreground">
                      {order.quantity}
                    </td>
                    <td className="p-3 text-right">
                      <PriceDisplay amount={order.total_price} />
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {order.delivery_date ?? '—'}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {order.created_at ? new Date(order.created_at).toLocaleDateString('ja-JP') : '—'}
                    </td>
                  </tr>
                )
              })}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted-foreground">
                    No orders available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 pt-3 shrink-0 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => (
                <Button
                  key={i}
                  variant={i === page ? 'default' : 'ghost'}
                  size="sm"
                  className="w-8 h-8 p-0"
                  onClick={() => setPage(i)}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="px-6 py-4 shrink-0 border-t flex items-center justify-between sm:justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {selectedIds.size} of {orders.length} selected
            {selectedIds.size > 0 && (
              <span className="ml-2">
                — <PriceDisplay amount={selectedTotal} />
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={selectedIds.size === 0 || isLoading}
              onClick={() => onConfirm(Array.from(selectedIds))}
            >
              {actionLabel} ({selectedIds.size})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
