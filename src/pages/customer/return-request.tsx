import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, Upload, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOrder } from '@/hooks/use-orders'
import { useCreateReturnRequest, useUploadReturnMedia } from '@/hooks/use-returns'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { FormSkeleton, PriceDisplay } from '@/components/shared'
import { RETURN_REASONS } from '@/lib/constants'
import { createReturnSchema, type CreateReturnFormValues } from '@/validators/return'
import { cn } from '@/lib/utils'

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

const STEPS = ['Select Items', 'Describe Issue', 'Upload Photos', 'Review & Submit'] as const
const MAX_FILES = 5

export default function CustomerReturnRequestPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const { customer } = useCustomerAuth()
  const { data: order, isLoading } = useOrder(orderId!)
  const createReturn = useCreateReturnRequest()
  const uploadMedia = useUploadReturnMedia()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? [])
    const remaining = MAX_FILES - files.length
    const toAdd = newFiles.slice(0, remaining)

    const newPreviews = toAdd.map(f => URL.createObjectURL(f))
    setFiles(prev => [...prev, ...toAdd])
    setPreviews(prev => [...prev, ...newPreviews])

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeFile(index: number) {
    URL.revokeObjectURL(previews[index])
    setFiles(prev => prev.filter((_, i) => i !== index))
    setPreviews(prev => prev.filter((_, i) => i !== index))
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

      for (const file of files) {
        await uploadMedia.mutateAsync({ returnRequestId: returnId, file })
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

      {/* Step 3: Upload Photos */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload photos or videos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload up to {MAX_FILES} photos or videos showing the issue. This helps us process your return faster.
            </p>

            {files.length < MAX_FILES && (
              <div>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  id="return-media-upload"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Add Files ({files.length}/{MAX_FILES})
                </Button>
              </div>
            )}

            {previews.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {previews.map((url, idx) => (
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border">
                    {files[idx].type.startsWith('video/') ? (
                      <video src={url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={url} alt={`Upload ${idx + 1}`} className="w-full h-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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

            {files.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-1">Attached files ({files.length})</p>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {previews.map((url, idx) => (
                    <div key={idx} className="aspect-square rounded-lg overflow-hidden border">
                      {files[idx].type.startsWith('video/') ? (
                        <video src={url} className="w-full h-full object-cover" />
                      ) : (
                        <img src={url} alt={`Upload ${idx + 1}`} className="w-full h-full object-cover" />
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
