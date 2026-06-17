import { memo, useState } from 'react'
import { Bot, Check, Pencil, X, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Message, MessageAttachment } from '@/lib/types'
import { getAttachmentPublicUrl } from '@/services/messaging'

function confidenceColor(confidence: number | null): string {
  if (confidence === null) return 'bg-gray-100 text-gray-700 border-gray-300'
  if (confidence >= 0.8) return 'bg-green-100 text-green-800 border-green-300'
  if (confidence >= 0.5) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
  return 'bg-red-100 text-red-800 border-red-300'
}

interface AiDraftCardProps {
  message: Message
  onApprove: (content: string, attachments?: MessageAttachment[]) => void
  onReject: () => void
  isLoading?: boolean
}

export const AiDraftCard = memo(function AiDraftCard({
  message,
  onApprove,
  onReject,
  isLoading,
}: AiDraftCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(message.content)

  return (
    <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-primary">AI Draft</span>
        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', confidenceColor(message.ai_confidence))}>
          {message.ai_confidence !== null ? `${Math.round(message.ai_confidence * 100)}%` : '—'}
        </Badge>
      </div>

      {isEditing ? (
        <Textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          className="min-h-[80px] text-sm"
          autoFocus
        />
      ) : (
        <>
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.attachments.map((att) => (
                <img
                  key={att.file_url}
                  src={getAttachmentPublicUrl(att.file_url)}
                  alt={att.filename}
                  className="h-20 w-20 rounded object-cover border"
                />
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <Button
              size="xs"
              onClick={() => { onApprove(editedContent, message.attachments); setIsEditing(false) }}
              disabled={isLoading || !editedContent.trim()}
            >
              <Send className="h-3 w-3" />
              Send
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => { setIsEditing(false); setEditedContent(message.content) }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="xs" onClick={() => onApprove(message.content, message.attachments)} disabled={isLoading}>
              <Check className="h-3 w-3" />
              Send
            </Button>
            <Button size="xs" variant="outline" onClick={() => setIsEditing(true)} disabled={isLoading}>
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
            <Button size="xs" variant="outline" onClick={onReject} disabled={isLoading}>
              <X className="h-3 w-3" />
              Reject
            </Button>
          </>
        )}
      </div>
    </div>
  )
})
