import type { CalendarPost } from '@/services/content-calendar'
import { cn } from '@/lib/utils'
import { monthMatrix, isGhost } from './calendar-model'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface CalendarMonthProps {
  year: number
  monthIndex: number
  buckets: Map<string, CalendarPost[]>
  todayKey: string
  onDayClick: (dayKey: string) => void
}

function PostChip({ post }: { post: CalendarPost }) {
  const color = post.category?.color ?? '#94a3b8'
  const ghost = isGhost(post)
  return (
    <div
      className={cn(
        'truncate rounded px-1.5 py-0.5 text-[11px] leading-tight',
        ghost ? 'border border-dashed bg-transparent text-muted-foreground' : 'bg-muted text-foreground',
      )}
      style={{ borderLeft: `3px solid ${color}` }}
      title={post.caption ?? undefined}
    >
      {post.caption || 'Untitled'}
    </div>
  )
}

export function CalendarMonth({ year, monthIndex, buckets, todayKey, onDayClick }: CalendarMonthProps) {
  const weeks = monthMatrix(year, monthIndex)
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((cell) => {
          const posts = buckets.get(cell.dayKey) ?? []
          const isToday = cell.dayKey === todayKey
          const isPast = cell.dayKey < todayKey
          return (
            <button
              key={cell.dayKey}
              type="button"
              onClick={() => onDayClick(cell.dayKey)}
              className={cn(
                'flex min-h-24 flex-col gap-1 border-b border-r p-1.5 text-left transition-colors hover:bg-accent/50',
                !cell.inMonth && 'bg-muted/20 text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-5 w-5 items-center justify-center self-start rounded-full text-xs',
                  isToday && 'bg-primary font-semibold text-primary-foreground',
                )}
              >
                {cell.day}
              </span>
              {isPast && posts.length > 0 ? (
                <span className="text-[11px] text-muted-foreground">{posts.length} posted</span>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {posts.slice(0, 3).map((p) => (
                    <PostChip key={p.id} post={p} />
                  ))}
                  {posts.length > 3 && (
                    <span className="text-[11px] text-muted-foreground">+{posts.length - 3} more</span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
