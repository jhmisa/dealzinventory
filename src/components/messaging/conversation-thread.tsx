import { memo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { User, AlertCircle, RotateCw, Bot, UserCheck } from 'lucide-react'
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
import type { StaffProfile } from '@/lib/types'
import { AiDraftCard } from './ai-draft-card'
import { MessageStatusBadge } from './message-status-badge'
import { ChannelBadge } from './channel-badge'
import { CustomerLinker } from './customer-linker'
import { MessageComposer } from './message-composer'
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

interface ConversationThreadProps {
  conversation: Conversation & {
    customers: { id: string; customer_code: string; last_name: string; first_name: string | null } | null
  }
  messages: Message[]
  onSend: (content: string) => void
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
      <ScrollArea className="flex-1 px-4">
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
      <MessageComposer onSend={onSend} isLoading={isSending} />
    </div>
  )
})
