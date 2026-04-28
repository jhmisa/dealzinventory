import { useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOrder } from '@/hooks/use-orders'
import { useTicketTypes, useCreateCustomerTicket, useUploadTicketMedia } from '@/hooks/use-tickets'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { FormSkeleton, PriceDisplay } from '@/components/shared'
import { RETURN_REASONS } from '@/lib/constants'
import { formatPrice, cn } from '@/lib/utils'

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

export default function CustomerCreateTicketPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { customer } = useCustomerAuth()
  const { data: ticketTypes = [] } = useTicketTypes()
  const createTicket = useCreateCustomerTicket()
  const uploadMedia = useUploadTicketMedia()

  const typeParam = searchParams.get('type') ?? ''
  const orderIdParam = searchParams.get('orderId') ?? ''

  const { data: order, isLoading: orderLoading } = useOrder(orderIdParam)

  const [step, setStep] = useState(0)
  const [ticketTypeSlug, setTicketTypeSlug] = useState(typeParam)
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [reason, setReason] = useState('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const isReturn = ticketTypeSlug === 'return'
  const ticketType = ticketTypes.find(t => t.slug === ticketTypeSlug)
  const orderItems = (order?.order_items ?? []) as OrderItemRow[]

  // Determine steps based on type
  const steps = isReturn
    ? ['Select Type', 'Select Items', 'Describe Issue', 'Upload Evidence', 'Review & Submit']
    : ['Select Type', 'Describe Issue', 'Upload Evidence', 'Review & Submit']

  function canProceed() {
    if (step === 0) return !!ticketTypeSlug
    if (isReturn) {
      if (step === 1) return selectedItems.size > 0
      if (step === 2) return !!reason && description.trim().length >= 10 && subject.trim().length >= 3
      if (step === 3) return true // media optional
      return true
    } else {
      if (step === 1) return description.trim().length >= 10 && subject.trim().length >= 3
      if (step === 2) return true // media optional
      return true
    }
  }

  function toggleItem(id: string) {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setMediaFiles(prev => [...prev, ...files].slice(0, 5))
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit() {
    if (!customer || !ticketType) return

    try {
      const result = await createTicket.mutateAsync({
        customer_id: customer.id,
        ticket_type_slug: ticketTypeSlug,
        subject: subject.trim() || (isReturn ? `Return: ${RETURN_REASONS.find(r => r.value === reason)?.label ?? reason}` : ticketType.label),
        description: description.trim(),
        order_id: orderIdParam || undefined,
        reason_category: isReturn ? reason : undefined,
        items: isReturn
          ? orderItems
              .filter(oi => selectedItems.has(oi.id))
              .map(oi => ({ order_item_id: oi.id }))
          : undefined,
      })

      // Upload media
      for (const file of mediaFiles) {
        await uploadMedia.mutateAsync({ ticketId: result.ticket_id, file })
      }

      toast.success(`Ticket ${result.ticket_code} submitted!`)
      navigate(`/account/tickets/${result.ticket_id}`)
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  if (orderIdParam && orderLoading) return <FormSkeleton fields={4} />

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Create Ticket</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div
              className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium border-2',
                i <= step
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-muted-foreground/30 text-muted-foreground',
              )}
            >
              {i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={cn('flex-1 h-0.5 mx-1', i < step ? 'bg-primary' : 'bg-muted-foreground/20')} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Select Type */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>What do you need help with?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ticketTypes.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTicketTypeSlug(t.slug)}
                className={cn(
                  'w-full text-left p-4 rounded-lg border transition-colors',
                  ticketTypeSlug === t.slug ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                )}
              >
                <span className="font-medium">{t.label}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Return Step 1: Select Items */}
      {isReturn && step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Which items do you want to return?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {orderItems.map(oi => {
              const thumb = oi.items?.product_models?.product_media?.[0]?.file_url
              return (
                <label
                  key={oi.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    selectedItems.has(oi.id) ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                  )}
                >
                  <Checkbox
                    checked={selectedItems.has(oi.id)}
                    onCheckedChange={() => toggleItem(oi.id)}
                  />
                  {thumb && (
                    <img src={thumb} alt="" className="h-12 w-12 rounded object-cover" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {oi.items?.item_code && (
                        <span className="font-mono text-muted-foreground mr-2">{oi.items.item_code}</span>
                      )}
                      {oi.description}
                    </p>
                  </div>
                  <PriceDisplay price={oi.unit_price * oi.quantity} />
                </label>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Describe Issue Step */}
      {((isReturn && step === 2) || (!isReturn && step === 1)) && (
        <Card>
          <CardHeader>
            <CardTitle>Describe the issue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isReturn && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Reason</label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {RETURN_REASONS.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Subject</label>
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Brief summary of the issue"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Description <span className="text-red-500">*</span>
                <span className="text-xs text-muted-foreground ml-1">(min 10 characters)</span>
              </label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Please describe the issue in detail..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Evidence Step */}
      {((isReturn && step === 3) || (!isReturn && step === 2)) && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Evidence (Optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload up to 5 photos or videos to help us understand the issue.
            </p>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Add Photos/Videos
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            {mediaFiles.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {mediaFiles.map((f, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-md border">
                    {f.type.startsWith('video/') ? (
                      <video src={URL.createObjectURL(f)} className="h-full w-full object-cover" />
                    ) : (
                      <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => setMediaFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 bg-black/50 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Review & Submit Step */}
      {step === steps.length - 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Submit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Type: </span>
              <span className="font-medium">{ticketType?.label}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Subject: </span>
              <span className="font-medium">{subject || '(auto-generated)'}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Description: </span>
              <span>{description}</span>
            </div>
            {isReturn && reason && (
              <div className="text-sm">
                <span className="text-muted-foreground">Return Reason: </span>
                <span className="font-medium">{RETURN_REASONS.find(r => r.value === reason)?.label}</span>
              </div>
            )}
            {isReturn && selectedItems.size > 0 && (
              <div className="text-sm">
                <span className="text-muted-foreground">Items to return: </span>
                <span className="font-medium">{selectedItems.size}</span>
              </div>
            )}
            {mediaFiles.length > 0 && (
              <div className="text-sm">
                <span className="text-muted-foreground">Attached files: </span>
                <span className="font-medium">{mediaFiles.length}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(s => s - 1)}
          disabled={step === 0}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        {step < steps.length - 1 ? (
          <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
            Next
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={createTicket.isPending || uploadMedia.isPending}>
            {createTicket.isPending || uploadMedia.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Ticket'
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
