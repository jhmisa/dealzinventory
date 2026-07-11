import { useMemo, useState } from 'react'
import type { CalendarPost } from '@/services/content-calendar'
import { formatTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'
import { isGhost } from './calendar-model'

const WEEKDAY_LABEL = (dayKey: string) =>
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(dayKey + 'T00:00:00Z').getUTCDay()]

interface CalendarWeekProps {
  weekKeys: string[]
  buckets: Map<string, CalendarPost[]>
  todayKey: string
  /** Reschedule preserving the post's time-of-day, onto a new day. */
  onReschedule: (postId: string, newISO: string) => void
  onSlotClick: (dayKey: string) => void
}

/** Build a JST ISO instant for a day + an existing post's HH:mm (JST). */
function sameTimeOnDay(dayKey: string, post: CalendarPost): string {
  const hhmm = post.scheduled_at ? formatTime(post.scheduled_at) : '18:00'
  return new Date(`${dayKey}T${hhmm}:00+09:00`).toISOString()
}

export function CalendarWeek({ weekKeys, buckets, todayKey, onReschedule, onSlotClick }: CalendarWeekProps) {
  const [dragOver, setDragOver] = useState<string | null>(null)

  const byId = useMemo(() => {
    const m = new Map<string, CalendarPost>()
    for (const key of weekKeys) for (const p of buckets.get(key) ?? []) m.set(p.id, p)
    return m
  }, [weekKeys, buckets])

  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-lg border">
      {weekKeys.map((dayKey) => {
        const posts = (buckets.get(dayKey) ?? [])
          .slice()
          .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
        const isToday = dayKey === todayKey
        const day = Number(dayKey.split('-')[2])
        return (
          <div
            key={dayKey}
            className={cn('flex min-h-[28rem] flex-col border-r last:border-r-0', dragOver === dayKey && 'bg-accent/50')}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(dayKey)
            }}
            onDragLeave={() => setDragOver((d) => (d === dayKey ? null : d))}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(null)
              const postId = e.dataTransfer.getData('text/post-id')
              const post = byId.get(postId)
              if (post) onReschedule(postId, sameTimeOnDay(dayKey, post))
            }}
          >
            <div
              className={cn(
                'border-b px-2 py-1.5 text-center text-xs font-medium',
                isToday ? 'bg-primary/10 text-primary' : 'bg-muted/40 text-muted-foreground',
              )}
            >
              {WEEKDAY_LABEL(dayKey)} {day}
            </div>
            <button
              type="button"
              onClick={() => onSlotClick(dayKey)}
              className="flex flex-1 flex-col gap-1 p-1.5 text-left hover:bg-accent/30"
            >
              {posts.map((p) => {
                const ghost = isGhost(p)
                const color = p.category?.color ?? '#94a3b8'
                return (
                  <div
                    key={p.id}
                    draggable={!ghost}
                    onDragStart={(e) => {
                      e.stopPropagation()
                      e.dataTransfer.setData('text/post-id', p.id)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      'cursor-grab rounded px-1.5 py-1 text-[11px] leading-tight active:cursor-grabbing',
                      ghost ? 'border border-dashed text-muted-foreground' : 'bg-muted text-foreground',
                    )}
                    style={{ borderLeft: `3px solid ${color}` }}
                    title={p.caption ?? undefined}
                  >
                    <span className="font-medium">{p.scheduled_at ? formatTime(p.scheduled_at) : ''}</span>{' '}
                    <span className="truncate">{p.caption || 'Untitled'}</span>
                  </div>
                )
              })}
              {posts.length === 0 && <span className="mt-1 text-[11px] text-muted-foreground/60">＋ add</span>}
            </button>
          </div>
        )
      })}
    </div>
  )
}
