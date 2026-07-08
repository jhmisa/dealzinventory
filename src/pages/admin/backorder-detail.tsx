import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FormSkeleton, GradeBadge, StatusBadge } from '@/components/shared'
import { ImageGallery, type GalleryImage } from '@/components/shared/image-gallery'
import { getBackorderLine } from '@/services/backorders'
import { getItemDescription, formatPrice } from '@/lib/utils'
import type { ConditionGrade } from '@/lib/types'

// Tinted status chips — same shape StatusBadge expects (mirrors backorder-list.tsx).
const BACKORDER_STATUSES = [
  { value: 'ACTIVE', label: 'Active', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'PAUSED', label: 'Paused', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'CLOSED', label: 'Closed', color: 'bg-gray-100 text-gray-700 border-gray-300' },
] as const

// B-code detail page — mirrors the P-code Item Detail composition (header + gallery/specs/
// pricing/source cards). Photos + videos are inherited from the tied product model's gallery.
export default function BackorderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: line, isLoading } = useQuery({
    queryKey: ['backorder-line', id],
    queryFn: () => getBackorderLine(id!),
    enabled: !!id,
  })

  const pm = (line?.product_models ?? null) as {
    brand: string; model_name: string; color: string | null
    categories: { name: string | null; description_fields: string[] | null } | null
    product_media: { id: string; file_url: string; media_type: string; sort_order: number }[]
  } | null

  const media: GalleryImage[] = useMemo(() => {
    const pmm = pm?.product_media ?? []
    return [...pmm]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({ id: m.id, url: m.file_url, mediaType: m.media_type === 'video' ? 'video' : 'image' }))
  }, [pm])

  if (isLoading) return <FormSkeleton fields={6} />
  if (!line) return <div className="py-12 text-center text-muted-foreground">Backorder not found.</div>

  const title = pm ? `${pm.brand} ${pm.model_name}` : line.backorder_code
  const description = getItemDescription(
    line as unknown as Record<string, unknown>,
    pm as unknown as Record<string, unknown> | null,
    pm?.categories?.description_fields,
  )
  const supplier = (line.suppliers ?? null) as { supplier_name: string } | null

  const supplierPrice = Number(line.supplier_price ?? 0)
  const markup = Number(line.markup_jpy ?? 0)
  const selling = Number(line.selling_price ?? 0)
  const discount = Number(line.discount_amount ?? 0)
  const effective = Math.max(0, selling - discount)
  const profit = effective - supplierPrice
  const leadLo = line.lead_time_min_days
  const leadHi = line.lead_time_days
  const leadLabel = leadLo && leadHi
    ? (leadLo === leadHi ? `${leadHi} working days` : `${leadLo}–${leadHi} working days`)
    : (leadHi ? `${leadHi} working days` : '—')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/backorders')} aria-label="Back to backorders" className="mt-1">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight">{line.backorder_code}</h1>
            {pm?.categories?.name && <Badge variant="secondary" className="text-xs">{pm.categories.name}</Badge>}
            <p className="text-muted-foreground">{title}{description ? ` — ${description}` : ''}</p>
            {line.included_accessories?.trim() && (
              <p className="text-sm text-muted-foreground">Included: {line.included_accessories.trim()}</p>
            )}
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Selling Price</span>
              {discount > 0 ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight">{formatPrice(effective)}</span>
                  <span className="text-sm text-muted-foreground line-through">{formatPrice(selling)}</span>
                </div>
              ) : (
                <span className="text-2xl font-bold tracking-tight">{selling ? formatPrice(selling) : '—'}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={line.status} config={BACKORDER_STATUSES} />
            <GradeBadge grade={line.condition_grade as ConditionGrade} />
          </div>
        </div>
      </div>

      {/* Gallery (left) + Specs/Pricing/Source (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-4">
            {media.length > 0 ? (
              <ImageGallery images={media} columns={4} />
            ) : (
              <div className="aspect-square flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No photos — harvest this model to add its gallery.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Specs */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Specs</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <Spec label="Grade" value={line.condition_grade} />
                <Spec label="Color" value={line.color ?? pm?.color} />
                <Spec label="Storage" value={line.storage_gb ? `${line.storage_gb} GB` : null} />
                <Spec label="RAM" value={line.ram_gb ? `${line.ram_gb} GB` : null} />
                <Spec label="CPU" value={line.cpu} />
                <Spec label="Screen" value={line.screen_size ? `${line.screen_size}"` : null} />
              </dl>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pricing</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
                <Spec label="Supplier" value={supplierPrice ? formatPrice(supplierPrice) : null} />
                <Spec label="Markup" value={markup ? formatPrice(markup) : null} />
                <Spec label="Selling" value={selling ? formatPrice(selling) : null} />
                <Spec label="Discount" value={discount ? `−${formatPrice(discount)}` : null} />
                <Spec label="Customer Pays" value={formatPrice(effective)} />
                <Spec label="Profit" value={formatPrice(profit)} />
              </dl>
            </CardContent>
          </Card>

          {/* Source */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Source</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <Spec label="Supplier" value={supplier?.supplier_name} />
                <Spec label="Supplier Code" value={line.supplier_product_code} />
                <Spec label="Supplier Stock" value={line.supplier_stock != null ? String(line.supplier_stock) : null} />
                <Spec label="Lead Time" value={leadLabel} />
              </dl>
              {line.supplier_url && (
                <a
                  href={line.supplier_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  View iosys listing <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Spec({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || '—'}</dd>
    </>
  )
}
