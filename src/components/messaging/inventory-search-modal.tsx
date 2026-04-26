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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GradeBadge } from '@/components/shared/grade-badge'
import { formatPrice } from '@/lib/utils'
import { useAvailableInventorySearch, useAvailableBrands } from '@/hooks/use-items'
import { useCategories } from '@/hooks/use-categories'
import { uploadAttachment } from '@/services/messaging'
import type { MessageAttachment, ConditionGrade } from '@/lib/types'
import type { AvailableInventoryResult, InventorySearchFilters } from '@/services/items'

function getShopUrl() {
  return import.meta.env.VITE_PUBLIC_SHOP_URL || `${window.location.origin}/shop`
}

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

  // Filters
  const [brand, setBrand] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [priceMin, setPriceMin] = useState<string>('')
  const [priceMax, setPriceMax] = useState<string>('')
  const [debouncedPriceMin, setDebouncedPriceMin] = useState<string>('')
  const [debouncedPriceMax, setDebouncedPriceMax] = useState<string>('')

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  // Debounce price inputs
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPriceMin(priceMin)
      setDebouncedPriceMax(priceMax)
    }, 500)
    return () => clearTimeout(timer)
  }, [priceMin, priceMax])

  const filters: InventorySearchFilters = {
    ...(brand ? { brand } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(debouncedPriceMin ? { priceMin: Number(debouncedPriceMin) } : {}),
    ...(debouncedPriceMax ? { priceMax: Number(debouncedPriceMax) } : {}),
  }

  const { data: results = [], isLoading } = useAvailableInventorySearch(debouncedQuery, filters)
  const { data: brands = [] } = useAvailableBrands()
  const { data: categories = [] } = useCategories()

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery('')
      setDebouncedQuery('')
      setBrand('')
      setCategoryId('')
      setPriceMin('')
      setPriceMax('')
      setDebouncedPriceMin('')
      setDebouncedPriceMax('')
    }
  }, [open])

  const hasQuery = debouncedQuery.trim().length >= 2
  const hasFilters = !!(brand || categoryId || debouncedPriceMin || debouncedPriceMax)
  const hasInput = hasQuery || hasFilters

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
          {
            const baseUrl = import.meta.env.VITE_PUBLIC_SHOP_URL?.replace(/\/shop\/?$/, '') || window.location.origin
            lines.push(`Buy Now & View Photos: ${baseUrl}/mine/${item.code}`)
          }
        } else if (item.type === 'sell_group') {
          lines.push(item.code)
          lines.push(item.description)
          if (item.grade) lines.push(`Rank ${item.grade}`)
          if (item.price) lines.push(formatPrice(item.price))
          {
            const shopUrl = getShopUrl()
            lines.push(`View & Order: ${shopUrl}/product/${item.id}`)
          }
        } else {
          lines.push(item.code)
          lines.push(item.description)
          if (item.price) lines.push(formatPrice(item.price))
          if (item.accessory_id) {
            const shopUrl = getShopUrl()
            lines.push(`${shopUrl}/accessory/${item.accessory_id}`)
          }
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
      <DialogContent className="!max-w-3xl !max-h-[80vh] !flex !flex-col !gap-0 !p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-2">
          <DialogTitle className="text-base">Search Inventory</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-2 space-y-2">
          <div className="flex gap-2">
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={brand} onValueChange={(v) => setBrand(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="number"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              placeholder="¥ Min"
              className="h-8 text-xs w-24"
            />
            <Input
              type="number"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              placeholder="¥ Max"
              className="h-8 text-xs w-24"
            />
          </div>

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

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4">
          {isLoading && hasInput ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 && hasInput ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No available items found
            </p>
          ) : !hasInput ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Type at least 2 characters or select a filter
            </p>
          ) : (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="w-12 pb-2"></th>
                  <th className="w-[88px] pb-2 pr-3">Code</th>
                  <th className="w-14 pb-2">Grade</th>
                  <th className="pb-2 pr-3">Description</th>
                  <th className="w-20 pb-2 pr-3 text-right">Price</th>
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
                      <span className="text-xs line-clamp-2">{item.description}</span>
                      {item.condition_notes && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{item.condition_notes}</p>
                      )}
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
        </div>
      </DialogContent>
    </Dialog>
  )
})
