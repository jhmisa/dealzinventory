import { useState } from 'react'
import {
  Video,
  LayoutGrid,
  MessageSquareQuote,
  Quote,
  Image as ImageIcon,
  Archive,
  ArchiveRestore,
  SlidersHorizontal,
} from 'lucide-react'
import type { ContentItem, ContentCategory, ContentItemKind } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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

export interface SchedulePatch {
  active_from: string | null
  active_to: string | null
  cooldown_days: number
}

interface LibraryCardProps {
  item: ContentItem
  categories: ContentCategory[]
  rotation?: { hasRule: boolean; nextDate?: string | null }
  onToggleEvergreen: (item: ContentItem, next: boolean) => void
  onRetire: (item: ContentItem, retired: boolean) => void
  onUpdateSchedule: (item: ContentItem, patch: SchedulePatch) => void
}

export function LibraryCard({
  item,
  categories,
  rotation,
  onToggleEvergreen,
  onRetire,
  onUpdateSchedule,
}: LibraryCardProps) {
  const kind = KIND_META[item.kind as ContentItemKind] ?? KIND_META.photo
  const KindIcon = kind.icon
  const category = categories.find((c) => c.id === item.category_id) ?? null
  const status = rotationStatus(item, rotation ?? { hasRule: false })
  const isRetired = Boolean(item.retired_at)
  const firstMedia = item.media_urls?.[0]

  const [from, setFrom] = useState(item.active_from ?? '')
  const [to, setTo] = useState(item.active_to ?? '')
  const [cooldown, setCooldown] = useState(String(item.cooldown_days ?? 0))

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
          <div className="flex items-center gap-0.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Schedule settings">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 space-y-3" align="end">
                <div className="text-xs font-medium text-muted-foreground">Rotation window</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Active from</Label>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Active until</Label>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Cooldown (days between reuse)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={cooldown}
                    onChange={(e) => setCooldown(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <Button
                  size="sm"
                  className="h-7 w-full text-xs"
                  onClick={() =>
                    onUpdateSchedule(item, {
                      active_from: from || null,
                      active_to: to || null,
                      cooldown_days: Math.max(0, Number(cooldown) || 0),
                    })
                  }
                >
                  Save
                </Button>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onRetire(item, !isRetired)}>
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
        </div>
      </CardContent>
    </Card>
  )
}
