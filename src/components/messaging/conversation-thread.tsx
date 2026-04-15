import { memo, useRef, useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { User, AlertCircle, RotateCw, Bot, UserCheck, FileIcon, ExternalLink, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { StaffProfile, MessageAttachment } from '@/lib/types'
import { getAttachmentSignedUrl } from '@/services/messaging'
import { AiDraftCard } from './ai-draft-card'
import { MessageStatusBadge } from './message-status-badge'
import { ChannelBadge } from './channel-badge'
import { CustomerLinker } from './customer-linker'
import { MessageComposer } from './message-composer'
import { CannedResponsesPanel } from './canned-responses-panel'
import { InventorySearchModal } from './inventory-search-modal'
import type { Conversation, Message } from '@/lib/types'

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// Lightbox for viewing images/videos in a popup
function MediaLightbox({
  url,
  type,
  onClose,
}: {
  url: string
  type: 'image' | 'video'
  onClose: () => void
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
      >
        <X className="h-5 w-5" />
      </button>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] max-w-[90vw]">
        {type === 'image' ? (
          <img src={url} alt="Attachment" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" />
        ) : (
          <video src={url} controls autoPlay className="max-h-[90vh] max-w-[90vw] rounded-lg" />
        )}
      </div>
    </div>
  )
}

// Attachment thumbnail component with signed URL loading
const AttachmentThumbnail = memo(function AttachmentThumbnail({
  attachment,
  isOutbound,
}: {
  attachment: MessageAttachment
  isOutbound: boolean
}) {
  const isExternal = attachment.file_url.startsWith('http://') || attachment.file_url.startsWith('https://')
  const [url, setUrl] = useState<string | null>(isExternal ? attachment.file_url : null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const isImage = attachment.mime_type.startsWith('image/')
  const isVideo = attachment.mime_type.startsWith('video/')

  useEffect(() => {
    if (isExternal) return
    let cancelled = false
    getAttachmentSignedUrl(attachment.file_url).then((signedUrl) => {
      if (!cancelled) setUrl(signedUrl)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [attachment.file_url, isExternal])

  if (!url) return null

  if (isImage) {
    return (
      <>
        <button onClick={() => setLightboxOpen(true)} className="block cursor-pointer">
          <img
            src={url}
            alt={attachment.filename}
            className="mt-1.5 max-w-[200px] rounded-md hover:opacity-90 transition-opacity"
          />
        </button>
        {lightboxOpen && (
          <MediaLightbox url={url} type="image" onClose={() => setLightboxOpen(false)} />
        )}
      </>
    )
  }

  if (isVideo) {
    return (
      <>
        <button
          onClick={() => setLightboxOpen(true)}
          className="mt-1.5 block cursor-pointer relative"
        >
          <video
            src={url}
            className="max-w-[200px] rounded-md hover:opacity-90 transition-opacity"
            muted
            preload="metadata"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-black/50 p-2">
              <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </button>
        {lightboxOpen && (
          <MediaLightbox url={url} type="video" onClose={() => setLightboxOpen(false)} />
        )}
      </>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'mt-1.5 flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-accent/10',
        isOutbound ? 'border-primary-foreground/20' : 'border-border',
      )}
    >
      <FileIcon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate max-w-[140px]">{attachment.filename}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
    </a>
  )
})

interface ConversationThreadProps {
  conversation: Conversation & {
    customers: { id: string; customer_code: string; last_name: string; first_name: string | null } | null
  }
  messages: Message[]
  onSend: (content: string, attachments?: MessageAttachment[]) => void
  onApproveDraft: (messageId: string, content: string) => void
  onRejectDraft: (messageId: string) => void
  onRetryMessage: (messageId: string) => void
  onLinkCustomer: (customerId: string) => void
  onToggleAi: (enabled: boolean) => void
  onAssignStaff: (staffId: string | null) => void
  staffMembers?: StaffProfile[]
  currentUserId?: string
  isSending?: boolean
}

export const ConversationThread = memo(function ConversationThread({
  conversation,
  messages,
  onSend,
  onApproveDraft,
  onRejectDraft,
  onRetryMessage,
  onLinkCustomer,
  onToggleAi,
  onAssignStaff,
  staffMembers = [],
  currentUserId,
  isSending,
}: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const [showResponses, setShowResponses] = useState(false)
  const [showInventory, setShowInventory] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Group messages by date
  const groups: { date: string; messages: Message[] }[] = []
  for (const msg of messages) {
    const date = formatDate(msg.created_at)
    const last = groups[groups.length - 1]
    if (last?.date === date) {
      last.messages.push(msg)
    } else {
      groups.push({ date, messages: [msg] })
    }
  }

  const customerName = conversation.customers
    ? `${conversation.customers.last_name} ${conversation.customers.first_name ?? ''}`.trim()
    : conversation.contact_name || 'Unknown Contact'

  // Get composer API for inserting content from panels
  const getComposerApi = useCallback(() => {
    const composerEl = composerRef.current?.querySelector('[data-composer]') as
      | (HTMLDivElement & { composerApi?: { appendContent: (text: string) => void; addAttachments: (attachments: MessageAttachment[], thumbnails?: Record<string, string>) => void } })
      | null
    return composerEl?.composerApi
  }, [])

  const handleInsertResponse = useCallback(
    (content: string, attachments?: MessageAttachment[]) => {
      const api = getComposerApi()
      if (api) {
        api.appendContent(content)
        if (attachments && attachments.length > 0) {
          api.addAttachments(attachments)
        }
      }
      setShowResponses(false)
    },
    [getComposerApi],
  )

  const handleSendNowResponse = useCallback(
    (content: string, attachments?: MessageAttachment[]) => {
      onSend(content, attachments)
      setShowResponses(false)
    },
    [onSend],
  )

  const handleInsertInventoryItem = useCallback(
    (text: string, attachment?: MessageAttachment, thumbnailUrl?: string) => {
      const api = getComposerApi()
      if (api) {
        api.appendContent(text)
        if (attachment) {
          const thumbs = thumbnailUrl ? { [attachment.file_url]: thumbnailUrl } : undefined
          api.addAttachments([attachment], thumbs)
        }
      }
    },
    [getComposerApi],
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate">{customerName}</span>
              {conversation.customers && (
                <Link
                  to={`/admin/customers/${conversation.customers.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  {conversation.customers.customer_code}
                </Link>
              )}
              <ChannelBadge channel={conversation.channel} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conversation.unmatched_contact && (
            <CustomerLinker onLink={onLinkCustomer} />
          )}
          <Select
            value={conversation.assigned_staff_id ?? 'unassigned'}
            onValueChange={(v) => onAssignStaff(v === 'unassigned' ? null : v)}
          >
            <SelectTrigger className="h-7 w-[140px] text-xs">
              <UserCheck className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Assign..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {currentUserId && (
                <SelectItem value={currentUserId}>Me</SelectItem>
              )}
              {staffMembers
                .filter((s) => s.id !== currentUserId && s.is_active)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.display_name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                <Bot className={cn('h-4 w-4', conversation.ai_enabled ? 'text-primary' : 'text-muted-foreground')} />
                <Switch
                  checked={conversation.ai_enabled}
                  onCheckedChange={onToggleAi}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {conversation.ai_enabled ? 'AI auto-reply enabled' : 'AI auto-reply disabled'}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0 px-4">
        <div className="space-y-4 py-4">
          {groups.map((group) => (
            <div key={group.date}>
              <div className="flex items-center gap-2 py-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-medium text-muted-foreground">{group.date}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-3">
                {group.messages.map((msg) => {
                  const isCustomer = msg.role === 'customer'
                  const isDraft = msg.status === 'DRAFT' && msg.role === 'assistant'
                  const isFailed = msg.status === 'FAILED'
                  const msgAttachments = msg.attachments ?? []

                  if (isDraft) {
                    return (
                      <div key={msg.id} className="flex justify-end">
                        <div className="max-w-[80%]">
                          <AiDraftCard
                            message={msg}
                            onApprove={(content) => onApproveDraft(msg.id, content)}
                            onReject={() => onRejectDraft(msg.id)}
                            isLoading={isSending}
                          />
                        </div>
                      </div>
                    )
                  }

                  if (msg.status === 'REJECTED') return null

                  return (
                    <div
                      key={msg.id}
                      className={cn('flex', isCustomer ? 'justify-start' : 'justify-end')}
                    >
                      <div
                        className={cn(
                          'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                          isCustomer
                            ? 'bg-muted'
                            : 'bg-primary text-primary-foreground',
                        )}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        {/* Attachments */}
                        {msgAttachments.length > 0 && (
                          <div className="space-y-1">
                            {msgAttachments.map((att, idx) => (
                              <AttachmentThumbnail
                                key={`${att.file_url}-${idx}`}
                                attachment={att}
                                isOutbound={!isCustomer}
                              />
                            ))}
                          </div>
                        )}
                        <div className={cn(
                          'mt-1 flex items-center gap-1',
                          isCustomer ? 'justify-start' : 'justify-end',
                        )}>
                          <span className={cn(
                            'text-[10px]',
                            isCustomer ? 'text-muted-foreground' : 'text-primary-foreground/70',
                          )}>
                            {formatTime(msg.created_at)}
                          </span>
                          {!isCustomer && <MessageStatusBadge status={msg.status} className={isFailed ? '' : 'text-primary-foreground/70'} />}
                        </div>
                        {isFailed && (
                          <div className="mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 text-destructive" />
                            <span className="text-[10px] text-destructive">Failed to send</span>
                            <Button
                              size="xs"
                              variant="ghost"
                              className="h-5 px-1 text-[10px]"
                              onClick={() => onRetryMessage(msg.id)}
                            >
                              <RotateCw className="h-3 w-3" />
                              Retry
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Composer */}
      <div ref={composerRef}>
        <MessageComposer
          onSend={onSend}
          isLoading={isSending}
          conversationId={conversation.id}
          onOpenResponses={() => setShowResponses(true)}
          onOpenInventory={() => setShowInventory(true)}
        />
      </div>

      {/* Canned Responses Panel */}
      <CannedResponsesPanel
        open={showResponses}
        onClose={() => setShowResponses(false)}
        onInsert={handleInsertResponse}
        onSendNow={handleSendNowResponse}
        conversation={conversation}
      />

      {/* Inventory Search Modal */}
      <InventorySearchModal
        open={showInventory}
        onClose={() => setShowInventory(false)}
        onInsertItem={handleInsertInventoryItem}
      />
    </div>
  )
})
