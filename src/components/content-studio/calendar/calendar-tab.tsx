import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useScheduledPosts, useReschedulePost } from '@/hooks/use-content-calendar'
import {
  jstDayKey,
  monthMatrix,
  monthLabel,
  weekDayKeys,
  shiftDayKey,
  bucketByDay,
} from './calendar-model'
import { CalendarMonth } from './calendar-month'
import { CalendarWeek } from './calendar-week'
import { AddContentPopup } from './add-content-popup'

type View = 'month' | 'week'

const jstDayStartISO = (dayKey: string) => new Date(`${dayKey}T00:00:00+09:00`).toISOString()
const jstDayEndISO = (dayKey: string) => new Date(`${dayKey}T23:59:59+09:00`).toISOString()

export function CalendarTab() {
  const todayKey = jstDayKey(new Date().toISOString())
  const [view, setView] = useState<View>('month')
  const [anchorKey, setAnchorKey] = useState(todayKey)
  const [addOpen, setAddOpen] = useState(false)
  const [addDayKey, setAddDayKey] = useState<string | null>(null)

  const [year, monthIndex] = useMemo(() => {
    const [y, m] = anchorKey.split('-').map(Number)
    return [y, m - 1] as const
  }, [anchorKey])

  // The visible day range (JST) → ISO bounds for the query.
  const { startKey, endKey, weekKeys } = useMemo(() => {
    if (view === 'month') {
      const weeks = monthMatrix(year, monthIndex)
      return {
        startKey: weeks[0][0].dayKey,
        endKey: weeks[5][6].dayKey,
        weekKeys: [] as string[],
      }
    }
    const wk = weekDayKeys(anchorKey)
    return { startKey: wk[0], endKey: wk[6], weekKeys: wk }
  }, [view, year, monthIndex, anchorKey])

  const { data: posts = [], isLoading } = useScheduledPosts(jstDayStartISO(startKey), jstDayEndISO(endKey))
  const buckets = useMemo(() => bucketByDay(posts), [posts])
  const reschedule = useReschedulePost()

  function go(delta: number) {
    if (view === 'month') {
      const d = new Date(Date.UTC(year, monthIndex + delta, 1))
      setAnchorKey(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`)
    } else {
      setAnchorKey(shiftDayKey(anchorKey, delta * 7))
    }
  }

  function openAdd(dayKey: string) {
    setAddDayKey(dayKey)
    setAddOpen(true)
  }

  function handleReschedule(postId: string, newISO: string) {
    reschedule.mutate(
      { id: postId, scheduledAt: newISO },
      { onError: (e) => toast.error(`Couldn't reschedule: ${(e as Error).message}`) },
    )
  }

  const heading = view === 'month' ? monthLabel(year, monthIndex) : `${weekKeys[0]} – ${weekKeys[6]}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-40 text-center text-lg font-semibold">{heading}</div>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setAnchorKey(todayKey)}>
            Today
          </Button>
        </div>
        <div className="flex items-center rounded-md border p-0.5">
          {(['month', 'week'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                'rounded px-3 py-1 text-sm font-medium capitalize transition-colors',
                view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : view === 'month' ? (
        <CalendarMonth
          year={year}
          monthIndex={monthIndex}
          buckets={buckets}
          todayKey={todayKey}
          onDayClick={openAdd}
        />
      ) : (
        <CalendarWeek
          weekKeys={weekKeys}
          buckets={buckets}
          todayKey={todayKey}
          onReschedule={handleReschedule}
          onSlotClick={openAdd}
        />
      )}

      <p className="text-xs text-muted-foreground">
        Solid = pinned manually · dashed = auto (from a rule). Drag a card in Week view to move it to another day.
      </p>

      <AddContentPopup open={addOpen} onOpenChange={setAddOpen} dayKey={addDayKey} />
    </div>
  )
}
