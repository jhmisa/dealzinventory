import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Printer, CheckCircle2, ArrowRightLeft, Banknote } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  CodeDisplay,
  PriceDisplay,
  FormSkeleton,
} from '@/components/shared'
import {
  useSupplierReturn,
  useUpdateSupplierReturnStatus,
  useResolveSupplierReturn,
  useMarkRefundReceived,
} from '@/hooks/use-supplier-returns'
import {
  SUPPLIER_RETURN_STATUSES,
  SUPPLIER_RETURN_RESOLUTIONS,
  REFUND_PAYMENT_METHODS,
} from '@/lib/constants'
import { resolveSupplierReturnSchema } from '@/validators/supplier-return'
import type { ResolveSupplierReturnFormValues } from '@/validators/supplier-return'
import { getInvoiceSignedUrl } from '@/services/intake-receipts'
import { formatDateTime, formatPrice } from '@/lib/utils'
import { printReturnReport } from '@/components/supplier-returns/return-report-print'

export default function SupplierReturnDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: returnReq, isLoading } = useSupplierReturn(id!)

  const statusMutation = useUpdateSupplierReturnStatus()
  const resolveMutation = useResolveSupplierReturn()
  const refundMutation = useMarkRefundReceived()

  const [resolveOpen, setResolveOpen] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)

  const resolveForm = useForm<ResolveSupplierReturnFormValues>({
    resolver: zodResolver(resolveSupplierReturnSchema),
    defaultValues: {
      resolution: undefined,
      refund_amount: undefined,
      refund_payment_method: undefined,
      staff_notes: '',
    },
  })

  const watchResolution = resolveForm.watch('resolution')

  // Fetch signed URL for receipt
  useEffect(() => {
    if (!returnReq) return
    const fileUrl = returnReq.receipt_file_url
      ?? (returnReq.intake_receipts as { invoice_file_url: string | null } | null)?.invoice_file_url
    if (!fileUrl) return

    let cancelled = false
    getInvoiceSignedUrl(fileUrl).then((url) => {
      if (!cancelled) setReceiptUrl(url)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [returnReq])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Supplier Return Detail" />
        <FormSkeleton fields={8} />
      </div>
    )
  }

  if (!returnReq) {
    return <div className="text-center py-12 text-muted-foreground">Supplier return not found.</div>
  }

  const item = returnReq.items as {
    id: string; item_code: string; brand: string | null; model_name: string | null
    color: string | null; condition_grade: string | null; purchase_price: number | null
    serial_number: string | null; supplier_description: string | null
    product_models: { brand: string | null; model_name: string | null; color: string | null; cpu: string | null; ram_gb: string | null; storage_gb: string | null } | null
  } | null
  const supplier = returnReq.suppliers as { id: string; supplier_name: string; contact_info: string | null; supplier_type: string } | null
  const status = returnReq.return_status as string

  const handleMarkReturned = () => {
    statusMutation.mutate(
      { id: returnReq.id, status: 'RETURNED' },
      {
        onSuccess: () => toast.success('Marked as returned'),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  const handleResolve = (values: ResolveSupplierReturnFormValues) => {
    resolveMutation.mutate(
      {
        id: returnReq.id,
        resolution: values.resolution,
        refund_amount: values.refund_amount,
        refund_payment_method: values.refund_payment_method,
        staff_notes: values.staff_notes || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Supplier return resolved')
          setResolveOpen(false)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  const handleMarkRefundReceived = () => {
    refundMutation.mutate(returnReq.id, {
      onSuccess: () => toast.success('Refund marked as received'),
      onError: (err) => toast.error(err.message),
    })
  }

  const handlePrint = () => {
    printReturnReport({
      return_code: returnReq.return_code,
      requested_at: returnReq.requested_at,
      reason: returnReq.reason,
      item: item ? {
        item_code: item.item_code,
        brand: item.brand ?? item.product_models?.brand ?? null,
        model_name: item.model_name ?? item.product_models?.model_name ?? null,
        color: item.color ?? item.product_models?.color ?? null,
        serial_number: item.serial_number,
        purchase_price: item.purchase_price,
        specs: item.product_models ? {
          cpu: item.product_models.cpu,
          ram_gb: item.product_models.ram_gb,
          storage_gb: item.product_models.storage_gb,
        } : null,
      } : null,
      supplier_name: supplier?.supplier_name ?? null,
      receipt_image_url: receiptUrl,
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/inventory-returns?tab=supplier')} className="mt-1">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{returnReq.return_code}</h1>
              <StatusBadge status={status} config={SUPPLIER_RETURN_STATUSES} />
            </div>
            <p className="text-sm text-muted-foreground">
              Requested {formatDateTime(returnReq.requested_at)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print Report
            </Button>
            {status === 'REQUESTED' && (
              <Button
                onClick={handleMarkReturned}
                disabled={statusMutation.isPending}
              >
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Mark as Returned
              </Button>
            )}
            {status === 'RETURNED' && (
              <Button
                onClick={() => setResolveOpen(true)}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Resolve
              </Button>
            )}
            {status === 'RESOLVED' && returnReq.resolution === 'REFUND' && !returnReq.refund_received && (
              <Button
                onClick={handleMarkRefundReceived}
                disabled={refundMutation.isPending}
              >
                <Banknote className="h-4 w-4 mr-2" />
                Mark Refund Received
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Info cards */}
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
                  {item.product_models?.cpu && (
                    <div>
                      <p className="text-xs text-muted-foreground">CPU</p>
                      <p className="text-sm">{item.product_models.cpu}</p>
                    </div>
                  )}
                  {item.product_models?.ram_gb && (
                    <div>
                      <p className="text-xs text-muted-foreground">RAM</p>
                      <p className="text-sm">{item.product_models.ram_gb}</p>
                    </div>
                  )}
                  {item.product_models?.storage_gb && (
                    <div>
                      <p className="text-xs text-muted-foreground">Storage</p>
                      <p className="text-sm">{item.product_models.storage_gb}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reason */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Return Reason</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{returnReq.reason}</p>
            </CardContent>
          </Card>

          {/* Receipt */}
          {receiptUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receipt</CardTitle>
              </CardHeader>
              <CardContent>
                {receiptUrl.endsWith('.pdf') ? (
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm"
                  >
                    View PDF Receipt
                  </a>
                ) : (
                  <img
                    src={receiptUrl}
                    alt="Receipt"
                    className="max-w-full max-h-[500px] rounded-lg border object-contain"
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Supplier + Resolution */}
        <div className="space-y-6">
          {/* Supplier Info */}
          {supplier && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Supplier</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm font-medium">{supplier.supplier_name}</p>
                {supplier.contact_info && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{supplier.contact_info}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Resolution details (when resolved) */}
          {returnReq.resolution && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resolution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <StatusBadge status={returnReq.resolution} config={SUPPLIER_RETURN_RESOLUTIONS} />
                </div>
                {returnReq.resolution === 'REFUND' && (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">Refund Amount</p>
                      <p className="text-sm font-medium">{returnReq.refund_amount != null ? formatPrice(returnReq.refund_amount) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Payment Method</p>
                      <p className="text-sm">
                        {REFUND_PAYMENT_METHODS.find(m => m.value === returnReq.refund_payment_method)?.label ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Refund Received</p>
                      <p className="text-sm">
                        {returnReq.refund_received
                          ? `Yes — ${returnReq.refund_received_at ? formatDateTime(returnReq.refund_received_at) : ''}`
                          : 'No'}
                      </p>
                    </div>
                  </>
                )}
                {returnReq.staff_notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{returnReq.staff_notes}</p>
                  </div>
                )}
                {returnReq.resolved_at && (
                  <div>
                    <p className="text-xs text-muted-foreground">Resolved At</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(returnReq.resolved_at)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Requested</span>
                <span>{formatDateTime(returnReq.requested_at)}</span>
              </div>
              {returnReq.returned_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Returned</span>
                  <span>{formatDateTime(returnReq.returned_at)}</span>
                </div>
              )}
              {returnReq.resolved_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Resolved</span>
                  <span>{formatDateTime(returnReq.resolved_at)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Resolve Dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Supplier Return</DialogTitle>
          </DialogHeader>
          <Form {...resolveForm}>
            <form onSubmit={resolveForm.handleSubmit(handleResolve)} className="space-y-4">
              <FormField
                control={resolveForm.control}
                name="resolution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resolution</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select resolution" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SUPPLIER_RETURN_RESOLUTIONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchResolution === 'REFUND' && (
                <>
                  <FormField
                    control={resolveForm.control}
                    name="refund_amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Refund Amount (JPY)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={resolveForm.control}
                    name="refund_payment_method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Method</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select method" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {REFUND_PAYMENT_METHODS.map((m) => (
                              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <FormField
                control={resolveForm.control}
                name="staff_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Optional notes..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setResolveOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={resolveMutation.isPending}>
                  {resolveMutation.isPending ? 'Resolving...' : 'Resolve'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
