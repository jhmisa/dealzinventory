import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Check, Circle, Package, Camera, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useReturnRequest } from '@/hooks/use-returns'
import { StatusBadge, CodeDisplay, PriceDisplay, FormSkeleton } from '@/components/shared'
import { RETURN_STATUSES, RETURN_REASONS, RESOLUTION_TYPES } from '@/lib/constants'
import { formatDateTime, formatPrice, cn } from '@/lib/utils'

const STATUS_FLOW = ['SUBMITTED', 'APPROVED', 'SHIPPED_BACK', 'RECEIVED', 'INSPECTING', 'RESOLVED'] as const

type ReturnItemRow = {
  id: string
  order_item_id: string
  reason_note: string | null
  order_items: {
    id: string
    description: string
    unit_price: number
    items: {
      item_code: string
      condition_grade: string
      product_models: {
        brand: string
        model_name: string
        color: string | null
        product_media: { file_url: string; role: string; sort_order: number }[]
      } | null
    } | null
  } | null
}

type ReturnMedia = {
  id: string
  file_url: string
  file_type: string
  created_at: string
}

export default function CustomerReturnDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: returnReq, isLoading } = useReturnRequest(id!)

  if (isLoading) return <FormSkeleton fields={6} />
  if (!returnReq) return <div className="text-center py-12 text-muted-foreground">Return request not found.</div>

  const returnItems = (returnReq.return_request_items ?? []) as ReturnItemRow[]
  const returnMedia = (returnReq.return_request_media ?? []) as ReturnMedia[]
  const reasonConfig = RETURN_REASONS.find(r => r.value === returnReq.reason_category)
  const isRejected = returnReq.return_status === 'REJECTED'
  const isCancelled = returnReq.return_status === 'CANCELLED'
  const isTerminal = isRejected || isCancelled
  const currentIdx = STATUS_FLOW.indexOf(returnReq.return_status as typeof STATUS_FLOW[number])
  const resolutionConfig = returnReq.resolution_type
    ? RESOLUTION_TYPES.find(r => r.value === returnReq.resolution_type)
    : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="Back to returns">
          <Link to="/account/returns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Return <CodeDisplay code={returnReq.return_code} />
          </h1>
          <p className="text-sm text-muted-foreground">{formatDateTime(returnReq.created_at)}</p>
        </div>
      </div>

      {/* Status Tracker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Return Status</CardTitle>
        </CardHeader>
        <CardContent>
          {isTerminal ? (
            <div className="text-center py-4">
              <StatusBadge status={returnReq.return_status} config={RETURN_STATUSES} />
              <p className="text-sm text-muted-foreground mt-2">
                {isRejected
                  ? 'This return request has been rejected.'
                  : 'This return request has been cancelled.'}
              </p>
              {returnReq.staff_notes && (
                <p className="text-sm text-muted-foreground mt-1">
                  Reason: {returnReq.staff_notes}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              {STATUS_FLOW.map((status, idx) => {
                const isCompleted = idx <= currentIdx
                const isCurrent = idx === currentIdx
                const config = RETURN_STATUSES.find((s) => s.value === status)

                return (
                  <div key={status} className="flex-1 flex flex-col items-center relative">
                    <div
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center border-2',
                        isCompleted
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-muted-foreground/30 text-muted-foreground',
                        isCurrent && 'ring-2 ring-primary ring-offset-2',
                      )}
                    >
                      {isCompleted ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
                    </div>
                    <span
                      className={cn(
                        'text-xs mt-1.5 text-center',
                        isCurrent ? 'font-semibold' : 'text-muted-foreground',
                      )}
                    >
                      {config?.label ?? status}
                    </span>
                    {idx < STATUS_FLOW.length - 1 && (
                      <div
                        className={cn(
                          'absolute top-4 left-[50%] w-full h-0.5',
                          idx < currentIdx ? 'bg-primary' : 'bg-muted-foreground/20',
                        )}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Return Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            Returned Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {returnItems.map((ri) => {
            const oi = ri.order_items
            const pm = oi?.items?.product_models
            const heroMedia = pm?.product_media
              ?.filter(m => m.role === 'hero')
              .sort((a, b) => a.sort_order - b.sort_order)[0]
            const fallbackMedia = pm?.product_media
              ?.sort((a, b) => a.sort_order - b.sort_order)[0]
            const imgUrl = heroMedia?.file_url ?? fallbackMedia?.file_url

            return (
              <div key={ri.id} className="flex gap-4 p-3 border rounded-lg">
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={oi?.description ?? 'Item'}
                    className="w-20 h-20 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs shrink-0">
                    No img
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{oi?.description ?? 'Unknown item'}</p>
                  {pm && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {[pm.brand, pm.model_name, pm.color].filter(Boolean).join(' / ')}
                    </p>
                  )}
                  {oi?.items && (
                    <span className="text-xs text-muted-foreground font-mono">{oi.items.item_code}</span>
                  )}
                  {ri.reason_note && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{ri.reason_note}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {oi && <PriceDisplay price={Number(oi.unit_price)} />}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Reason & Description */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Issue Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Reason</p>
              <Badge variant="outline">{reasonConfig?.label ?? returnReq.reason_category}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm whitespace-pre-wrap">{returnReq.description}</p>
            </div>
          </CardContent>
        </Card>

        {/* Resolution (when resolved) */}
        {returnReq.resolution_type && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resolution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Type</p>
                <Badge variant="outline" className={resolutionConfig?.color}>
                  {resolutionConfig?.label ?? returnReq.resolution_type}
                </Badge>
              </div>
              {returnReq.refund_amount != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Refund Amount</p>
                  <PriceDisplay price={returnReq.refund_amount} className="text-lg font-bold" />
                </div>
              )}
              {returnReq.resolution_notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{returnReq.resolution_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Uploaded Media */}
      {returnMedia.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Uploaded Photos / Videos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {returnMedia.map((media) => (
                <div key={media.id} className="relative aspect-square rounded-lg overflow-hidden border">
                  {media.file_type.startsWith('video/') ? (
                    <video
                      src={media.file_url}
                      className="w-full h-full object-cover"
                      controls
                    />
                  ) : (
                    <img
                      src={media.file_url}
                      alt="Return evidence"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
