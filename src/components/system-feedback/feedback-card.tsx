import { Bug, Lightbulb, ArrowRight, ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { SystemFeedback, SystemFeedbackStatus } from '@/services/system-feedback'

interface FeedbackCardProps {
  feedback: SystemFeedback
  onSelect: (feedback: SystemFeedback) => void
  onStatusChange: (id: string, status: SystemFeedbackStatus) => void
}

const statusTransitions: Record<SystemFeedbackStatus, { next?: SystemFeedbackStatus; prev?: SystemFeedbackStatus }> = {
  OPEN: { next: 'IN_PROGRESS' },
  IN_PROGRESS: { next: 'DONE', prev: 'OPEN' },
  DONE: { prev: 'IN_PROGRESS' },
}

export function FeedbackCard({ feedback, onSelect, onStatusChange }: FeedbackCardProps) {
  const { next, prev } = statusTransitions[feedback.status]

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onSelect(feedback)}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium leading-tight line-clamp-2">{feedback.title}</h4>
          {feedback.type === 'BUG' ? (
            <Badge variant="destructive" className="shrink-0 text-xs">
              <Bug className="h-3 w-3 mr-1" />Bug
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0 text-xs">
              <Lightbulb className="h-3 w-3 mr-1" />Feature
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {feedback.staff_profiles?.display_name ?? 'Unknown'}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(feedback.created_at).toLocaleDateString(undefined, { timeZone: 'Asia/Tokyo' })}
          </span>
        </div>
        <div className="flex gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
          {prev && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => onStatusChange(feedback.id, prev)}
            >
              <ArrowLeft className="h-3 w-3 mr-1" />{prev.replace('_', ' ')}
            </Button>
          )}
          {next && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs ml-auto"
              onClick={() => onStatusChange(feedback.id, next)}
            >
              {next.replace('_', ' ')}<ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
