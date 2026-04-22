import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ClipboardEdit, Copy, Lock, Printer, QrCode, Send, Unlock } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FormSkeleton, StatusBadge, GradeBadge, CodeDisplay } from '@/components/shared'
import { useItem } from '@/hooks/use-items'
import {
  SupplierDescriptionBanner,
  EditableSpecsCard,
  ItemAssignmentBar,
  UnifiedGalleryCard,
  FinancialsCard,
  SourceAuditTabs,
} from '@/components/items/item-detail'
import { ITEM_STATUSES } from '@/lib/constants'
import { useActiveOfferForItem, useCancelOffer } from '@/hooks/use-offers'
import { CreateOfferDialog } from '@/components/offers'
import { formatPrice, buildShortDescription } from '@/lib/utils'
import { resolveSoldTo } from '@/lib/item-sale'
import { printItemLabel } from '@/components/items/label-print'
import { toast } from 'sonner'
import type { Item, ProductModel, ProductMedia, Supplier, ItemCost, ItemMedia } from '@/lib/types'

type ProductModelJoined = ProductModel & {
  categories?: { name: string; form_fields: string[]; description_fields: string[] } | null
  product_media?: ProductMedia[]
}

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: item, isLoading } = useItem(id!)
  const [showQr, setShowQr] = useState(false)
  const [showOfferDialog, setShowOfferDialog] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const { data: activeOffer } = useActiveOfferForItem(id!)
  const cancelOffer = useCancelOffer()

  if (isLoading) {
    return <FormSkeleton fields={6} />
  }

  if (!item) {
    return <div className="text-center py-12 text-muted-foreground">Item not found.</div>
  }

  const pm = item.product_models as ProductModelJoined | null
  const supplier = item.suppliers as Pick<Supplier, 'supplier_name'> | null
  const productMedia = (pm?.product_media ?? []) as ProductMedia[]
  const itemCosts = (item.item_costs ?? []) as ItemCost[]
  const itemMedia = (item.item_media ?? []) as ItemMedia[]

  const brand = item.brand ?? pm?.brand
  const modelName = item.model_name ?? pm?.model_name
  const color = item.color ?? pm?.color
  const descriptionFields = pm?.categories?.description_fields ?? []
  const resolvedValues: Record<string, unknown> = {}
  for (const key of descriptionFields) {
    resolvedValues[key] = (item as Record<string, unknown>)[key] ?? (pm as Record<string, unknown> | null)?.[key]
  }
  const description = descriptionFields.length > 0
    ? buildShortDescription(resolvedValues, descriptionFields) || item.supplier_description || undefined
    : (brand && modelName ? `${brand} ${modelName}${color ? ` (${color})` : ''}` : (item.supplier_description || undefined))

  const statusConfig = ITEM_STATUSES.find((s) => s.value === item.item_status)

  // Locking logic
  const isReserved = item.item_status === 'RESERVED'
  const isSold = item.item_status === 'SOLD'
  const isLocked = isSold || (isReserved && !unlocked)

  // Sold-to customer (if the item is in a CONFIRMED-or-later order)
  const soldTo = resolveSoldTo((item as unknown as { order_items?: unknown }).order_items)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/items')} aria-label="Back to items" className="mt-1">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight">{item.item_code}</h1>
            {pm?.categories?.name && (
              <Badge variant="secondary" className="text-xs">
                {pm.categories.name}
              </Badge>
            )}
            {description && (
              <p className="text-muted-foreground">{description}</p>
            )}
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Selling Price</span>
              <span className="text-2xl font-bold tracking-tight">
                {item.selling_price != null ? formatPrice(item.selling_price) : '—'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {statusConfig && <StatusBadge label={statusConfig.label} color={statusConfig.color} />}
            <GradeBadge grade={item.condition_grade} />
            <Button
              variant="ghost"
              size="icon"
              title="Copy item info"
              onClick={() => {
                const lines = [
                  item.item_code,
                  description ?? '',
                  `Rank ${item.condition_grade}`,
                  item.selling_price != null ? formatPrice(item.selling_price) : '',
                ].filter(Boolean).join(' | ')
                navigator.clipboard.writeText(lines)
                toast.success('Copied to clipboard')
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowQr(!showQr)} title="Toggle QR code">
              <QrCode className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => printItemLabel({ item_code: item.item_code, description })} title="Print label">
              <Printer className="h-4 w-4" />
            </Button>
            {item.item_status === 'AVAILABLE' && (
              <Button variant="outline" onClick={() => setShowOfferDialog(true)}>
                <Send className="h-4 w-4 mr-2" />
                Create Offer
              </Button>
            )}
            {item.item_status === 'INTAKE' && (
              <Button onClick={() => navigate(`/admin/inspection/${item.id}`)}>
                <ClipboardEdit className="h-4 w-4 mr-2" />
                Inspect
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Lock banner for RESERVED items */}
      {isReserved && (
        <div className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
          unlocked
            ? 'border-amber-300 bg-amber-50'
            : 'border-blue-300 bg-blue-50'
        }`}>
          <div className="flex items-center gap-2">
            {unlocked ? (
              <>
                <Unlock className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">
                  Editing unlocked — changes may affect a pending order
                </span>
              </>
            ) : (
              <>
                <Lock className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">
                  This item is reserved for an order. Editing is locked.
                </span>
              </>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUnlocked(!unlocked)}
          >
            {unlocked ? (
              <>
                <Lock className="h-3.5 w-3.5 mr-1" />
                Re-lock
              </>
            ) : (
              <>
                <Unlock className="h-3.5 w-3.5 mr-1" />
                Unlock for Editing
              </>
            )}
          </Button>
        </div>
      )}

      {/* Lock banner for SOLD items */}
      {isSold && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-gray-300 bg-gray-50">
          <Lock className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-600">
            This item has been sold. Editing is permanently locked.
          </span>
        </div>
      )}

      {/* Sold-to customer card */}
      {soldTo && (
        <Card className="border-green-300 bg-green-50/40">
          <CardContent className="py-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Invoice</p>
                <Link
                  to={`/admin/orders/${soldTo.orderId}`}
                  className="text-sm font-mono font-semibold text-primary hover:underline"
                >
                  {soldTo.orderCode}
                </Link>
                <p className="text-xs text-muted-foreground">{soldTo.orderStatus}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <Link
                  to={`/admin/customers/${soldTo.customer.id}`}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  {`${soldTo.customer.last_name} ${soldTo.customer.first_name ?? ''}`.trim()}
                </Link>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Customer ID</p>
                <p className="text-sm font-mono">{soldTo.customer.customer_code}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm truncate">{soldTo.customer.email ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="text-sm">{soldTo.customer.phone ?? '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Collapsible QR code */}
      {showQr && (
        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
          <QRCodeSVG value={item.item_code} size={120} />
          <div>
            <CodeDisplay code={item.item_code} className="text-lg" />
            <p className="text-sm text-muted-foreground mt-1">Scan or print this QR code</p>
          </div>
        </div>
      )}

      {/* Active offer banner */}
      {activeOffer && (() => {
        const offer = activeOffer.offers as { id: string; offer_code: string; fb_name: string; expires_at: string; offer_items: { id: string; description: string; unit_price: number; quantity: number }[] }
        const expiresAt = new Date(offer.expires_at)
        const now = new Date()
        const hoursLeft = Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)))
        const total = (offer.offer_items ?? []).reduce((sum: number, oi: { unit_price: number; quantity: number }) => sum + Number(oi.unit_price) * oi.quantity, 0)
        return (
          <div className="border border-yellow-300 bg-yellow-50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-yellow-800">Active Offer: </span>
                <span className="font-mono font-medium">{offer.offer_code}</span>
                <span className="ml-2 text-sm text-muted-foreground">for {offer.fb_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{hoursLeft}h left</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => cancelOffer.mutate(offer.id, {
                    onSuccess: () => toast.success('Offer cancelled'),
                    onError: (err) => toast.error(err.message),
                  })}
                >
                  Cancel
                </Button>
              </div>
            </div>
            {(offer.offer_items ?? []).length > 1 && (
              <div className="text-sm text-muted-foreground">
                {(offer.offer_items ?? []).length} items — Total: {formatPrice(total)}
              </div>
            )}
          </div>
        )
      })()}

      {/* Supplier description banner */}
      <SupplierDescriptionBanner description={item.supplier_description} />

      {/* Category, Product, Grade assignment */}
      <ItemAssignmentBar item={item} locked={isLocked} />

      {/* Photos (left) + Specs/Financials/Source stacked (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UnifiedGalleryCard item={item} productMedia={productMedia} itemMedia={itemMedia} />
        <div className="space-y-6">
          <EditableSpecsCard item={item} productModel={pm} locked={isLocked} />
          <FinancialsCard item={item} costs={itemCosts} locked={isLocked} />
          <SourceAuditTabs item={item} supplier={supplier} itemId={item.id} />
        </div>
      </div>
      {/* Create Offer Dialog */}
      <CreateOfferDialog
        open={showOfferDialog}
        onOpenChange={setShowOfferDialog}
        item={item as Item & { product_models?: ProductModel | null }}
      />
    </div>
  )
}
