import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy, X, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PageHeader,
  StatusBadge,
  GradeBadge,
  CodeDisplay,
  PriceDisplay,
  ConfirmDialog,
  FormSkeleton,
} from '@/components/shared'
import {
  useOfferByCode,
  useUpdateOffer,
  useAddItemByCode,
  useAddCustomOfferItem,
  useRemoveOfferItem,
  useCancelOffer,
  useOfferRealtimeSync,
} from '@/hooks/use-offers'
import { OFFER_STATUSES } from '@/lib/constants'
import { formatDateTime, formatPrice, cn } from '@/lib/utils'

type OfferItem = {
  id: string
  item_id: string | null
  description: string
  unit_price: number
  quantity: number
  added_by: string
  created_at: string
  items: {
    id: string
    item_code: string
    condition_grade: string
    item_status: string
    selling_price: number | null
    product_models: {
      brand: string
      model_name: string
      color: string | null
      short_description: string | null
      cpu: string | null
      ram_gb: string | null
      storage_gb: string | null
      product_media: { id: string; file_url: string; role: string; sort_order: number; media_type: string }[]
    } | null
  } | null
}

export default function OfferDetailPage() {
  const { offerCode } = useParams<{ offerCode: string }>()
  const navigate = useNavigate()
  const { data: offer, isLoading } = useOfferByCode(offerCode!)
  const updateOffer = useUpdateOffer()
  const addItemByCode = useAddItemByCode()
  const addCustomItem = useAddCustomOfferItem()
  const removeItem = useRemoveOfferItem()
  const cancelOffer = useCancelOffer()

  useOfferRealtimeSync(offer?.id)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [removeItemId, setRemoveItemId] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState('')
  const [addCode, setAddCode] = useState('')
  const [addingCode, setAddingCode] = useState(false)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customDesc, setCustomDesc] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [customQty, setCustomQty] = useState('1')

  if (isLoading) return <FormSkeleton />
  if (!offer) return <div className="p-8 text-center text-muted-foreground">Offer not found</div>

  const isPending = offer.offer_status === 'PENDING'
  const offerItems = (offer.offer_items ?? []) as OfferItem[]
  const total = offerItems.reduce((sum, oi) => sum + Number(oi.unit_price) * oi.quantity, 0)
  const statusCfg = OFFER_STATUSES.find(s => s.value === offer.offer_status)
  const offerUrl = `${window.location.origin}/offer/${offer.offer_code}`

  // Expiry
  const expiresAt = new Date(offer.expires_at)
  const now = new Date()
  const hoursLeft = Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)))
  const minutesLeft = Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60)))

  function handleStartEditNotes() {
    setNotes(offer.notes ?? '')
    setEditingNotes(true)
  }

  function handleSaveNotes() {
    updateOffer.mutate(
      { id: offer.id, updates: { notes } },
      {
        onSuccess: () => {
          toast.success('Notes updated')
          setEditingNotes(false)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleAddByCode() {
    if (!addCode.trim()) return
    setAddingCode(true)
    addItemByCode.mutate(
      { offerId: offer.id, code: addCode.trim() },
      {
        onSuccess: () => {
          toast.success(`Added ${addCode.trim()}`)
          setAddCode('')
          setAddingCode(false)
        },
        onError: (err) => {
          toast.error(err.message)
          setAddingCode(false)
        },
      },
    )
  }

  function handleAddCustom() {
    const price = parseFloat(customPrice)
    const qty = parseInt(customQty, 10)
    if (!customDesc.trim() || isNaN(price) || price < 0 || isNaN(qty) || qty < 1) {
      toast.error('Please fill in all fields correctly')
      return
    }
    addCustomItem.mutate(
      { offerId: offer.id, item: { description: customDesc.trim(), unit_price: price, quantity: qty } },
      {
        onSuccess: () => {
          toast.success('Custom item added')
          setCustomDesc('')
          setCustomPrice('')
          setCustomQty('1')
          setShowCustomForm(false)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleRemoveItem() {
    if (!removeItemId) return
    removeItem.mutate(removeItemId, {
      onSuccess: () => {
        toast.success('Item removed')
        setRemoveItemId(null)
      },
      onError: (err) => toast.error(err.message),
    })
  }

  function handleCancel() {
    cancelOffer.mutate(offer.id, {
      onSuccess: () => {
        toast.success('Offer cancelled')
        setCancelOpen(false)
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <CodeDisplay code={offer.offer_code} />
            {statusCfg && <StatusBadge label={statusCfg.label} color={statusCfg.color} />}
            {isPending && (
              <span className={cn('text-sm', hoursLeft < 6 ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                {hoursLeft > 0 ? `${hoursLeft}h left` : minutesLeft > 0 ? `${minutesLeft}m left` : 'Expired'}
              </span>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(offerUrl)
                toast.success('Link copied!')
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copy Link
            </Button>
            {isPending && (
              <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel Offer
              </Button>
            )}
          </div>
        }
      />

      {/* Info Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">FB Name</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{offer.fb_name}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Created</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{formatDateTime(offer.created_at)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Notes
              {isPending && !editingNotes && (
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleStartEditNotes}>
                  Edit
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveNotes} disabled={updateOffer.isPending}>
                    {updateOffer.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{offer.notes || '—'}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Items ({offerItems.length})</CardTitle>
            <div className="flex items-center gap-2 text-lg font-semibold">
              Total: <PriceDisplay amount={total} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {offerItems.map((oi) => {
            const pm = oi.items?.product_models
            const sortedMedia = pm?.product_media
              ?.slice()
              .sort((a, b) => a.sort_order - b.sort_order) ?? []
            const heroMedia = sortedMedia.find(m => m.role === 'hero') ?? sortedMedia[0] ?? null

            return (
              <div key={oi.id} className="flex items-center gap-4 p-3 border rounded-lg">
                {/* Thumbnail */}
                {heroMedia ? (
                  <img
                    src={heroMedia.file_url}
                    alt={oi.description}
                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs flex-shrink-0">
                    No img
                  </div>
                )}

                {/* Description */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{oi.description}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground">
                    {oi.items && <CodeDisplay code={oi.items.item_code} />}
                    {oi.items && <GradeBadge grade={oi.items.condition_grade} />}
                    {oi.quantity > 1 && <span>x{oi.quantity}</span>}
                  </div>
                </div>

                {/* Price */}
                <div className="text-right flex-shrink-0">
                  <PriceDisplay amount={Number(oi.unit_price) * oi.quantity} />
                  {oi.quantity > 1 && (
                    <p className="text-xs text-muted-foreground">
                      <PriceDisplay amount={Number(oi.unit_price)} /> each
                    </p>
                  )}
                </div>

                {/* Remove button */}
                {isPending && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600 hover:text-red-700 flex-shrink-0"
                    onClick={() => setRemoveItemId(oi.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )
          })}

          {offerItems.length === 0 && (
            <p className="text-center text-muted-foreground py-4">No items in this offer</p>
          )}
        </CardContent>
      </Card>

      {/* Add Items (PENDING only) */}
      {isPending && (
        <Card>
          <CardHeader>
            <CardTitle>Add Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add by code */}
            <div className="flex gap-2">
              <Input
                value={addCode}
                onChange={(e) => setAddCode(e.target.value)}
                placeholder="Enter P-code or G-code (e.g. P000100)"
                onKeyDown={(e) => e.key === 'Enter' && handleAddByCode()}
              />
              <Button onClick={handleAddByCode} disabled={addingCode || !addCode.trim()}>
                {addingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Add
              </Button>
            </div>

            {/* Custom item form */}
            {showCustomForm ? (
              <div className="space-y-3 p-3 border rounded-lg">
                <Input
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  placeholder="Description"
                />
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    placeholder="Price"
                    min={0}
                  />
                  <Input
                    type="number"
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                    placeholder="Qty"
                    min={1}
                    className="w-24"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddCustom} disabled={addCustomItem.isPending}>
                    {addCustomItem.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add Custom Item'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCustomForm(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowCustomForm(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Custom Item
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel Offer"
        description={`Cancel offer ${offer.offer_code}? Reserved items will be made available again.`}
        onConfirm={handleCancel}
        loading={cancelOffer.isPending}
        variant="destructive"
      />

      <ConfirmDialog
        open={!!removeItemId}
        onOpenChange={(open) => !open && setRemoveItemId(null)}
        title="Remove Item"
        description="Remove this item from the offer? If it's an inventory item, it will be made available again."
        onConfirm={handleRemoveItem}
        loading={removeItem.isPending}
        variant="destructive"
      />
    </div>
  )
}
