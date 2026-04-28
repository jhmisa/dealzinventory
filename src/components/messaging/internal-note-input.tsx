import { useState, useCallback } from 'react'
import { SendHorizonal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSendInternalNote } from '@/hooks/use-messaging'
import { toast } from 'sonner'

interface InternalNoteInputProps {
  conversationId: string
}

export function InternalNoteInput({ conversationId }: InternalNoteInputProps) {
  const [content, setContent] = useState('')
  const sendNote = useSendInternalNote()

  const handleSend = useCallback(() => {
    const trimmed = content.trim()
    if (!trimmed) return

    sendNote.mutate(
      { conversationId, content: trimmed },
      {
        onSuccess: () => setContent(''),
        onError: (err) => toast.error(`Failed to send note: ${err.message}`),
      },
    )
  }, [content, conversationId, sendNote])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="flex items-center gap-2 border-t border-dashed border-muted-foreground/20 px-4 py-2 bg-amber-50/30">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Chat with your team..."
        rows={1}
        className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none"
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0 text-amber-600 hover:text-amber-700 hover:bg-amber-100"
        onClick={handleSend}
        disabled={!content.trim() || sendNote.isPending}
      >
        <SendHorizonal className="h-4 w-4" />
      </Button>
    </div>
  )
}
