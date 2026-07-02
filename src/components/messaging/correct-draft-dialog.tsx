import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreateAiCorrection } from '@/hooks/use-messaging'

interface CorrectDraftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerMessage: string
  wrongReply: string
  specialistSlug: string | null
  subIntentSlug: string | null
  conversationId: string | null
  messageId: string | null
}

export function CorrectDraftDialog({
  open, onOpenChange, customerMessage, wrongReply, specialistSlug, subIntentSlug, conversationId, messageId,
}: CorrectDraftDialogProps) {
  const [question, setQuestion] = useState(customerMessage)
  const [correct, setCorrect] = useState('')
  const [note, setNote] = useState('')
  const createCorrection = useCreateAiCorrection()

  // Re-seed the editable question when a different draft opens the dialog.
  if (open && question === '' && customerMessage !== '') setQuestion(customerMessage)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim() || !correct.trim()) return
    createCorrection.mutate(
      {
        customer_message: question.trim(),
        wrong_reply: wrongReply || null,
        correct_reply: correct.trim(),
        note: note.trim() || null,
        specialist_slug: specialistSlug,
        sub_intent_slug: subIntentSlug,
        status: 'PENDING',
        source_conversation_id: conversationId,
        source_message_id: messageId,
      },
      {
        onSuccess: () => {
          toast.success('Correction saved for review')
          setCorrect(''); setNote(''); setQuestion('')
          onOpenChange(false)
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Correct this AI reply</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Customer question</Label>
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} className="min-h-[60px] text-sm" />
          </div>
          <div className="space-y-2">
            <Label>What the AI said (wrong)</Label>
            <p className="rounded border bg-muted/40 p-2 text-sm whitespace-pre-wrap">{wrongReply || '-'}</p>
          </div>
          <div className="space-y-2">
            <Label>What it should have said</Label>
            <Textarea value={correct} onChange={(e) => setCorrect(e.target.value)} className="min-h-[100px] text-sm" placeholder="The correct reply..." autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Why (optional note)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[50px] text-sm" placeholder="e.g. we always list battery % for laptops" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createCorrection.isPending || !question.trim() || !correct.trim()}>
              Save correction
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
