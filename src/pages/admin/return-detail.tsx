import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, CheckCircle2, XCircle, Package, Eye, Wrench, Save, ChevronDown, ChevronRight, FileImage } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  PageHeader,
  StatusBadge,
  GradeBadge,
  CodeDisplay,
  PriceDisplay,
  FormSkeleton,
} from '@/components/shared'
import { ImageGallery } from '@/components/shared/media'
import type { GalleryImage } from '@/components/shared/media'
import {
  useReturnRequest,
  useUpdateReturnStatus,
  useResolveReturn,
  useRejectReturn,
} from '@/hooks/use-returns'
import {
  RETURN_STATUSES,
  RETURN_REASONS,
  RESOLUTION_TYPES,
  CONDITION_GRADES,
} from '@/lib/constants'
import type { ReturnStatus, ReturnResolution } from '@/lib/constants'
import { resolveReturnSchema } from '@/validators/return'
import type { ResolveReturnFormValues } from '@/validators/return'
import { getInvoiceSignedUrl } from '@/services/intake-receipts'
import { formatDateTime, formatPrice, cn } from '@/lib/utils'

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: returnReq, isLoading } = useReturnRequest(id!)

  const statusMutation = useUpdateReturnStatus()
  const resolveMutation = useResolveReturn()
  const rejectMutation = useRejectReturn()

  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [resolveOpen, setResolveOpen] = useState(false)
  const [staffNotes, setStaffNotes] = useState<string | null>(null)
  const [savingNotes, setSavingNotes] = useState(false)
  const [invoiceProofOpen, setInvoiceProofOpen] = useState(false)
  const [invoiceProofUrls, setInvoiceProofUrls] = useState<Record<string, string>>({})

  const resolveForm = useForm<ResolveReturnFormValues>({
    resolver: zodResolver(resolveReturnSchema),
    defaultValues: {
      resolution: undefined,
      refund_amount: undefined,
      resolution_notes: '',
    },
  })

  const watchResolution = resolveForm.watch('resolution')

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Return Detail" />
        <FormSkeleton fields={8} />
      </div>
    )
  }

  if (!returnReq) {
    return (
      <div className="space-y-6">
        <PageHeader title="Return Not Found" />
        <p className="text-muted-foreground">This return request could not be found.</p>
        <Button variant="outline" onClick={() => navigate('/admin/returns')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Returns
        </Button>
      </div>
    )
  }

  const status = returnReq.return_status as ReturnStatus
  const reasonConfig = RETURN_REASONS.find(r => r.value === returnReq.reason_category)
  const customer = returnReq.customers
  const order = returnReq.orders
  const items = returnReq.return_request_items ?? []
  const media = returnReq.return_request_media ?? []

  // Collect unique invoice file paths from return items
  const invoicePaths = useMemo(() => {
    const paths = new Set<string>()
    for (const ri of items) {
      const invoiceUrl = (ri as { order_items?: { items?: { intake_receipts?: { invoice_file_url?: string } | null } | null } | null }).order_items?.items?.intake_receipts?.invoice_file_url
      if (invoiceUrl && /\.(jpe?g|png|webp)$/i.test(invoiceUrl)) {
        paths.add(invoiceUrl)
      }
    }
    return Array.from(paths)
  }, [items])

  useEffect(() => {
    if (invoicePaths.length === 0) return
    let cancelled = false
    Promise.all(
      invoicePaths.map(async (path) => {
        try {
          const url = await getInvoiceSignedUrl(path)
          return [path, url] as const
        } catch {
          return null
        }
      })
    ).then((results) => {
      if (cancelled) return
      const urls: Record<string, string> = {}
      for (const r of results) {
        if (r) urls[r[0]] = r[1]
      }
      setInvoiceProofUrls(urls)
    })
    return () => { cancelled = true }
  }, [invoicePaths])

  // Initialize staff notes from data on first render
  const currentNotes = staffNotes ?? returnReq.staff_notes ?? ''

  function handleUpdateStatus(newStatus: ReturnStatus) {
    statusMutation.mutate(
      { id: returnReq.id, status: newStatus },
      {
        onSuccess: () => toast.success(`Status updated to ${newStatus}`),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleReject() {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason')
      return
    }
    rejectMutation.mutate(
      { id: returnReq.id, reason: rejectReason },
      {
        onSuccess: () => {
          toast.success('Return rejected')
          setRejectOpen(false)
          setRejectReason('')
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleResolve(values: ResolveReturnFormValues) {
    resolveMutation.mutate(
      {
        id: returnReq.id,
        resolution: values.resolution as ReturnResolution,
        refundAmount: values.refund_amount,
        notes: values.resolution_notes,
      },
      {
        onSuccess: () => {
          toast.success('Return resolved')
          setResolveOpen(false)
          resolveForm.reset()
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleSaveNotes() {
    setSavingNotes(true)
    statusMutation.mutate(
      { id: returnReq.id, status: status, staffNotes: currentNotes },
      {
        onSuccess: () => {
          toast.success('Notes saved')
          setSavingNotes(false)
        },
        onError: (err) => {
          toast.error(err.message)
          setSavingNotes(false)
        },
      },
    )
  }

  // Map media to gallery format
  const galleryImages: GalleryImage[] = media.map((m: { id: string; file_url: string; media_type?: string }) => ({
    id: m.id,
    url: m.file_url,
    mediaType: m.media_type === 'video' ? 'video' as const : 'image' as const,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/returns')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <PageHeader
            title={returnReq.return_code}
            actions={
              <StatusBadge status={status} config={RETURN_STATUSES} className="text-sm" />
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer Information</CardTitle>
            </CardHeader>
            <CardContent>
              {customer ? (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Name</p>
                    <p className="font-medium">{`${customer.last_name} ${customer.first_name ?? ''}`.trim()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Customer Code</p>
                    <CodeDisplay code={customer.customer_code} />
                  </div>
                  <div>
                    <p className="text-muted-foreground">Email</p>
                    <p>{customer.email ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Phone</p>
                    <p>{customer.phone ?? '—'}</p>
                  </div>
                  {order && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Order</p>
                      <Link
                        to={`/admin/orders/${returnReq.order_id}`}
                        className="text-primary hover:underline"
                      >
                        <CodeDisplay code={order.order_code} />
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No customer information</p>
              )}
            </CardContent>
          </Card>

          {/* Returned Items Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Returned Items</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-muted-foreground text-sm">No items</p>
              ) : (
                <div className="space-y-4">
                  {items.map((ri: {
                    id: string
                    reason_note?: string
                    order_items?: {
                      unit_price: number
                      items?: {
                        item_code: string
                        condition_grade: string
                        product_models?: {
                          brand: string
                          model_name: string
                          product_media?: { file_url: string }[]
                        } | null
                      } | null
                    } | null
                  }) => {
                    const orderItem = ri.order_items
                    const item = orderItem?.items
                    const pm = item?.product_models
                    const photo = pm?.product_media?.[0]?.file_url

                    return (
                      <div key={ri.id} className="flex gap-4 p-3 rounded-lg border">
                        {/* Photo */}
                        <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                          {photo ? (
                            <img src={photo} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                              <Package className="h-6 w-6" />
                            </div>
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-sm font-medium">
                            {pm ? `${pm.brand} ${pm.model_name}` : 'Unknown product'}
                          </p>
                          <div className="flex items-center gap-2">
                            {item && <CodeDisplay code={item.item_code} />}
                            {item && (
                              <GradeBadge grade={item.condition_grade as 'S' | 'A' | 'B' | 'C' | 'D' | 'J'} />
                            )}
                          </div>
                          {ri.reason_note && (
                            <p className="text-xs text-muted-foreground">{ri.reason_note}</p>
                          )}
                        </div>

                        {/* Price */}
                        <div className="flex-shrink-0">
                          {orderItem && <PriceDisplay amount={orderItem.unit_price} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Customer Complaint Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer Complaint</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-muted-foreground text-sm">Reason</p>
                <p className="font-medium">{reasonConfig?.label ?? returnReq.reason_category}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Description</p>
                <p className="text-sm whitespace-pre-wrap">{returnReq.description || '—'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Customer Media Card */}
          {galleryImages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Customer Photos / Videos</CardTitle>
              </CardHeader>
              <CardContent>
                <ImageGallery images={galleryImages} columns={4} />
              </CardContent>
            </Card>
          )}

          {/* Invoice Proof */}
          {Object.keys(invoiceProofUrls).length > 0 && (
            <Collapsible open={invoiceProofOpen} onOpenChange={setInvoiceProofOpen}>
              <Card>
                <CardHeader className="flex-row items-center space-y-0">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 -ml-2">
                      {invoiceProofOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <FileImage className="h-4 w-4" />
                      <CardTitle className="text-base">Invoice Proof</CardTitle>
                    </Button>
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    {Object.entries(invoiceProofUrls).map(([path, url]) => (
                      <img
                        key={path}
                        src={url}
                        alt="Invoice"
                        className="max-w-full rounded-md border"
                      />
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Staff Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {status === 'SUBMITTED' && (
                <>
                  <Button
                    className="w-full"
                    onClick={() => handleUpdateStatus('APPROVED')}
                    disabled={statusMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Approve Return
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => setRejectOpen(true)}
                    disabled={statusMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </>
              )}

              {status === 'APPROVED' && (
                <p className="text-sm text-muted-foreground">
                  Waiting for customer to ship item back.
                </p>
              )}

              {status === 'SHIPPED_BACK' && (
                <Button
                  className="w-full"
                  onClick={() => handleUpdateStatus('RECEIVED')}
                  disabled={statusMutation.isPending}
                >
                  <Package className="h-4 w-4 mr-1" />
                  Mark as Received
                </Button>
              )}

              {status === 'RECEIVED' && (
                <Button
                  className="w-full"
                  onClick={() => handleUpdateStatus('INSPECTING')}
                  disabled={statusMutation.isPending}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Begin Inspection
                </Button>
              )}

              {status === 'INSPECTING' && (
                <Button
                  className="w-full"
                  onClick={() => setResolveOpen(true)}
                  disabled={resolveMutation.isPending}
                >
                  <Wrench className="h-4 w-4 mr-1" />
                  Resolve
                </Button>
              )}

              {(status === 'RESOLVED' || status === 'REJECTED') && (
                <div className="space-y-3 text-sm">
                  <p className="font-medium">
                    {status === 'RESOLVED' ? 'Resolution Details' : 'Rejection Details'}
                  </p>
                  {returnReq.resolution && (
                    <div>
                      <p className="text-muted-foreground">Resolution Type</p>
                      <StatusBadge
                        status={returnReq.resolution}
                        config={RESOLUTION_TYPES}
                      />
                    </div>
                  )}
                  {returnReq.refund_amount != null && returnReq.refund_amount > 0 && (
                    <div>
                      <p className="text-muted-foreground">Refund Amount</p>
                      <PriceDisplay amount={returnReq.refund_amount} />
                    </div>
                  )}
                  {returnReq.resolution_notes && (
                    <div>
                      <p className="text-muted-foreground">Notes</p>
                      <p className="whitespace-pre-wrap">{returnReq.resolution_notes}</p>
                    </div>
                  )}
                  {returnReq.rejection_reason && (
                    <div>
                      <p className="text-muted-foreground">Rejection Reason</p>
                      <p className="whitespace-pre-wrap">{returnReq.rejection_reason}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Staff Notes Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Staff Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={currentNotes}
                onChange={(e) => setStaffNotes(e.target.value)}
                placeholder="Internal notes about this return..."
                rows={4}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveNotes}
                disabled={savingNotes}
              >
                <Save className="h-4 w-4 mr-1" />
                Save Notes
              </Button>
            </CardContent>
          </Card>

          {/* Meta info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDateTime(returnReq.created_at)}</span>
              </div>
              {returnReq.updated_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Updated</span>
                  <span>{formatDateTime(returnReq.updated_at)}</span>
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
            <DialogTitle>Reject Return</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rejection Reason</label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this return is being rejected..."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Return</DialogTitle>
          </DialogHeader>
          <Form {...resolveForm}>
            <form onSubmit={resolveForm.handleSubmit(handleResolve)} className="space-y-4 pt-2">
              <FormField
                control={resolveForm.control}
                name="resolution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resolution Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select resolution..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RESOLUTION_TYPES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchResolution === 'REFUND' && (
                <FormField
                  control={resolveForm.control}
                  name="refund_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Refund Amount (JPY)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          placeholder="0"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={resolveForm.control}
                name="resolution_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Resolution details..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setResolveOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={resolveMutation.isPending}>
                  Confirm Resolution
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
