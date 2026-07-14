import { useNavigate } from 'react-router-dom'
import { AlertCircle, CalendarClock, CalendarDays, CircleDashed } from 'lucide-react'
import { CodeDisplay, StatusBadge } from '@/components/shared'
import { TicketTypeBadge } from '@/components/tickets/ticket-type-badge'
import { TICKET_PRIORITIES, TICKET_STATUSES } from '@/lib/constants'
import { bucketTickets, todayJst, type TicketBuckets } from '@/lib/ticket-followups'
import { cn, formatCustomerName } from '@/lib/utils'
import type { QueueTicket } from '@/services/tickets'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-07-22" → "Jul 22" without timezone-shifting Date parsing
function shortDate(d: string): string {
  const [, m, day] = d.split('-')
  return `${MONTHS[Number(m) - 1]} ${Number(day)}`
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

type BucketKey = keyof TicketBuckets<unknown>

const SECTIONS: { key: BucketKey; title: string; icon: typeof AlertCircle; accent: string }[] = [
  { key: 'needsAttention', title: 'Needs Attention', icon: AlertCircle, accent: 'text-red-600' },
  { key: 'dueToday', title: 'Due Today', icon: CalendarClock, accent: 'text-amber-600' },
  { key: 'upcoming', title: 'Upcoming', icon: CalendarDays, accent: 'text-muted-foreground' },
  { key: 'noDate', title: 'No Date', icon: CircleDashed, accent: 'text-muted-foreground' },
]

type QueueEntry = QueueTicket & { kind: 'problem' | 'followup' }

function dueLabel(t: QueueEntry, bucket: BucketKey, today: string) {
  if (t.follow_up_at) {
    if (bucket === 'needsAttention') {
      const days = daysBetween(t.follow_up_at, today)
      return (
        <span className="text-xs font-medium text-red-600">
          was due {shortDate(t.follow_up_at)} · {days}d overdue
        </span>
      )
    }
    if (bucket === 'dueToday') {
      return <span className="text-xs font-medium text-amber-600">today</span>
    }
    return <span className="text-xs text-muted-foreground">{shortDate(t.follow_up_at)}</span>
  }
  if (bucket === 'needsAttention') {
    const days = daysBetween(t.created_at.slice(0, 10), today)
    return <span className="text-xs text-muted-foreground">{days}d old</span>
  }
  return <span className="text-xs text-muted-foreground italic">no date set</span>
}

export function TicketQueue({ tickets }: { tickets: QueueTicket[] }) {
  const navigate = useNavigate()
  const today = todayJst()

  const entries: QueueEntry[] = tickets.map((t) => ({
    ...t,
    kind: t.ticket_types?.kind ?? 'problem',
  }))
  const buckets = bucketTickets(entries)

  const isEmpty = entries.length === 0

  if (isEmpty) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Queue is clear — no open tickets. 🎉
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {SECTIONS.map(({ key, title, icon: Icon, accent }) => {
        const rows = buckets[key]
        if (rows.length === 0) return null
        return (
          <section key={key}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className={cn('h-4 w-4', accent)} />
              <h3 className={cn('text-sm font-semibold', accent)}>{title}</h3>
              <span className="text-xs text-muted-foreground">({rows.length})</span>
            </div>
            <div className="rounded-lg border divide-y overflow-hidden">
              {rows.map((t) => {
                const c = t.customers
                const who = c
                  ? formatCustomerName(c)
                  : t.conversations?.contact_name ?? '—'
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => navigate(`/admin/tickets/${t.id}`)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors',
                      key === 'needsAttention' && 'bg-red-50/50 dark:bg-red-950/10',
                      key === 'dueToday' && 'bg-amber-50/40 dark:bg-amber-950/10',
                    )}
                  >
                    <CodeDisplay code={t.ticket_code} className="shrink-0 text-xs" />
                    <TicketTypeBadge ticketType={t.ticket_types} />
                    <span className="flex-1 min-w-0 truncate">{t.subject}</span>
                    <span className="hidden md:block shrink-0 max-w-[180px] truncate text-xs text-muted-foreground">
                      {who}
                      {c && <span className="ml-1 font-mono">{c.customer_code}</span>}
                    </span>
                    <span className="shrink-0 w-36 text-right">{dueLabel(t, key, today)}</span>
                    {t.priority !== 'NORMAL' && (
                      <StatusBadge status={t.priority} config={TICKET_PRIORITIES} />
                    )}
                    {t.ticket_status !== 'OPEN' && (
                      <StatusBadge status={t.ticket_status} config={TICKET_STATUSES} />
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
