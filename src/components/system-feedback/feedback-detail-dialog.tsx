import { Bug, Lightbulb, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SystemFeedback, SystemFeedbackStatus } from '@/services/system-feedback'

interface FeedbackDetailDialogProps {
  feedback: SystemFeedback | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatusChange: (id: string, status: SystemFeedbackStatus) => void
  onDelete: (id: string) => void
}

export function FeedbackDetailDialog({ feedback, open, onOpenChange, onStatusChange, onDelete }: FeedbackDetailDialogProps) {
  if (!feedback) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {feedback.type === 'BUG' ? (
              <Badge variant="destructive"><Bug className="h-3 w-3 mr-1" />Bug</Badge>
            ) : (
              <Badge variant="secondary"><Lightbulb className="h-3 w-3 mr-1" />Feature</Badge>
            )}
            <span className="text-xs text-muted-foreground font-normal">{feedback.feedback_code}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium">{feedback.title}</h3>
            {feedback.description && (
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{feedback.description}</p>
            )}
          </div>

          {feedback.system_feedback_media && feedback.system_feedback_media.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Attachments</p>
              <div className="grid grid-cols-2 gap-2">
                {feedback.system_feedback_media.map((media) => (
                  <a key={media.id} href={media.file_url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={media.file_url}
                      alt="Screenshot"
                      className="rounded border object-cover h-32 w-full"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">By: </span>
              {feedback.staff_profiles?.display_name ?? 'Unknown'}
            </div>
            <div>
              <span className="text-muted-foreground">Created: </span>
              {new Date(feedback.created_at).toLocaleString()}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Select
                value={feedback.status}
                onValueChange={(v) => onStatusChange(feedback.id, v as SystemFeedbackStatus)}
              >
                <SelectTrigger className="w-[150px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="DONE">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive hover:text-destructive"
              onClick={() => onDelete(feedback.id)}
            >
              <Trash2 className="h-4 w-4 mr-1" />Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
