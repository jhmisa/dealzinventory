import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ClipboardEdit, QrCode } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
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
import type { ProductModel, ProductMedia, Supplier, ItemCost, ItemMedia } from '@/lib/types'

type ProductModelJoined = ProductModel & {
  categories?: { name: string; form_fields: string[]; description_fields: string[] } | null
  product_media?: ProductMedia[]
}

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: item, isLoading } = useItem(id!)
  const [showQr, setShowQr] = useState(false)

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
  const description = pm?.short_description || (brand && modelName ? `${brand} ${modelName}${color ? ` (${color})` : ''}` : undefined)

  const statusConfig = ITEM_STATUSES.find((s) => s.value === item.item_status)

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

      {/* Supplier description banner */}
      <SupplierDescriptionBanner description={item.supplier_description} />

      {/* Category, Product, Grade assignment */}
      <ItemAssignmentBar item={item} />

      {/* Photos (left) + Specs/Financials/Source stacked (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UnifiedGalleryCard item={item} productMedia={productMedia} itemMedia={itemMedia} />
        <div className="space-y-6">
          <EditableSpecsCard item={item} productModel={pm} />
          <FinancialsCard item={item} costs={itemCosts} />
          <SourceAuditTabs item={item} supplier={supplier} itemId={item.id} />
        </div>
      </div>
    </div>
  )
}
