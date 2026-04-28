import { memo } from 'react'
import { UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  // Skip internal notes for the preview — show the last customer-facing message
  const visible = conv.messages.filter((m) => m.role !== 'internal')
  return visible[0] ?? conv.messages[0]
}

function getDisplayName(conv: ConversationWithRelations): string {
  if (conv.customers) {
    const first = conv.customers.first_name ?? ''
    return `${conv.customers.last_name} ${first}`.trim()
  }
  return conv.contact_name || 'Unknown'
}

function getStatusDot(conv: ConversationWithRelations): { color: string; label: string } {
  if (conv.needs_human_review) return { color: 'bg-red-200', label: 'Needs review' }
  const last = getLastMessage(conv)
  if (last?.status === 'DRAFT') return { color: 'bg-amber-300', label: 'AI draft pending' }
  return { color: 'bg-emerald-400', label: 'Resolved' }
}

interface ConversationListProps {
  conversations: ConversationWithRelations[]
  selectedId: string | null
  onSelect: (id: string) => void
  mineOnly: boolean
  onToggleMineOnly: (v: boolean) => void
  staffMap?: Record<string, { display_name: string; avatar_url: string | null }>
  currentUserId?: string
  search: string
  onSearchChange: (v: string) => void
  folders?: Array<{ id: string; name: string }>
  onMoveToFolder?: (conversationId: string, folderId: string) => void
  onArchive?: (conversationId: string) => void
}

export const ConversationList = memo(function ConversationList({
  conversations,
  selectedId,
  onSelect,
  mineOnly,
  onToggleMineOnly,
  staffMap,
  search,
  onSearchChange,
  folders,
  onMoveToFolder,
  onArchive,
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
      <ScrollArea className="flex-1 overflow-hidden [&_[data-slot=scroll-area-viewport]>div]:!block">
        <div className="space-y-0.5 p-2 pr-3">
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
                      'flex w-full items-start gap-2.5 overflow-hidden rounded-lg px-3 py-2 text-left transition-colors',
                      isSelected ? 'bg-accent' : 'hover:bg-muted/50',
                    )}
                    onClick={() => onSelect(conv.id)}
                  >
                    <span
                      className={cn('mt-[7px] h-2 w-2 shrink-0 rounded-full', dot.color)}
                      title={dot.label}
                    />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <span className={cn('block truncate text-[13px] leading-tight', conv.unread_count > 0 ? 'font-semibold text-foreground' : 'font-normal text-foreground/80')}>
                        {name}
                      </span>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[12px] leading-snug text-muted-foreground/60">
                          {last?.content ?? '\u00A0'}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {conv.unread_count > 0 && (
                            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-50 px-1 text-[10px] font-medium text-blue-400">
                              {conv.unread_count}
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap">
                            {formatTimeAgo(conv.last_message_at ?? conv.updated_at ?? conv.created_at)}
                          </span>
                        </div>
                      </div>
                      {(conv.customers || (conv.assigned_staff_id && staffMap?.[conv.assigned_staff_id])) && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {conv.customers && (
                            <span className="text-[10px] text-muted-foreground/50">{conv.customers.customer_code}</span>
                          )}
                          {conv.assigned_staff_id && staffMap?.[conv.assigned_staff_id] && (
                            <span className="text-[10px] text-muted-foreground/50">
                              {staffMap[conv.assigned_staff_id].display_name.split(' ')[0]}
                            </span>
                          )}
                        </div>
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
                            onSelect={() => onMoveToFolder(conv.id, f.id)}
                          >
                            {f.name}
                          </ContextMenuItem>
                        ))}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  )}
                  {onArchive && (
                    <ContextMenuItem onSelect={() => onArchive(conv.id)}>
                      Archive
                    </ContextMenuItem>
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
