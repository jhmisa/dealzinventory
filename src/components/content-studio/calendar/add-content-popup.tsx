import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import type { ContentItem } from '@/lib/types'
import { useContentItems } from '@/hooks/use-content-items'
import { usePinContentToSlot } from '@/hooks/use-content-calendar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface AddContentPopupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Target day (yyyy-MM-dd, JST). */
  dayKey: string | null
}

export function AddContentPopup({ open, onOpenChange, dayKey }: AddContentPopupProps) {
  const [query, setQuery] = useState('')
  const [time, setTime] = useState('18:00')
  const { data: items = [] } = useContentItems({})
  const pin = usePinContentToSlot()

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 20)
    return items
      .filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          (it.item_codes ?? []).some((c) => c.toLowerCase().includes(q)),
      )
      .slice(0, 20)
  }, [items, query])

  function handlePin(item: ContentItem) {
    if (!dayKey) return
    const scheduledAt = new Date(`${dayKey}T${time}:00+09:00`).toISOString()
    pin.mutate(
      { item, scheduledAt },
      {
        onSuccess: () => {
          toast.success('Pinned to calendar')
          onOpenChange(false)
        },
        onError: (e) => toast.error(`Couldn't pin: ${(e as Error).message}`),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add content{dayKey ? ` · ${dayKey}` : ''}</DialogTitle>
          <DialogDescription>Pick a piece from your library and pin it to this slot as a manual post.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search library…"
              className="pl-9"
              autoFocus
            />
          </div>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No library items found.</p>
          ) : (
            results.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-md border p-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-[10px] uppercase text-muted-foreground">
                  {item.media_urls?.[0] && item.kind !== 'video' ? (
                    <img src={item.media_urls[0]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    item.kind.slice(0, 3)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {(item.item_codes ?? []).join(' · ') || item.kind}
                  </div>
                </div>
                <Button size="sm" className="h-7 text-xs" disabled={pin.isPending} onClick={() => handlePin(item)}>
                  Pin
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
