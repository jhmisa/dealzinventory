import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Eye, DollarSign, CheckCircle2, XCircle, Package, Clipboard } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { PageHeader, StatusBadge, CodeDisplay, FormSkeleton } from '@/components/shared'
import { ImageGallery } from '@/components/shared/media'
import type { GalleryImage } from '@/components/shared/media'
import {
  useKaitoriRequest,
  useUpdateKaitoriStatus,
  useRevisePrice,
  useProcessPayment,
  useStartInspection,
  useApproveKaitori,
} from '@/hooks/use-kaitori'
import { useAuth } from '@/hooks/use-auth'
import { priceRevisionSchema, paymentSchema } from '@/validators/kaitori'
import type { PriceRevisionFormValues, PaymentFormValues } from '@/validators/kaitori'
import {
  getKaitoriStatusConfig,
  KAITORI_STATUSES,
  BATTERY_CONDITIONS,
  SCREEN_CONDITIONS,
  BODY_CONDITIONS,
  KAITORI_PAYMENT_METHODS,
  KAITORI_DELIVERY_METHODS,
} from '@/lib/constants'
import { formatPrice, formatDateTime, cn } from '@/lib/utils'
import type { KaitoriStatus } from '@/lib/types'

// Status flow visual
const STATUS_FLOW: KaitoriStatus[] = [
  'QUOTED', 'ACCEPTED', 'SHIPPED', 'RECEIVED', 'INSPECTING', 'APPROVED', 'PAID',
]

export default function KaitoriDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: kt, isLoading } = useKaitoriRequest(id!)

  const statusMutation = useUpdateKaitoriStatus()
  const reviseMutation = useRevisePrice()
  const paymentMutation = useProcessPayment()
  const inspectionMutation = useStartInspection()
  const approveMutation = useApproveKaitori()

  const [reviseOpen, setReviseOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [approvePrice, setApprovePrice] = useState('')

  const reviseForm = useForm<PriceRevisionFormValues>({
    resolver: zodResolver(priceRevisionSchema),
    defaultValues: { final_price: 0, revision_reason: '' },
  })

  const payForm = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
  })

  if (isLoading) return <FormSkeleton fields={8} />
  if (!kt) return <div className="text-center py-12 text-muted-foreground">Kaitori request not found.</div>

  const status = kt.request_status as KaitoriStatus
  const statusCfg = getKaitoriStatusConfig(status)
  const pm = kt.product_models as { id: string; brand: string; model_name: string; cpu: string | null; ram_gb: string | null; storage_gb: string | null; os_family: string | null } | null
  const customer = kt.customers as {
    id: string; last_name: string; first_name: string | null; email: string; phone: string | null
    customer_code: string; bank_name: string | null; bank_branch: string | null
    bank_account_number: string | null; bank_account_holder: string | null
  } | null
  const media = (kt.kaitori_request_media as { id: string; file_url: string; media_type: string; role: string; sort_order: number }[] ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)

  const batteryLabel = BATTERY_CONDITIONS.find(b => b.value === kt.battery_condition)?.label ?? kt.battery_condition
  const screenLabel = SCREEN_CONDITIONS.find(s => s.value === kt.screen_condition)?.label ?? kt.screen_condition
  const bodyLabel = BODY_CONDITIONS.find(b => b.value === kt.body_condition)?.label ?? kt.body_condition
  const deliveryLabel = KAITORI_DELIVERY_METHODS.find(d => d.value === kt.delivery_method)?.label ?? kt.delivery_method

  const currentStepIndex = STATUS_FLOW.indexOf(status)

  function handleStatusAdvance(nextStatus: KaitoriStatus) {
    statusMutation.mutate({ id: kt!.id, status: nextStatus }, {
      onSuccess: () => toast.success(`Status updated to ${nextStatus}`),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  function handleStartInspection() {
    inspectionMutation.mutate({ id: kt!.id, inspectedBy: session?.user?.id ?? '' }, {
      onSuccess: () => toast.success('Inspection started'),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  function handleApprove() {
    const price = Number(approvePrice) || kt!.auto_quote_price
    approveMutation.mutate({ id: kt!.id, finalPrice: price }, {
      onSuccess: () => toast.success('Kaitori approved'),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  function handleRevise(values: PriceRevisionFormValues) {
    reviseMutation.mutate({ id: kt!.id, finalPrice: values.final_price, reason: values.revision_reason }, {
      onSuccess: () => { toast.success('Price revised'); setReviseOpen(false) },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  function handlePayment(values: PaymentFormValues) {
    paymentMutation.mutate({ id: kt!.id, paymentMethod: values.payment_method, paidBy: session?.user?.id ?? '' }, {
      onSuccess: () => { toast.success('Payment processed'); setPayOpen(false) },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/kaitori')} aria-label="Back to kaitori requests">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={kt.kaitori_code}
          description={pm ? `${pm.brand} ${pm.model_name}` : 'Kaitori Request'}
          actions={
            <StatusBadge label={statusCfg.label} color={statusCfg.color} />
          }
        />
      </div>

      {/* Status Stepper */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            {STATUS_FLOW.map((step, i) => {
              const cfg = getKaitoriStatusConfig(step)
              const isActive = step === status
              const isDone = currentStepIndex >= 0 && i < currentStepIndex
              const isCancelled = status === 'CANCELLED' || status === 'REJECTED'
              return (
                <div key={step} className="flex items-center">
                  <div className={cn(
                    'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap',
                    isActive ? cfg.color : isDone ? 'bg-green-50 text-green-700 border-green-300' : 'bg-muted text-muted-foreground border-transparent',
                    isCancelled && isActive && 'bg-red-100 text-red-800 border-red-300',
                  )}>
                    {isDone && <CheckCircle2 className="h-3 w-3" />}
                    {cfg.label}
                  </div>
                  {i < STATUS_FLOW.length - 1 && (
                    <div className={cn('w-4 h-0.5 mx-0.5', isDone ? 'bg-green-400' : 'bg-muted')} />
                  )}
                </div>
              )
            })}
            {(status === 'CANCELLED' || status === 'REJECTED' || status === 'PRICE_REVISED') && (
              <div className="ml-2">
                <Badge variant="outline" className={statusCfg.color}>{statusCfg.label}</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {status === 'RECEIVED' && (
          <Button onClick={handleStartInspection} disabled={inspectionMutation.isPending}>
            <Eye className="h-4 w-4 mr-2" />
            {inspectionMutation.isPending ? 'Starting...' : 'Start Inspection'}
          </Button>
        )}
        {status === 'INSPECTING' && (
          <>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder={String(kt.auto_quote_price)}
                value={approvePrice}
                onChange={(e) => setApprovePrice(e.target.value)}
                className="w-32"
              />
              <Button onClick={handleApprove} disabled={approveMutation.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {approveMutation.isPending ? 'Approving...' : 'Approve'}
              </Button>
            </div>
            <Button variant="outline" onClick={() => { reviseForm.reset({ final_price: kt.auto_quote_price, revision_reason: '' }); setReviseOpen(true) }}>
              <DollarSign className="h-4 w-4 mr-2" />
              Revise Price
            </Button>
            <Button variant="destructive" onClick={() => handleStatusAdvance('REJECTED')}>
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </>
        )}
        {status === 'APPROVED' && (
          <Button onClick={() => setPayOpen(true)}>
            <DollarSign className="h-4 w-4 mr-2" />
            Process Payment
          </Button>
        )}
        {status === 'QUOTED' && (
          <Button variant="outline" onClick={() => handleStatusAdvance('CANCELLED')}>
            <XCircle className="h-4 w-4 mr-2" />
            Cancel Request
          </Button>
        )}
        {status === 'ACCEPTED' && kt.delivery_method === 'WALK_IN' && (
          <Button onClick={() => handleStatusAdvance('RECEIVED')}>
            <Package className="h-4 w-4 mr-2" />
            Mark as Received (Walk-in)
          </Button>
        )}
        {status === 'SHIPPED' && (
          <Button onClick={() => handleStatusAdvance('RECEIVED')}>
            <Package className="h-4 w-4 mr-2" />
            Mark as Received
          </Button>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Request Details */}
        <Card>
          <CardHeader>
            <CardTitle>Request Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Code</span><CodeDisplay code={kt.kaitori_code} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Device</span><span>{pm ? `${pm.brand} ${pm.model_name}` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Config</span><span>{pm ? `${pm.cpu ?? ''} / ${pm.ram_gb ?? '?'} / ${pm.storage_gb ?? '?'}` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{deliveryLabel}</span></div>
            {kt.tracking_number && <div className="flex justify-between"><span className="text-muted-foreground">Tracking</span><span className="font-mono">{kt.tracking_number}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{formatDateTime(kt.created_at)}</span></div>
          </CardContent>
        </Card>

        {/* Seller Assessment */}
        <Card>
          <CardHeader>
            <CardTitle>Seller Assessment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Battery</span><Badge variant="outline">{batteryLabel}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Screen</span><Badge variant="outline">{screenLabel}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Body</span><Badge variant="outline">{bodyLabel}</Badge></div>
            {kt.seller_notes && (
              <div className="pt-2 border-t">
                <p className="text-muted-foreground mb-1">Notes:</p>
                <p className="text-sm">{kt.seller_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Auto Quote</span><span className="font-bold">{formatPrice(kt.auto_quote_price)}</span></div>
            {kt.final_price != null && (
              <div className="flex justify-between"><span className="text-muted-foreground">Final Price</span><span className="font-bold text-primary">{formatPrice(kt.final_price)}</span></div>
            )}
            {kt.price_revised && (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Revised?</span><span className="text-orange-600">Yes</span></div>
                {kt.revision_reason && <div className="pt-2 border-t"><p className="text-muted-foreground mb-1">Reason:</p><p>{kt.revision_reason}</p></div>}
                {kt.seller_accepted_revision != null && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Seller Response</span><span>{kt.seller_accepted_revision ? 'Accepted' : 'Rejected'}</span></div>
                )}
              </>
            )}
            {kt.payment_method && (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Payment</span><span>{KAITORI_PAYMENT_METHODS.find(p => p.value === kt.payment_method)?.label ?? kt.payment_method}</span></div>
                {kt.paid_at && <div className="flex justify-between"><span className="text-muted-foreground">Paid At</span><span>{formatDateTime(kt.paid_at)}</span></div>}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Customer Info */}
      {customer && (
        <Card>
          <CardHeader>
            <CardTitle>Seller Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-muted-foreground block">Name</span>{customer.last_name} {customer.first_name ?? ''}</div>
              <div><span className="text-muted-foreground block">Code</span><CodeDisplay code={customer.customer_code} /></div>
              <div><span className="text-muted-foreground block">Email</span>{customer.email}</div>
              <div><span className="text-muted-foreground block">Phone</span>{customer.phone ?? '—'}</div>
              {customer.bank_name && (
                <>
                  <div><span className="text-muted-foreground block">Bank</span>{customer.bank_name}</div>
                  <div><span className="text-muted-foreground block">Branch</span>{customer.bank_branch ?? '—'}</div>
                  <div><span className="text-muted-foreground block">Account #</span>{customer.bank_account_number ?? '—'}</div>
                  <div><span className="text-muted-foreground block">Holder</span>{customer.bank_account_holder ?? '—'}</div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photos */}
      {media.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Seller Photos ({media.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ImageGallery
              images={media.map((m): GalleryImage => ({ id: m.id, url: m.file_url, alt: m.role }))}
              columns={6}
            />
            <div className="flex flex-wrap gap-2 mt-3">
              {media.map((m) => (
                <Badge key={m.id} variant="outline" className="text-xs">{m.role}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revise Price Dialog */}
      <Dialog open={reviseOpen} onOpenChange={setReviseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revise Price</DialogTitle>
          </DialogHeader>
          <Form {...reviseForm}>
            <form onSubmit={reviseForm.handleSubmit(handleRevise)} className="space-y-4">
              <FormField
                control={reviseForm.control}
                name="final_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Price (¥)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reviseForm.control}
                name="revision_reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for Revision *</FormLabel>
                    <FormControl>
                      <Textarea placeholder="e.g. Battery condition worse than declared" rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={reviseMutation.isPending}>
                {reviseMutation.isPending ? 'Saving...' : 'Submit Revision'}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Process Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
          </DialogHeader>
          <div className="mb-4 p-3 bg-muted rounded-lg text-sm">
            <div className="flex justify-between font-bold text-lg">
              <span>Amount</span>
              <span>{formatPrice(kt.final_price ?? kt.auto_quote_price)}</span>
            </div>
          </div>
          <Form {...payForm}>
            <form onSubmit={payForm.handleSubmit(handlePayment)} className="space-y-4">
              <FormField
                control={payForm.control}
                name="payment_method"
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
                        {KAITORI_PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={paymentMutation.isPending}>
                {paymentMutation.isPending ? 'Processing...' : 'Confirm Payment'}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
