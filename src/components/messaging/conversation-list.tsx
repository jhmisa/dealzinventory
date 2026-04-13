import { memo } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ChannelBadge } from './channel-badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ConversationWithRelations } from '@/lib/types'

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

function getLastMessage(conv: ConversationWithRelations) {
  if (!conv.messages || conv.messages.length === 0) return null
  return conv.messages[0]
}

function getDisplayName(conv: ConversationWithRelations): string {
  if (conv.customers) {
    const first = conv.customers.first_name ?? ''
    return `${conv.customers.last_name} ${first}`.trim()
  }
  return 'Unknown'
}

function getStatusDot(conv: ConversationWithRelations): { color: string; label: string } {
  if (conv.needs_human_review) return { color: 'bg-red-500', label: 'Needs review' }
  const last = getLastMessage(conv)
  if (last?.status === 'DRAFT') return { color: 'bg-yellow-500', label: 'AI draft pending' }
  return { color: 'bg-green-500', label: 'Resolved' }
}

interface ConversationListProps {
  conversations: ConversationWithRelations[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export const ConversationList = memo(function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-0.5 p-2">
        {conversations.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No conversations</p>
        )}
        {conversations.map((conv) => {
          const last = getLastMessage(conv)
          const dot = getStatusDot(conv)
          const name = getDisplayName(conv)
          const isSelected = conv.id === selectedId

          return (
            <button
              key={conv.id}
              className={cn(
                'flex w-full items-start gap-3 rounded-md p-2.5 text-left transition-colors',
                isSelected ? 'bg-accent' : 'hover:bg-muted/50',
              )}
              onClick={() => onSelect(conv.id)}
            >
              <span
                className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', dot.color)}
                title={dot.label}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('truncate text-sm', conv.unread_count > 0 ? 'font-bold' : 'font-medium')}>
                    {name}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {conv.unread_count > 0 && (
                      <Badge variant="default" className="h-4 min-w-4 px-1 text-[10px]">
                        {conv.unread_count}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {formatTimeAgo(conv.last_message_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <ChannelBadge channel={conv.channel} />
                  {conv.customers && (
                    <span className="text-[10px] text-muted-foreground">{conv.customers.customer_code}</span>
                  )}
                </div>
                {last && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {last.content}
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
})
