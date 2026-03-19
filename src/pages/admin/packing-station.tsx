import { useState, useRef, useCallback } from 'react'
import { Package, Check, X, Camera, Keyboard, PackageCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader, CodeDisplay, StatusBadge, ManualCodeInput } from '@/components/shared'
import { QRScannerCamera } from '@/components/shared/media'
import { usePackableOrders, usePackOrderItem, useUpdateOrderStatus, useUpdateOrder } from '@/hooks/use-orders'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

type PackingItem = {
  id: string
  packed_at: string | null
  description: string | null
  item_id: string | null
  items: { id: string; item_code: string } | null
}

export default function PackingStationPage() {
  const { session } = useAuth()
  const { data: orders } = usePackableOrders()
  const packMutation = usePackOrderItem()
  const statusMutation = useUpdateOrderStatus()
  const updateOrder = useUpdateOrder()

  const [selectedOrderId, setSelectedOrderId] = useState<string>('')
  const [scanMode, setScanMode] = useState<'camera' | 'manual'>('manual')
  const processingRef = useRef(false)

  const selectedOrder = orders?.find(o => o.id === selectedOrderId)
  const orderItems = (selectedOrder?.order_items ?? []) as PackingItem[]
  const packedCount = orderItems.filter(i => i.packed_at).length
  const totalCount = orderItems.length
  const allPacked = totalCount > 0 && packedCount === totalCount

  const handleScan = useCallback((code: string) => {
    if (processingRef.current || !selectedOrder) return

    const trimmed = code.trim().toUpperCase()
    const matchItem = orderItems.find(
      oi => oi.items?.item_code === trimmed && !oi.packed_at
    )

    if (!matchItem) {
      const alreadyPacked = orderItems.find(
        oi => oi.items?.item_code === trimmed && oi.packed_at
      )
      if (alreadyPacked) {
        toast.info(`${trimmed} already packed`)
      } else {
        toast.error(`${trimmed} does not belong to this order`)
      }
      return
    }

    processingRef.current = true
    packMutation.mutate(
      { orderItemId: matchItem.id, packedBy: session?.user?.id ?? '' },
      {
        onSuccess: () => {
          toast.success(`${trimmed} packed`)
          processingRef.current = false
        },
        onError: (err) => {
          toast.error(`Failed: ${err.message}`)
          processingRef.current = false
        },
      },
    )
  }, [selectedOrder, orderItems, packMutation, session])

  function handleManualPack(orderItemId: string, label: string) {
    if (processingRef.current) return
    processingRef.current = true
    packMutation.mutate(
      { orderItemId, packedBy: session?.user?.id ?? '' },
      {
        onSuccess: () => {
          toast.success(`${label} packed`)
          processingRef.current = false
        },
        onError: (err) => {
          toast.error(`Failed: ${err.message}`)
          processingRef.current = false
        },
      },
    )
  }

  function handleMarkPacked() {
    if (!selectedOrder) return
    statusMutation.mutate(
      { id: selectedOrder.id, status: 'PACKED' },
      {
        onSuccess: async () => {
          // Record packed_date and packed_by
          await updateOrder.mutateAsync({
            id: selectedOrder.id,
            updates: {
              packed_date: new Date().toISOString(),
              packed_by: session?.user?.id ?? null,
            },
          })
          toast.success(`Order ${selectedOrder.order_code} marked as packed`)
          setSelectedOrderId('')
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Packing Station"
        description="Scan items to verify and pack orders."
      />

      {/* Order Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium whitespace-nowrap">Select Order:</span>
            <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="Choose a confirmed order..." />
              </SelectTrigger>
              <SelectContent>
                {(orders ?? []).map((o) => {
                  const c = o.customers as { last_name: string; first_name: string | null } | null
                  return (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_code} — {c ? `${c.last_name} ${c.first_name ?? ''}`.trim() : '?'} ({(o.order_items as PackingItem[]).length} items)
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedOrder && (
        <>
          {/* Progress */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-3xl font-bold">{packedCount}/{totalCount}</p>
                <p className="text-sm text-muted-foreground">Items Packed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <CodeDisplay code={selectedOrder.order_code} className="text-xl" />
                <p className="text-sm text-muted-foreground mt-1">Current Order</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                {allPacked ? (
                  <Button onClick={handleMarkPacked} disabled={statusMutation.isPending} className="w-full">
                    <Package className="h-4 w-4 mr-2" />
                    {statusMutation.isPending ? 'Updating...' : 'Mark as Packed'}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground pt-2">Pack all items to complete</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Scanner */}
          <div className="flex gap-2">
            <Button variant={scanMode === 'camera' ? 'default' : 'outline'} size="sm" onClick={() => setScanMode('camera')}>
              <Camera className="h-4 w-4 mr-2" />
              Camera
            </Button>
            <Button variant={scanMode === 'manual' ? 'default' : 'outline'} size="sm" onClick={() => setScanMode('manual')}>
              <Keyboard className="h-4 w-4 mr-2" />
              Manual
            </Button>
          </div>

          {scanMode === 'camera' ? (
            <QRScannerCamera
              containerId="packing-qr-reader"
              onScan={handleScan}
              onError={() => setScanMode('manual')}
            />
          ) : (
            <ManualCodeInput
              onSubmit={(code) => { handleScan(code); }}
              placeholder="Scan or type P-code"
              title="Verify Item"
              submitLabel="Verify"
            />
          )}

          {/* Packing Checklist */}
          <Card>
            <CardHeader>
              <CardTitle>Packing Checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {orderItems.map((oi) => {
                  const isPacked = !!oi.packed_at
                  const isInventoryItem = !!oi.item_id
                  const displayLabel = isInventoryItem
                    ? oi.items?.item_code ?? '—'
                    : oi.description ?? 'Custom item'

                  return (
                    <div
                      key={oi.id}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 rounded border',
                        isPacked ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : 'bg-background border-muted',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {isPacked ? (
                          <Check className="h-5 w-5 text-green-600 shrink-0" />
                        ) : (
                          <X className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                        )}
                        {isInventoryItem ? (
                          <div className="flex items-center gap-2">
                            <CodeDisplay code={oi.items?.item_code ?? '—'} />
                            {oi.description && (
                              <span className="text-sm text-muted-foreground">{oi.description}</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{oi.description ?? 'Custom item'}</span>
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">(custom)</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isPacked ? (
                          <StatusBadge label="Packed" color="bg-green-100 text-green-800 border-green-300" />
                        ) : (
                          <>
                            {!isInventoryItem && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={packMutation.isPending}
                                onClick={() => handleManualPack(oi.id, displayLabel)}
                              >
                                <PackageCheck className="h-3.5 w-3.5 mr-1" />
                                Confirm Packed
                              </Button>
                            )}
                            <StatusBadge label="Waiting" color="bg-gray-100 text-gray-800 border-gray-300" />
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
