import { useState, useCallback, useEffect, useMemo } from 'react'
import { MessageSquare, Bot, Send, AlertTriangle, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useStaffProfiles } from '@/hooks/use-staff-profiles'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SearchBar } from '@/components/shared/search-bar'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { ConversationList } from '@/components/messaging/conversation-list'
import { ConversationThread } from '@/components/messaging/conversation-thread'
import { CustomerPanel } from '@/components/messaging/customer-panel'
import type { MessageAttachment } from '@/lib/types'
import {
  useConversations,
  useConversation,
  useMessages,
  useNeedsReviewCount,
  useSendMessage,
  useRejectDraft,
  useRetryMessage,
  useLinkCustomer,
  useUpdateConversation,
  useMessagingRealtime,
  useMarkConversationRead,
  useMessagingStats,
} from '@/hooks/use-messaging'

type FilterTab = 'needs_review' | 'all' | 'mine'

export default function MessagesPage() {
  const [tab, setTab] = useState<FilterTab>('needs_review')
  const [search, setSearch] = useState('')
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [panelCollapsed, setPanelCollapsed] = useState(
    () => localStorage.getItem('messaging-panel-collapsed') === 'true'
  )

  const handleTogglePanel = useCallback(() => {
    setPanelCollapsed((prev: boolean) => {
      const next = !prev
      localStorage.setItem('messaging-panel-collapsed', String(next))
      return next
    })
  }, [])

  const { user } = useAuth()
  const { data: staffProfiles = [] } = useStaffProfiles()
  const { data: needsReviewCount } = useNeedsReviewCount()

  const filters = useMemo(() => ({
    ...(tab === 'needs_review' ? { needs_review: true } : {}),
    ...(tab === 'mine' && user ? { assigned_staff_id: user.id } : {}),
    ...(search ? { search } : {}),
  }), [tab, search, user])

  const { data: conversations = [], isLoading: loadingConversations } = useConversations(filters)
  const { data: selectedConversation } = useConversation(selectedConvId ?? '')
  const { data: messages = [] } = useMessages(selectedConvId ?? '')

  const sendMessage = useSendMessage()
  const rejectDraft = useRejectDraft()
  const retryMessage = useRetryMessage()
  const linkCustomer = useLinkCustomer()
  const updateConversation = useUpdateConversation()
  const markRead = useMarkConversationRead()
  const { data: stats } = useMessagingStats()

  // Realtime subscriptions — replaces polling
  useMessagingRealtime(selectedConvId)

  // Auto-switch to "All" tab if selected conversation leaves current filtered list
  useEffect(() => {
    if (
      selectedConvId &&
      !loadingConversations &&
      conversations.length > 0 &&
      !conversations.find((c) => c.id === selectedConvId)
    ) {
      setTab('all')
    }
  }, [conversations, selectedConvId, loadingConversations])

  // Mark conversation as read when selected
  useEffect(() => {
    if (selectedConvId && selectedConversation && selectedConversation.unread_count > 0) {
      markRead.mutate(selectedConvId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConvId])

  const handleSend = useCallback(
    (content: string, attachments?: MessageAttachment[]) => {
      if (!selectedConvId) return
      sendMessage.mutate(
        { conversationId: selectedConvId, content, attachments },
        {
          onError: (err) => toast.error(`Failed to send: ${err.message}`),
        },
      )
    },
    [selectedConvId, sendMessage],
  )

  const handleApproveDraft = useCallback(
    (messageId: string, content: string) => {
      if (!selectedConvId) return
      sendMessage.mutate(
        { conversationId: selectedConvId, content, approveDraftId: messageId },
        {
          onError: (err) => toast.error(`Failed to send: ${err.message}`),
        },
      )
    },
    [selectedConvId, sendMessage],
  )

  const handleRejectDraft = useCallback(
    (messageId: string) => {
      rejectDraft.mutate(messageId, {
        onError: (err) => toast.error(`Failed to reject: ${err.message}`),
      })
    },
    [rejectDraft],
  )

  const handleRetryMessage = useCallback(
    (messageId: string) => {
      retryMessage.mutate(messageId, {
        onError: (err) => toast.error(`Failed to retry: ${err.message}`),
      })
    },
    [retryMessage],
  )

  const handleLinkCustomer = useCallback(
    (customerId: string) => {
      if (!selectedConvId) return
      linkCustomer.mutate(
        { conversationId: selectedConvId, customerId },
        {
          onSuccess: () => toast.success('Customer linked'),
          onError: (err) => toast.error(`Failed to link: ${err.message}`),
        },
      )
    },
    [selectedConvId, linkCustomer],
  )

  const handleLinkCustomerFromList = useCallback(
    (conversationId: string, customerId: string) => {
      linkCustomer.mutate(
        { conversationId, customerId },
        {
          onSuccess: () => toast.success('Customer linked'),
          onError: (err) => toast.error(`Failed to link: ${err.message}`),
        },
      )
    },
    [linkCustomer],
  )

  const handleAssignStaff = useCallback(
    (staffId: string | null) => {
      if (!selectedConvId) return
      updateConversation.mutate(
        { id: selectedConvId, updates: { assigned_staff_id: staffId } },
        {
          onSuccess: () => toast.success(staffId ? 'Staff assigned' : 'Staff unassigned'),
          onError: (err) => toast.error(`Failed: ${err.message}`),
        },
      )
    },
    [selectedConvId, updateConversation],
  )

  const handleToggleAi = useCallback(
    (enabled: boolean) => {
      if (!selectedConvId) return
      updateConversation.mutate(
        { id: selectedConvId, updates: { ai_enabled: enabled } },
        {
          onSuccess: () => toast.success(`AI ${enabled ? 'enabled' : 'disabled'} for this conversation`),
          onError: (err) => toast.error(`Failed: ${err.message}`),
        },
      )
    },
    [selectedConvId, updateConversation],
  )

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-5rem)]">
      <PageHeader
        title="Messages"
        description="Customer conversations via Missive"
        actions={
          needsReviewCount ? (
            <Badge variant="destructive">{needsReviewCount} need review</Badge>
          ) : undefined
        }
      />

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <Bot className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-lg font-semibold leading-none">{stats.aiDraftsToday}</p>
              <p className="text-xs text-muted-foreground">AI drafts today</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <Send className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="text-lg font-semibold leading-none">{stats.sentToday}</p>
              <p className="text-xs text-muted-foreground">Sent today</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <TrendingUp className="h-5 w-5 text-blue-600 shrink-0" />
            <div>
              <p className="text-lg font-semibold leading-none">
                {stats.avgConfidence !== null ? `${Math.round(stats.avgConfidence * 100)}%` : '—'}
              </p>
              <p className="text-xs text-muted-foreground">Avg confidence</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
            <div>
              <p className="text-lg font-semibold leading-none">
                {stats.escalationRate !== null ? `${Math.round(stats.escalationRate * 100)}%` : '—'}
              </p>
              <p className="text-xs text-muted-foreground">Escalation rate</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 rounded-lg border bg-card overflow-hidden">
        {/* Left panel — Conversation list */}
        <div className="flex w-80 shrink-0 flex-col border-r">
          <div className="space-y-2 p-3 border-b">
            <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
              <TabsList className="w-full">
                <TabsTrigger value="needs_review" className="flex-1 gap-1.5">
                  Needs Review
                  {(needsReviewCount ?? 0) > 0 && (
                    <Badge variant="destructive" className="h-5 min-w-5 px-1 text-[10px]">
                      {needsReviewCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="mine" className="flex-1">Mine</TabsTrigger>
                <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <SearchBar value={search} onChange={setSearch} placeholder="Search customers..." />
          </div>
          {loadingConversations ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              selectedId={selectedConvId}
              onSelect={setSelectedConvId}
              onLinkCustomer={handleLinkCustomerFromList}
            />
          )}
        </div>

        {/* Right panel — Conversation thread */}
        <div className="flex-1 flex flex-col min-h-0">
          {selectedConversation ? (
            <ConversationThread
              conversation={selectedConversation}
              messages={messages}
              onSend={handleSend}
              onApproveDraft={handleApproveDraft}
              onRejectDraft={handleRejectDraft}
              onRetryMessage={handleRetryMessage}
              onLinkCustomer={handleLinkCustomer}
              onToggleAi={handleToggleAi}
              onAssignStaff={handleAssignStaff}
              staffMembers={staffProfiles}
              currentUserId={user?.id}
              isSending={sendMessage.isPending}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <div className="text-center space-y-2">
                <MessageSquare className="h-10 w-10 mx-auto opacity-50" />
                <p className="text-sm">Select a conversation to view messages</p>
              </div>
            </div>
          )}
        </div>

        {/* Right panel — Customer info */}
        {selectedConversation && (
          <CustomerPanel
            conversation={selectedConversation}
            onLinkCustomer={handleLinkCustomer}
            collapsed={panelCollapsed}
            onToggleCollapse={handleTogglePanel}
          />
        )}
      </div>
    </div>
  )
}
