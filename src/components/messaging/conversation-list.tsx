import { memo } from 'react'
import { Link2, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChannelBadge } from './channel-badge'
import { CustomerLinker } from './customer-linker'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { SearchBar } from '@/components/shared/search-bar'
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
  return conv.contact_name || 'Unknown'
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
  onLinkCustomer?: (conversationId: string, customerId: string) => void
  mineOnly: boolean
  onToggleMineOnly: (v: boolean) => void
  staffMap?: Record<string, { display_name: string; avatar_url: string | null }>
  currentUserId?: string
  search: string
  onSearchChange: (v: string) => void
  folders?: Array<{ id: string; name: string }>
  onMoveToFolder?: (conversationId: string, folderId: string) => void
}

export const ConversationList = memo(function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onLinkCustomer,
  mineOnly,
  onToggleMineOnly,
  staffMap,
  search,
  onSearchChange,
  folders,
  onMoveToFolder,
}: ConversationListProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 p-2 border-b shrink-0">
        <SearchBar value={search} onChange={onSearchChange} placeholder="Search..." className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={mineOnly ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onToggleMineOnly(!mineOnly)}
            >
              <UserCheck className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {mineOnly ? 'Showing mine only' : 'Show mine only'}
          </TooltipContent>
        </Tooltip>
      </div>
      <ScrollArea className="flex-1 overflow-hidden">
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
              <ContextMenu key={conv.id}>
                <ContextMenuTrigger asChild>
                  <button
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
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTimeAgo(conv.last_message_at ?? conv.updated_at ?? conv.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <ChannelBadge channel={conv.channel} />
                        {conv.customers ? (
                          <span className="text-[10px] text-muted-foreground">{conv.customers.customer_code}</span>
                        ) : conv.unmatched_contact && onLinkCustomer ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span onClick={(e) => e.stopPropagation()}>
                                <CustomerLinker
                                  onLink={(customerId) => onLinkCustomer(conv.id, customerId)}
                                  trigger={
                                    <span
                                      role="button"
                                      className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted-foreground/20 text-muted-foreground hover:text-primary transition-colors"
                                    >
                                      <Link2 className="h-3 w-3" />
                                    </span>
                                  }
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right">Link to customer</TooltipContent>
                          </Tooltip>
                        ) : null}
                        {conv.assigned_staff_id && staffMap?.[conv.assigned_staff_id] && (
                          <span className="text-[10px] text-muted-foreground">
                            {staffMap[conv.assigned_staff_id].display_name.split(' ')[0]}
                          </span>
                        )}
                      </div>
                      {last && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {last.content}
                        </p>
                      )}
                    </div>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  {folders && folders.length > 0 && onMoveToFolder && (
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>Move to...</ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        {folders.map((f) => (
                          <ContextMenuItem
                            key={f.id}
                            onClick={() => onMoveToFolder(conv.id, f.id)}
                          >
                            {f.name}
                          </ContextMenuItem>
                        ))}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
})
