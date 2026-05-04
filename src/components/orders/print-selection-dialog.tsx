import { useState, useEffect, useMemo } from 'react'
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
import { formatCustomerName, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

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

  // Select all by default when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(orders.map((o) => o.id)))
    }
  }, [open, orders])

  const allSelected = selectedIds.size === orders.length && orders.length > 0
  const someSelected = selectedIds.size > 0 && selectedIds.size < orders.length

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)))
    }
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
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="p-3 w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="p-3 text-left font-medium">Order</th>
                <th className="p-3 text-left font-medium">Customer</th>
                <th className="p-3 text-right font-medium">Total</th>
                <th className="p-3 text-left font-medium">Delivery</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
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
                    <td className="p-3">
                      <Checkbox checked={isChecked} onCheckedChange={() => toggleOne(order.id)} />
                    </td>
                    <td className="p-3">
                      <CodeDisplay code={order.order_code} />
                    </td>
                    <td className="p-3">
                      <div>{customerName}</div>
                      {order.customers && (
                        <div className="text-xs text-muted-foreground">{order.customers.customer_code}</div>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <PriceDisplay amount={order.total_price} />
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {order.delivery_date ?? '—'}
                    </td>
                  </tr>
                )
              })}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No orders available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-4">
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
