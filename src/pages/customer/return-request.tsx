import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, Loader2, Video } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOrder } from '@/hooks/use-orders'
import { useCreateReturnRequest } from '@/hooks/use-returns'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { FormSkeleton, PriceDisplay } from '@/components/shared'
import { MediaInput } from '@/components/shared/media-input'
import { RETURN_REASONS } from '@/lib/constants'
import { createReturnSchema, type CreateReturnFormValues } from '@/validators/return'
import { cn } from '@/lib/utils'
import type { UploadResult } from '@/lib/media'
import { supabase } from '@/lib/supabase'

type OrderItemRow = {
  id: string
  item_id: string | null
  description: string
  quantity: number
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
}

const STEPS = ['Select Items', 'Describe Issue', 'Upload Evidence', 'Review & Submit'] as const

export default function CustomerReturnRequestPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const { customer } = useCustomerAuth()
  const { data: order, isLoading } = useOrder(orderId!)
  const createReturn = useCreateReturnRequest()

  const [step, setStep] = useState(0)
  const [uploadedMedia, setUploadedMedia] = useState<UploadResult[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<CreateReturnFormValues>({
    resolver: zodResolver(createReturnSchema),
    defaultValues: {
      reason_category: undefined,
      description: '',
      items: [],
    },
  })

  const { watch, setValue, trigger } = form
  const selectedItems = watch('items')
  const reasonCategory = watch('reason_category')
  const description = watch('description')

  if (isLoading) return <FormSkeleton fields={6} />
  if (!order) return <div className="text-center py-12 text-muted-foreground">Order not found.</div>

  const orderItems = (order.order_items ?? []) as OrderItemRow[]

  function isItemSelected(orderItemId: string): boolean {
    return selectedItems.some(i => i.order_item_id === orderItemId)
  }

  function toggleItem(orderItemId: string) {
    const current = form.getValues('items')
    if (current.some(i => i.order_item_id === orderItemId)) {
      setValue('items', current.filter(i => i.order_item_id !== orderItemId))
    } else {
      setValue('items', [...current, { order_item_id: orderItemId, reason_note: '' }])
    }
  }

  async function canAdvance(): Promise<boolean> {
    if (step === 0) {
      return selectedItems.length > 0
    }
    if (step === 1) {
      const valid = await trigger(['reason_category', 'description'])
      return valid
    }
    return true
  }

  async function handleNext() {
    const ok = await canAdvance()
    if (ok) setStep(s => s + 1)
  }

  async function handleSubmit() {
    const valid = await trigger()
    if (!valid || !customer) return

    setIsSubmitting(true)
    try {
      const values = form.getValues()
      const result = await createReturn.mutateAsync({
        order_id: orderId!,
        customer_id: customer.id,
        reason_category: values.reason_category,
        description: values.description,
        items: values.items,
      })

      const returnId = result.id

      for (const item of uploadedMedia) {
        await supabase
          .from('return_request_media')
          .insert({
            return_request_id: returnId,
            file_url: item.displayUrl,
            media_type: item.format === 'mp4' ? 'video' : 'image',
          })
      }

      navigate(`/account/returns/${returnId}`)
    } catch {
      // Error toast is handled by the mutation's onError or global error handler
    } finally {
      setIsSubmitting(false)
    }
  }

  const reasonLabel = RETURN_REASONS.find(r => r.value === reasonCategory)?.label

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="Back to order">
          <a href={`/account/orders/${orderId}`}>
            <ArrowLeft className="h-4 w-4" />
          </a>
        </Button>
        <h1 className="text-2xl font-bold">Request a Return</h1>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, idx) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div
              className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 border-2',
                idx < step
                  ? 'bg-primary border-primary text-primary-foreground'
                  : idx === step
                    ? 'border-primary text-primary ring-2 ring-primary ring-offset-2'
                    : 'border-muted-foreground/30 text-muted-foreground',
              )}
            >
              {idx + 1}
            </div>
            <span className={cn('text-xs hidden sm:block', idx === step ? 'font-semibold' : 'text-muted-foreground')}>
              {label}
            </span>
            {idx < STEPS.length - 1 && (
              <div className={cn('flex-1 h-0.5', idx < step ? 'bg-primary' : 'bg-muted-foreground/20')} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Select Items */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select items to return</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {orderItems.map((oi) => {
              const pm = oi.items?.product_models
              const heroMedia = pm?.product_media
                ?.filter(m => m.role === 'hero')
                .sort((a, b) => a.sort_order - b.sort_order)[0]
              const fallbackMedia = pm?.product_media
                ?.sort((a, b) => a.sort_order - b.sort_order)[0]
              const imgUrl = heroMedia?.file_url ?? fallbackMedia?.file_url
              const checked = isItemSelected(oi.id)

              return (
                <label
                  key={oi.id}
                  className={cn(
                    'flex items-center gap-4 p-3 border rounded-lg cursor-pointer transition-colors',
                    checked ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleItem(oi.id)}
                  />
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={oi.description}
                      className="w-16 h-16 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs shrink-0">
                      No img
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{oi.description}</p>
                    {pm && (
                      <p className="text-sm text-muted-foreground">
                        {[pm.brand, pm.model_name, pm.color].filter(Boolean).join(' / ')}
                      </p>
                    )}
                    {oi.items && (
                      <span className="text-xs text-muted-foreground font-mono">{oi.items.item_code}</span>
                    )}
                  </div>
                  <div className="shrink-0">
                    <PriceDisplay price={Number(oi.unit_price)} />
                  </div>
                </label>
              )
            })}
            {selectedItems.length === 0 && (
              <p className="text-sm text-destructive">Please select at least one item to return.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Reason & Description */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Describe the issue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason</label>
              <Select
                value={reasonCategory}
                onValueChange={(val) => setValue('reason_category', val as CreateReturnFormValues['reason_category'])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {RETURN_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.reason_category && (
                <p className="text-sm text-destructive">{form.formState.errors.reason_category.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Please describe the issue in detail (at least 10 characters)..."
                rows={4}
                {...form.register('description')}
              />
              {form.formState.errors.description && (
                <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Upload Evidence */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Take photos or record a video showing the issue. Up to 5 files — all media is automatically compressed.
            </p>

            <MediaInput
              accept="both"
              bucket="return-media"
              path={`pending-${orderId}`}
              onUpload={(result) => setUploadedMedia((prev) => [...prev, result])}
              maxFiles={5}
              existingMedia={uploadedMedia.map((r) => ({
                id: r.id,
                url: r.displayUrl,
                thumbnailUrl: r.thumbnailUrl,
                type: r.format === 'mp4' ? 'video' as const : 'image' as const,
              }))}
              onRemove={(id) => setUploadedMedia((prev) => prev.filter((r) => r.id !== id))}
            />
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review your return request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Items to return ({selectedItems.length})</p>
              <div className="space-y-2">
                {selectedItems.map((si) => {
                  const oi = orderItems.find(o => o.id === si.order_item_id)
                  return (
                    <div key={si.order_item_id} className="flex items-center gap-3 p-2 border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{oi?.description ?? 'Unknown item'}</p>
                        {oi?.items && (
                          <span className="text-xs text-muted-foreground font-mono">{oi.items.item_code}</span>
                        )}
                      </div>
                      {oi && <PriceDisplay price={Number(oi.unit_price)} />}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground mb-1">Reason</p>
              <p className="text-sm font-medium">{reasonLabel ?? reasonCategory}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm whitespace-pre-wrap">{description}</p>
            </div>

            {uploadedMedia.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-1">Attached files ({uploadedMedia.length})</p>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {uploadedMedia.map((item) => (
                    <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden border">
                      {item.format === 'mp4' ? (
                        <video src={item.displayUrl} className="w-full h-full object-cover" />
                      ) : (
                        <img src={item.displayUrl} alt="Evidence" className="w-full h-full object-cover" />
                      )}
                      {item.format === 'mp4' && (
                        <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1.5 py-0.5">
                          <Video className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(s => s - 1)}
          disabled={step === 0}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={handleNext} className="gap-2">
            Next
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit Return Request
          </Button>
        )}
      </div>
    </div>
  )
}
