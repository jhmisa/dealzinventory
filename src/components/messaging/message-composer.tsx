import { memo, useState, useCallback } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface MessageComposerProps {
  onSend: (content: string) => void
  isLoading?: boolean
  placeholder?: string
}

export const MessageComposer = memo(function MessageComposer({
  onSend,
  isLoading,
  placeholder = 'Type a reply...',
}: MessageComposerProps) {
  const [content, setContent] = useState('')

  const handleSend = useCallback(() => {
    const trimmed = content.trim()
    if (!trimmed) return
    onSend(trimmed)
    setContent('')
  }, [content, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="flex items-end gap-2 border-t p-3">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="min-h-[40px] max-h-[120px] resize-none text-sm"
        rows={1}
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={isLoading || !content.trim()}
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  )
})
