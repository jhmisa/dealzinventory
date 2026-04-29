import { memo, useState, useCallback, useRef, useMemo } from 'react'
import { Send, Paperclip, MessageSquareText, Package, Ticket, X, FileIcon, Loader2, Archive, ArchiveRestore } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn, convertEmoticonsToEmoji } from '@/lib/utils'
import type { MessageAttachment } from '@/lib/types'
import { useUploadAttachment } from '@/hooks/use-messaging'
import { useClipboardPaste } from '@/hooks/use-clipboard-paste'
import { getAttachmentSignedUrl } from '@/services/messaging'
import {
  compressImageForMessaging,
  IMAGE_MAX_INPUT_SIZE_MB,
} from '@/lib/image-compression'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTicketTypes } from '@/hooks/use-tickets'

const MAX_ATTACHMENTS = 5
// Non-image files (PDFs, docs, etc.) are uploaded as-is.
const MAX_NON_IMAGE_FILE_SIZE = 10 * 1024 * 1024 // 10MB
// Images are compressed client-side before upload — larger inputs are fine,
// the compression step handles it.
const MAX_IMAGE_INPUT_SIZE = IMAGE_MAX_INPUT_SIZE_MB * 1024 * 1024

interface MessageComposerProps {
  onSend: (content: string, attachments?: MessageAttachment[]) => void
  isLoading?: boolean
  placeholder?: string
  conversationId?: string
  onOpenResponses?: () => void
  onOpenInventory?: () => void
  onCreateTicket?: (typeSlug: string) => void
  folders?: Array<{ id: string; name: string }>
  onMoveToFolder?: (folderId: string) => void
  onArchive?: () => void
  isArchived?: boolean
}

export const MessageComposer = memo(function MessageComposer({
  onSend,
  isLoading,
  placeholder = 'Type a reply...',
  conversationId,
  onOpenResponses,
  onOpenInventory,
  onCreateTicket,
  folders,
  onMoveToFolder,
  onArchive,
  isArchived,
}: MessageComposerProps) {
  const [content, setContent] = useState('')
  const [attachments, setAttachments] = useState<MessageAttachment[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [isCompressing, setIsCompressing] = useState(false)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadAttachment = useUploadAttachment()
  const { data: ticketTypes = [] } = useTicketTypes()

  const ARCHIVE_ITEM = { id: '__archive__', name: 'Archive' } as const

  const slashItems = useMemo(() => {
    const items = folders ? [...folders] : []
    if (onArchive) items.push(ARCHIVE_ITEM)
    if (!slashFilter) return items
    return items.filter((f) => f.name.toLowerCase().startsWith(slashFilter))
  }, [folders, slashFilter, onArchive])

  const handleSend = useCallback(() => {
    const trimmed = content.trim()
    if (!trimmed && attachments.length === 0) return
    const text = convertEmoticonsToEmoji(trimmed)
    onSend(text, attachments.length > 0 ? attachments : undefined)
    setContent('')
    setAttachments([])
    setThumbnails({})
    setShowSlashMenu(false)
    setSlashFilter('')
  }, [content, attachments, onSend])

  const handleChange = useCallback((value: string) => {
    setContent(value)
    if (value.startsWith('/')) {
      const query = value.slice(1).toLowerCase()
      setSlashFilter(query)
      setShowSlashMenu(true)
      setHighlightedIndex(0)
    } else {
      setShowSlashMenu(false)
      setSlashFilter('')
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showSlashMenu) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setHighlightedIndex((prev) => Math.min(prev + 1, slashItems.length - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setHighlightedIndex((prev) => Math.max(prev - 1, 0))
          return
        }
        if (e.key === 'Enter' && slashItems.length > 0) {
          e.preventDefault()
          const item = slashItems[highlightedIndex]
          if (item) {
            if (item.id === '__archive__') {
              onArchive?.()
              toast.success('Archived')
            } else {
              onMoveToFolder?.(item.id)
              toast.success(`Moved to ${item.name}`)
            }
            setContent('')
            setShowSlashMenu(false)
            setSlashFilter('')
          }
          return
        }
        if (e.key === 'Escape') {
          setShowSlashMenu(false)
          return
        }
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSend()
      }
    },
    [showSlashMenu, slashItems, highlightedIndex, onMoveToFolder, onArchive, handleSend],
  )

  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return

      const remaining = MAX_ATTACHMENTS - attachments.length
      if (files.length > remaining) {
        toast.error(`Max ${MAX_ATTACHMENTS} attachments per message. You can add ${remaining} more.`)
        return
      }

      for (const file of files) {
        const isImage = file.type.startsWith('image/')
        const inputLimit = isImage ? MAX_IMAGE_INPUT_SIZE : MAX_NON_IMAGE_FILE_SIZE

        if (file.size > inputLimit) {
          toast.error(
            `"${file.name}" exceeds the ${inputLimit / 1024 / 1024}MB limit`,
          )
          continue
        }

        try {
          let fileToUpload = file
          if (isImage) {
            setIsCompressing(true)
            try {
              fileToUpload = await compressImageForMessaging(file)
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : `Failed to compress ${file.name}`,
              )
              continue
            } finally {
              setIsCompressing(false)
            }
          }

          const pathPrefix = conversationId ?? 'draft'
          const attachment = await uploadAttachment.mutateAsync({
            file: fileToUpload,
            pathPrefix,
          })
          setAttachments((prev) => [...prev, attachment])

          // Generate thumbnail for images
          if (isImage) {
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

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      // Reset file input so the same file can be selected again
      e.target.value = ''
      await processFiles(files)
    },
    [processFiles],
  )

  const handlePastedFiles = useCallback(
    (files: File[]) => {
      void processFiles(files)
    },
    [processFiles],
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
  const isBusy = isUploading || isCompressing
  const canSend = (content.trim() || attachments.length > 0) && !isLoading && !isBusy

  useClipboardPaste({
    onPaste: handlePastedFiles,
    enabled: !isBusy && attachments.length < MAX_ATTACHMENTS,
    accept: 'image',
  })

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
      <div className="relative flex items-end gap-2 p-3">
        {showSlashMenu && slashItems.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 rounded-md border bg-popover p-1 shadow-md">
            <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground">Move to...</p>
            {slashItems.map((item, idx) => (
              <button
                key={item.id}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors',
                  idx === highlightedIndex ? 'bg-accent' : 'hover:bg-muted',
                )}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (item.id === '__archive__') {
                    onArchive?.()
                    toast.success('Archived')
                  } else {
                    onMoveToFolder?.(item.id)
                    toast.success(`Moved to ${item.name}`)
                  }
                  setContent('')
                  setShowSlashMenu(false)
                  setSlashFilter('')
                }}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
        <Textarea
          value={content}
          onChange={(e) => handleChange(e.target.value)}
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
          {isBusy ? (
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
              disabled={isBusy || attachments.length >= MAX_ATTACHMENTS}
            >
              {isCompressing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Paperclip className="h-3.5 w-3.5" />
              )}
              {isCompressing ? 'Compressing...' : 'Attach'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Images are auto-compressed. Max 5 attachments.</TooltipContent>
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

        {onCreateTicket && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  >
                    <Ticket className="h-3.5 w-3.5" />
                    Ticket
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Create a ticket</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start">
              {ticketTypes
                .filter((t) => t.name !== 'RETURN')
                .map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => onCreateTicket(t.slug)}>
                    {t.label}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {onArchive && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={onArchive}
              >
                {isArchived ? (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isArchived ? 'Unarchive' : 'Archive'}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
})
