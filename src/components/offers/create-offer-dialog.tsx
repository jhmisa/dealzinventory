import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useCreateOfferOrAddItem } from '@/hooks/use-offers'
import { createOfferSchema, type CreateOfferFormValues } from '@/validators/offer'
import { formatPrice } from '@/lib/utils'
import type { Item, ProductModel } from '@/lib/types'

interface CreateOfferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: Item & { product_models?: ProductModel | null }
}

export function CreateOfferDialog({ open, onOpenChange, item }: CreateOfferDialogProps) {
  const createOffer = useCreateOfferOrAddItem()
  const [result, setResult] = useState<{ offerCode: string; isExisting: boolean } | null>(null)
  const [copied, setCopied] = useState(false)

  const pm = item.product_models
  const description = pm
    ? `${pm.brand} ${pm.model_name}${pm.color ? ` (${pm.color})` : ''}`
    : item.item_code

  const form = useForm<CreateOfferFormValues>({
    resolver: zodResolver(createOfferSchema),
    defaultValues: {
      fb_name: '',
      price: Number(item.selling_price ?? 0),
      notes: '',
    },
  })

  function handleSubmit(values: CreateOfferFormValues) {
    createOffer.mutate(
      {
        fb_name: values.fb_name,
        item_id: item.id,
        price: values.price,
        description,
        notes: values.notes || undefined,
      },
      {
        onSuccess: (offer) => {
          setResult({
            offerCode: offer.offer_code,
            isExisting: offer.isExisting,
          })
          toast.success(
            offer.isExisting
              ? `Item added to existing offer ${offer.offer_code}`
              : `Offer ${offer.offer_code} created`
          )
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  const offerUrl = result ? `${window.location.origin}/offer/${result.offerCode}` : ''

  function handleCopy() {
    navigator.clipboard.writeText(offerUrl)
    setCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClose() {
    setResult(null)
    form.reset()
    onOpenChange(false)
  }

  // Success state: show link
  if (result) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {result.isExisting ? 'Item Added to Offer' : 'Offer Created'}
            </DialogTitle>
            <DialogDescription>
              Share this link with the buyer to complete the purchase.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <code className="flex-1 text-sm break-all">{offerUrl}</code>
              <Button variant="ghost" size="icon" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              <p>Offer Code: <span className="font-mono font-medium">{result.offerCode}</span></p>
              <p>Item: {description} ({item.item_code})</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Close</Button>
            <Button onClick={() => window.open(offerUrl, '_blank')}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Offer</DialogTitle>
          <DialogDescription>
            Create a shareable offer link for {item.item_code} — {description}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fb_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>FB Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Juan Dela Cruz" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price (JPY)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Optional notes for the buyer..." rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={createOffer.isPending}>
                {createOffer.isPending ? 'Creating...' : 'Create Offer'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
