import { Video, LayoutGrid, MessageSquareQuote, Quote, Image as ImageIcon, Archive, ArchiveRestore } from 'lucide-react'
import type { ContentItem, ContentCategory, ContentItemKind } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { rotationStatus, type RotationTone } from './rotation-status'

const KIND_META: Record<ContentItemKind, { label: string; icon: typeof Video }> = {
  video: { label: 'Video', icon: Video },
  carousel: { label: 'Carousel', icon: LayoutGrid },
  review_card: { label: 'Review', icon: MessageSquareQuote },
  quote: { label: 'Quote', icon: Quote },
  photo: { label: 'Photo', icon: ImageIcon },
}

const TONE_CLASSES: Record<RotationTone, string> = {
  muted: 'bg-muted text-muted-foreground',
  active: 'bg-emerald-100 text-emerald-700',
  warn: 'bg-amber-100 text-amber-700',
}

interface LibraryCardProps {
  item: ContentItem
  categories: ContentCategory[]
  onToggleEvergreen: (item: ContentItem, next: boolean) => void
  onRetire: (item: ContentItem, retired: boolean) => void
}

export function LibraryCard({ item, categories, onToggleEvergreen, onRetire }: LibraryCardProps) {
  const kind = KIND_META[item.kind as ContentItemKind] ?? KIND_META.photo
  const KindIcon = kind.icon
  const category = categories.find((c) => c.id === item.category_id) ?? null
  const status = rotationStatus(item, { hasRule: false })
  const isRetired = Boolean(item.retired_at)
  const firstMedia = item.media_urls?.[0]

  return (
    <Card className={cn('overflow-hidden', isRetired && 'opacity-70')}>
      <div className="relative flex aspect-video items-center justify-center bg-muted">
        {item.thumbnail_url ? (
          <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : item.kind === 'video' && firstMedia ? (
          <video src={firstMedia} className="h-full w-full object-cover" muted preload="metadata" />
        ) : firstMedia ? (
          <img src={firstMedia} alt="" className="h-full w-full object-cover" />
        ) : (
          <KindIcon className="h-8 w-8 text-muted-foreground" />
        )}
        <Badge variant="secondary" className="absolute left-2 top-2 gap-1">
          <KindIcon className="h-3 w-3" />
          {kind.label}
        </Badge>
      </div>
      <CardContent className="space-y-2 p-3">
        <div className="line-clamp-1 text-sm font-medium" title={item.title}>
          {item.title}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {category ? (
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
              {category.name}
            </span>
          ) : (
            <span className="text-muted-foreground/70">No category</span>
          )}
        </div>
        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', TONE_CLASSES[status.tone])}>
          {status.label}
        </span>
        <div className="flex items-center justify-between border-t pt-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={item.is_evergreen}
              onCheckedChange={(v) => onToggleEvergreen(item, v)}
              disabled={isRetired}
            />
            Evergreen
          </label>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => onRetire(item, !isRetired)}
          >
            {isRetired ? (
              <>
                <ArchiveRestore className="h-3.5 w-3.5" /> Restore
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5" /> Retire
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
