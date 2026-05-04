import { FeedbackCard } from './feedback-card'
import type { SystemFeedback, SystemFeedbackStatus } from '@/services/system-feedback'

interface KanbanBoardProps {
  feedbackItems: SystemFeedback[]
  onSelect: (feedback: SystemFeedback) => void
  onStatusChange: (id: string, status: SystemFeedbackStatus) => void
}

const columns: { status: SystemFeedbackStatus; label: string; color: string }[] = [
  { status: 'OPEN', label: 'Open', color: 'bg-blue-500' },
  { status: 'IN_PROGRESS', label: 'In Progress', color: 'bg-yellow-500' },
  { status: 'DONE', label: 'Done', color: 'bg-green-500' },
]

export function KanbanBoard({ feedbackItems, onSelect, onStatusChange }: KanbanBoardProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
      {columns.map((col) => {
        const items = feedbackItems.filter((f) => f.status === col.status)
        return (
          <div key={col.status} className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
              <h3 className="font-medium text-sm">{col.label}</h3>
              <span className="text-xs text-muted-foreground ml-auto">{items.length}</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto rounded-lg bg-muted/30 p-2 min-h-[200px]">
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No items</p>
              ) : (
                items.map((feedback) => (
                  <FeedbackCard
                    key={feedback.id}
                    feedback={feedback}
                    onSelect={onSelect}
                    onStatusChange={onStatusChange}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
