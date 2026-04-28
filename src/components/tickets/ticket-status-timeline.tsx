import { MessageSquare, ArrowRight, UserCheck, Bot } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import type { TicketNote } from '@/services/tickets'

const NOTE_ICONS: Record<string, typeof MessageSquare> = {
  note: MessageSquare,
  status_change: ArrowRight,
  assignment: UserCheck,
  system: Bot,
}

interface TicketStatusTimelineProps {
  notes: TicketNote[]
}

export function TicketStatusTimeline({ notes }: TicketStatusTimelineProps) {
  if (!notes.length) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => {
        const Icon = NOTE_ICONS[note.note_type] ?? MessageSquare
        return (
          <div key={note.id} className="flex gap-3">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">{note.content}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDateTime(note.created_at)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
