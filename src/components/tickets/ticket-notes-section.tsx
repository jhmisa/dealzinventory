import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAddTicketNote } from '@/hooks/use-tickets'
import { TicketStatusTimeline } from './ticket-status-timeline'
import { toast } from 'sonner'
import type { TicketNote } from '@/services/tickets'

interface TicketNotesSectionProps {
  ticketId: string
  notes: TicketNote[]
}

export function TicketNotesSection({ ticketId, notes }: TicketNotesSectionProps) {
  const [content, setContent] = useState('')
  const addNote = useAddTicketNote()

  function handleAddNote() {
    if (!content.trim()) return
    addNote.mutate(
      { ticketId, content: content.trim() },
      {
        onSuccess: () => {
          setContent('')
          toast.success('Note added')
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add an internal note..."
          rows={3}
        />
        <Button
          size="sm"
          onClick={handleAddNote}
          disabled={!content.trim() || addNote.isPending}
        >
          {addNote.isPending ? 'Adding...' : 'Add Note'}
        </Button>
      </div>
      <TicketStatusTimeline notes={notes} />
    </div>
  )
}
