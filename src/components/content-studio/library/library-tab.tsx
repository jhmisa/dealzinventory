import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ContentItem, ContentItemKind } from '@/lib/types'
import { useContentItems, useUpdateContentItem, useRetireContentItem } from '@/hooks/use-content-items'
import { useContentCategories } from '@/hooks/use-content-categories'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LibraryCard } from './library-card'
import { rotationStatus } from './rotation-status'

type KindFilter = 'all' | ContentItemKind
type StatusFilter = 'all' | 'evergreen' | 'not-scheduled' | 'retired'

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'video', label: 'Videos' },
  { value: 'carousel', label: 'Carousels' },
  { value: 'review_card', label: 'Review cards' },
  { value: 'quote', label: 'Quotes' },
  { value: 'photo', label: 'Photos' },
]

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'evergreen', label: 'Evergreen' },
  { value: 'not-scheduled', label: 'Not scheduled' },
  { value: 'retired', label: 'Retired' },
]

function matchesStatus(item: ContentItem, status: StatusFilter): boolean {
  if (status === 'all') return true
  if (status === 'retired') return Boolean(item.retired_at)
  if (item.retired_at) return false
  const label = rotationStatus(item, { hasRule: false }).label
  if (status === 'evergreen') return label.startsWith('Evergreen')
  if (status === 'not-scheduled') return label === 'Not scheduled'
  return true
}

export function LibraryTab() {
  const [kind, setKind] = useState<KindFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')

  // Fetch everything (incl. retired) and filter client-side so status filtering
  // over the computed rotation label stays in one place.
  const { data: items = [], isLoading } = useContentItems({ includeRetired: true })
  const { data: categories = [] } = useContentCategories()
  const updateItem = useUpdateContentItem()
  const retireItem = useRetireContentItem()

  const filtered = useMemo(
    () =>
      items
        .filter((it) => (kind === 'all' ? true : it.kind === kind))
        .filter((it) => matchesStatus(it, status)),
    [items, kind, status],
  )

  function handleToggleEvergreen(item: ContentItem, next: boolean) {
    updateItem.mutate(
      { id: item.id, updates: { is_evergreen: next } },
      { onError: (e) => toast.error(`Couldn't update: ${(e as Error).message}`) },
    )
  }

  function handleRetire(item: ContentItem, retired: boolean) {
    retireItem.mutate(
      { id: item.id, retired },
      {
        onSuccess: () => toast.success(retired ? 'Retired from rotation' : 'Restored to library'),
        onError: (e) => toast.error(`Couldn't update: ${(e as Error).message}`),
      },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Library</h2>
          <p className="text-sm text-muted-foreground">
            Your reusable content pool. Retire hides a piece from rotation without deleting it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as KindFilter)}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {items.length === 0
            ? 'No content yet. Record a video or build a carousel to fill your library.'
            : 'Nothing matches these filters.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => (
            <LibraryCard
              key={item.id}
              item={item}
              categories={categories}
              onToggleEvergreen={handleToggleEvergreen}
              onRetire={handleRetire}
            />
          ))}
        </div>
      )}
    </div>
  )
}
