import { memo, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InventoryPicker } from '@/components/shared'
import { formatLeadTime } from '@/lib/format-lead-time'
import { formatPrice } from '@/lib/utils'
import { uploadAttachment } from '@/services/messaging'
import type { MessageAttachment } from '@/lib/types'
import type { AvailableInventoryResult } from '@/services/items'

interface InventorySearchModalProps {
  open: boolean
  onClose: () => void
  onInsertItem: (text: string, attachment?: MessageAttachment, thumbnailUrl?: string) => void
}

export const InventorySearchModal = memo(function InventorySearchModal({
  open,
  onClose,
  onInsertItem,
}: InventorySearchModalProps) {
  const [addingId, setAddingId] = useState<string | null>(null)

  const handleAdd = useCallback(
    async (item: AvailableInventoryResult) => {
      setAddingId(item.id)
      try {
        let attachment: MessageAttachment | undefined
        let thumbnailUrl: string | undefined

        // Download display-size photo (not thumbnail) for attachment
        const imageUrl = item.display_url ?? item.thumbnail_url
        if (imageUrl) {
          try {
            const response = await fetch(imageUrl)
            if (response.ok) {
              const blob = await response.blob()
              const mimeToExt: Record<string, string> = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/webp': 'jpg', // WebP → .jpg for better Messenger compatibility
                'image/gif': 'gif',
              }
              const ext = mimeToExt[blob.type] ?? 'jpg'
              const filename = `${item.code}.${ext}`
              const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })
              attachment = await uploadAttachment(file, `inventory-insert`)
              thumbnailUrl = item.thumbnail_url ?? imageUrl
            }
          } catch {
            // Photo download failed — continue without attachment
          }
        }

        // Build message text with emojis for visual separation
        const baseUrl = import.meta.env.VITE_PUBLIC_SHOP_URL?.replace(/\/shop\/?$/, '') || window.location.origin
        const lines: string[] = []
        const priceText = item.price
          ? item.originalPrice
            ? `💴 ~${formatPrice(item.originalPrice)}~ ${formatPrice(item.price)}`
            : `💴 ${formatPrice(item.price)}`
          : null

        if (item.type === 'item') {
          lines.push(`🏷 ${item.code}`)
          lines.push(`📝 ${item.description}`)
          if (item.condition_notes) lines.push(item.condition_notes)
          if (item.grade) lines.push(`🏅 Rank ${item.grade}`)
          if (priceText) lines.push(priceText)
          lines.push(`📸 Buy Now & View Photos: ${baseUrl}/mine/${item.code}`)
        } else if (item.type === 'sell_group') {
          lines.push(`🏷 ${item.code}`)
          lines.push(`📝 ${item.description}`)
          if (item.grade) lines.push(`🏅 Rank ${item.grade}`)
          if (priceText) lines.push(priceText)
          lines.push(`📸 View & Order: ${baseUrl}/mine/${item.code}`)
        } else if (item.type === 'backorder') {
          // Pre-order block — mirrors offer-reply.ts formatOfferBlock for backorders.
          lines.push(`🏷 ${item.code}`)
          lines.push(`📝 ${item.description}`)
          if (item.grade) lines.push(`🏅 Rank ${item.grade}`)
          if (priceText) lines.push(priceText)
          const lead = formatLeadTime(item.lead_time_min_days, item.lead_time_days)
          lines.push(lead ? `⏳ Pre-order · ${lead}` : `⏳ Pre-order`)
          lines.push(`📸 Buy Now & View Photos: ${baseUrl}/mine/${item.code}`)
        } else {
          lines.push(`🏷 ${item.code}`)
          lines.push(`📝 ${item.description}`)
          if (priceText) lines.push(priceText)
          lines.push(`📸 Buy Now: ${baseUrl}/mine/${item.code}`)
        }
        const text = lines.join('\n')

        onInsertItem(text, attachment, thumbnailUrl)
        toast.success(`Added ${item.code} to message`)
        onClose()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add item')
      } finally {
        setAddingId(null)
      }
    },
    [onInsertItem, onClose],
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!flex !max-h-[80vh] !max-w-3xl !flex-col !gap-0 !p-0 overflow-hidden">
        <DialogHeader className="px-6 pb-2 pt-5">
          <DialogTitle className="text-base">Search Inventory</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col px-6 pb-4">
          <InventoryPicker onAdd={handleAdd} addingId={addingId} autoFocus />
        </div>
      </DialogContent>
    </Dialog>
  )
})
