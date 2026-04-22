import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  PageHeader,
  StatusBadge,
  CodeDisplay,
  FormSkeleton,
} from '@/components/shared'
import {
  useInventoryRemoval,
  useApproveRemoval,
  useRejectRemoval,
} from '@/hooks/use-inventory-removals'
import {
  INVENTORY_REMOVAL_STATUSES,
  INVENTORY_REMOVAL_REASONS,
} from '@/lib/constants'
import { formatDateTime, formatPrice } from '@/lib/utils'

export default function InventoryRemovalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: removal, isLoading } = useInventoryRemoval(id!)

  const approveMutation = useApproveRemoval()
  const rejectMutation = useRejectRemoval()

  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Removal Detail" />
        <FormSkeleton fields={6} />
      </div>
    )
  }

  if (!removal) {
    return <div className="text-center py-12 text-muted-foreground">Removal request not found.</div>
  }

  const item = removal.items as {
    id: string; item_code: string; brand: string | null; model_name: string | null
    color: string | null; condition_grade: string | null; purchase_price: number | null
    serial_number: string | null; item_status: string
    product_models: { brand: string | null; model_name: string | null; color: string | null; cpu: string | null; ram_gb: string | null; storage_gb: string | null } | null
  } | null
  const status = removal.removal_status as string
  const reasonLabel = INVENTORY_REMOVAL_REASONS.find(r => r.value === removal.reason)?.label ?? removal.reason

  const handleApprove = () => {
    approveMutation.mutate(removal.id, {
      onSuccess: () => toast.success('Removal approved — item marked as REMOVED'),
      onError: (err) => toast.error(err.message),
    })
  }

  const handleReject = () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason')
      return
    }
    rejectMutation.mutate(
      { id: removal.id, reason: rejectReason },
      {
        onSuccess: () => {
          toast.success('Removal rejected')
          setRejectOpen(false)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/inventory-returns?tab=removals')} className="mt-1">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{removal.removal_code}</h1>
              <StatusBadge status={status} config={INVENTORY_REMOVAL_STATUSES} />
            </div>
            <p className="text-sm text-muted-foreground">
              Requested {formatDateTime(removal.requested_at)}
            </p>
          </div>
          {status === 'PENDING' && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={() => setRejectOpen(true)}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button
                onClick={handleApprove}
                disabled={approveMutation.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Item Info */}
          {item && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Item Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">P-code</p>
                    <Link to={`/admin/items/${item.id}`} className="text-sm font-mono font-semibold text-primary hover:underline">
                      {item.item_code}
                    </Link>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Brand</p>
                    <p className="text-sm font-medium">{item.brand ?? item.product_models?.brand ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Model</p>
                    <p className="text-sm font-medium">{item.model_name ?? item.product_models?.model_name ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Color</p>
                    <p className="text-sm">{item.color ?? item.product_models?.color ?? '—'}</p>
                  </div>
                  {item.serial_number && (
                    <div>
                      <p className="text-xs text-muted-foreground">Serial Number</p>
                      <p className="text-sm font-mono">{item.serial_number}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Purchase Price</p>
                    <p className="text-sm font-medium">{item.purchase_price != null ? formatPrice(item.purchase_price) : '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reason & Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Removal Reason</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Reason</p>
                <p className="text-sm font-medium">{reasonLabel}</p>
              </div>
              {removal.reason === 'OTHER' && removal.reason_text && (
                <div>
                  <p className="text-xs text-muted-foreground">Details</p>
                  <p className="text-sm whitespace-pre-wrap">{removal.reason_text}</p>
                </div>
              )}
              {removal.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{removal.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rejection reason if rejected */}
          {status === 'REJECTED' && removal.rejection_reason && (
            <Card className="border-red-300 bg-red-50/40">
              <CardHeader>
                <CardTitle className="text-base text-red-800">Rejection Reason</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{removal.rejection_reason}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Audit info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Requested At</span>
                <span>{formatDateTime(removal.requested_at)}</span>
              </div>
              {removal.decided_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Decided At</span>
                  <span>{formatDateTime(removal.decided_at)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Removal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Rejection Reason</label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Why is this removal being rejected?"
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={rejectMutation.isPending}
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
