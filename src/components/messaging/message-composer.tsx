import { memo, useState, useCallback, useRef } from 'react'
import { Send, Paperclip, MessageSquareText, Package, X, FileIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { MessageAttachment } from '@/lib/types'
import { useUploadAttachment } from '@/hooks/use-messaging'
import { getAttachmentSignedUrl } from '@/services/messaging'

const MAX_ATTACHMENTS = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

interface MessageComposerProps {
  onSend: (content: string, attachments?: MessageAttachment[]) => void
  isLoading?: boolean
  placeholder?: string
  conversationId?: string
  onOpenResponses?: () => void
  onOpenInventory?: () => void
}

export const MessageComposer = memo(function MessageComposer({
  onSend,
  isLoading,
  placeholder = 'Type a reply...',
  conversationId,
  onOpenResponses,
  onOpenInventory,
}: MessageComposerProps) {
  const [content, setContent] = useState('')
  const [attachments, setAttachments] = useState<MessageAttachment[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadAttachment = useUploadAttachment()

  const handleSend = useCallback(() => {
    const trimmed = content.trim()
    if (!trimmed && attachments.length === 0) return
    onSend(trimmed, attachments.length > 0 ? attachments : undefined)
    setContent('')
    setAttachments([])
    setThumbnails({})
  }, [content, attachments, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      if (files.length === 0) return

      // Reset file input so the same file can be selected again
      e.target.value = ''

      const remaining = MAX_ATTACHMENTS - attachments.length
      if (files.length > remaining) {
        toast.error(`Max ${MAX_ATTACHMENTS} attachments per message. You can add ${remaining} more.`)
        return
      }

      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`"${file.name}" exceeds the 10MB limit`)
          continue
        }

        try {
          const pathPrefix = conversationId ?? 'draft'
          const attachment = await uploadAttachment.mutateAsync({ file, pathPrefix })
          setAttachments((prev) => [...prev, attachment])

          // Generate thumbnail for images
          if (file.type.startsWith('image/')) {
            try {
              const signedUrl = await getAttachmentSignedUrl(attachment.file_url)
              setThumbnails((prev) => ({ ...prev, [attachment.file_url]: signedUrl }))
            } catch {
              // Thumbnail generation failed — not critical
            }
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `Failed to upload ${file.name}`)
        }
      }
    },
    [attachments.length, conversationId, uploadAttachment],
  )

  const removeAttachment = useCallback((fileUrl: string) => {
    setAttachments((prev) => prev.filter((a) => a.file_url !== fileUrl))
    setThumbnails((prev) => {
      const next = { ...prev }
      delete next[fileUrl]
      return next
    })
  }, [])

  // Public methods for external components to add content/attachments
  const appendContent = useCallback((text: string) => {
    setContent((prev) => (prev ? `${prev}\n${text}` : text))
  }, [])

  const addAttachments = useCallback((newAttachments: MessageAttachment[], newThumbnails?: Record<string, string>) => {
    setAttachments((prev) => {
      const remaining = MAX_ATTACHMENTS - prev.length
      return [...prev, ...newAttachments.slice(0, remaining)]
    })
    if (newThumbnails) {
      setThumbnails((prev) => ({ ...prev, ...newThumbnails }))
    }
  }, [])

  // Expose append methods via the component instance (used by parent via ref-like pattern)
  // We store them on a stable ref that parent can access
  const composerApi = useRef({ appendContent, addAttachments })
  composerApi.current = { appendContent, addAttachments }

  // Also expose via data attribute on the DOM for parent access
  const composerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        ;(node as HTMLDivElement & { composerApi: typeof composerApi.current }).composerApi = composerApi.current
      }
    },
    [],
  )

  const isUploading = uploadAttachment.isPending
  const canSend = (content.trim() || attachments.length > 0) && !isLoading && !isUploading

  return (
    <div ref={composerRef} className="border-t" data-composer>
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((att) => {
            const isImage = att.mime_type.startsWith('image/')
            const thumb = thumbnails[att.file_url]
            return (
              <div
                key={att.file_url}
                className="group relative flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1.5 text-xs"
              >
                {isImage && thumb ? (
                  <img
                    src={thumb}
                    alt={att.filename}
                    className="h-8 w-8 rounded object-cover"
                  />
                ) : (
                  <FileIcon className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="max-w-[120px] truncate">{att.filename}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.file_url)}
                  className="ml-1 rounded-full p-0.5 hover:bg-destructive/10"
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Textarea + send */}
      <div className="flex items-end gap-2 p-3">
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
          disabled={!canSend}
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 border-t px-3 py-1.5">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          onChange={handleFileSelect}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || attachments.length >= MAX_ATTACHMENTS}
            >
              <Paperclip className="h-3.5 w-3.5" />
              Attach
            </Button>
          </TooltipTrigger>
          <TooltipContent>Attach file (max 10MB, up to 5)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={onOpenResponses}
            >
              <MessageSquareText className="h-3.5 w-3.5" />
              Responses
            </Button>
          </TooltipTrigger>
          <TooltipContent>Canned responses</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={onOpenInventory}
            >
              <Package className="h-3.5 w-3.5" />
              Inventory
            </Button>
          </TooltipTrigger>
          <TooltipContent>Search inventory to insert</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
})
