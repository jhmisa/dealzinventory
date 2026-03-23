import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ClipboardEdit, Lock, QrCode, Send, Unlock } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader, FormSkeleton, StatusBadge, GradeBadge, CodeDisplay } from '@/components/shared'
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
    ? buildShortDescription(resolvedValues, descriptionFields) || undefined
    : (brand && modelName ? `${brand} ${modelName}${color ? ` (${color})` : ''}` : undefined)

  const statusConfig = ITEM_STATUSES.find((s) => s.value === item.item_status)

  // Locking logic
  const isReserved = item.item_status === 'RESERVED'
  const isSold = item.item_status === 'SOLD'
  const isLocked = isSold || (isReserved && !unlocked)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/items')} aria-label="Back to items">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={item.item_code}
          description={description}
          actions={
            <div className="flex items-center gap-2">
              {statusConfig && <StatusBadge label={statusConfig.label} color={statusConfig.color} />}
              <GradeBadge grade={item.condition_grade} />
              <Button variant="ghost" size="icon" onClick={() => setShowQr(!showQr)} title="Toggle QR code">
                <QrCode className="h-4 w-4" />
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
          }
        />
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

      {/* Short description banner */}
      {description && (
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-base font-medium">{description}</p>
            {pm?.categories?.name && (
              <Badge variant="secondary" className="mt-1 text-xs">
                {pm.categories.name}
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

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
