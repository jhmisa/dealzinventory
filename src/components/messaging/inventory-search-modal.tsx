import { memo, useState, useCallback, useEffect } from 'react'
import { Search, Plus, Loader2, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { GradeBadge } from '@/components/shared/grade-badge'
import { formatPrice } from '@/lib/utils'
import { useAvailableInventorySearch } from '@/hooks/use-items'
import { uploadAttachment } from '@/services/messaging'
import type { MessageAttachment, ConditionGrade } from '@/lib/types'
import type { AvailableInventoryResult } from '@/services/items'

const SHOP_URL = import.meta.env.VITE_PUBLIC_SHOP_URL ?? ''

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
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [addingId, setAddingId] = useState<string | null>(null)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const { data: results = [], isLoading } = useAvailableInventorySearch(debouncedQuery)

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery('')
      setDebouncedQuery('')
    }
  }, [open])

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
                'image/webp': 'jpg',  // WebP → .jpg for better Messenger compatibility
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

        // Build message text matching Available items table format
        const lines: string[] = []
        if (item.type === 'item') {
          lines.push(item.code)
          lines.push(item.description)
          if (item.condition_notes) lines.push(item.condition_notes)
          if (item.grade) lines.push(`Rank ${item.grade}`)
          if (item.price) lines.push(formatPrice(item.price))
          if (SHOP_URL && item.product_model_id) {
            lines.push(`${SHOP_URL}/shop/product/${item.product_model_id}`)
          }
        } else {
          lines.push(item.code)
          lines.push(item.description)
          if (item.price) lines.push(formatPrice(item.price))
          if (SHOP_URL && item.accessory_id) {
            lines.push(`${SHOP_URL}/shop/accessory/${item.accessory_id}`)
          }
        }
        const text = lines.join('\n')

        onInsertItem(text, attachment, thumbnailUrl)
        toast.success(`Added ${item.code} to message`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add item')
      } finally {
        setAddingId(null)
      }
    },
    [onInsertItem],
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base">Search Inventory</DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by code or description..."
              className="pl-9 h-9"
              autoFocus
            />
          </div>
        </div>

        <ScrollArea className="flex-1 px-4 pb-4">
          {isLoading && debouncedQuery.length >= 2 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 && debouncedQuery.length >= 2 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No available items found
            </p>
          ) : debouncedQuery.length < 2 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Type at least 2 characters to search
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="w-12 pb-2"></th>
                  <th className="pb-2 pr-3">Code</th>
                  <th className="w-14 pb-2">Grade</th>
                  <th className="pb-2 pr-3">Description</th>
                  <th className="pb-2 pr-3 text-right">Price</th>
                  <th className="w-16 pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => (
                  <tr key={`${item.type}-${item.id}`} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      {item.thumbnail_url ? (
                        <img
                          src={item.thumbnail_url}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs">{item.code}</span>
                    </td>
                    <td className="py-2">
                      {item.grade ? (
                        <GradeBadge grade={item.grade as ConditionGrade} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-xs">{item.description}</span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className="text-xs font-medium">{formatPrice(item.price)}</span>
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        disabled={addingId === item.id}
                        onClick={() => handleAdd(item)}
                      >
                        {addingId === item.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                        Add
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
})
