import { useState, useCallback, useEffect, useMemo } from 'react'
import { MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useStaffProfiles } from '@/hooks/use-staff-profiles'
import { PageHeader } from '@/components/shared/page-header'
import { ConversationList, ConversationThread, CustomerPanel, FolderSidebar } from '@/components/messaging'
import type { MessageAttachment } from '@/lib/types'
import {
  useConversations,
  useConversation,
  useMessages,
  useSendMessage,
  useRejectDraft,
  useRetryMessage,
  useLinkCustomer,
  useUpdateConversation,
  useMessagingRealtime,
  useMarkConversationRead,
} from '@/hooks/use-messaging'
import {
  useMessageFolders,
  useAwaitingReplyCounts,
  useMoveConversationToFolder,
} from '@/hooks/use-message-folders'

export default function MessagesPage() {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [mineOnly, setMineOnly] = useState(false)
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
  const { data: folders = [] } = useMessageFolders()
  const { data: awaitingCounts = {} } = useAwaitingReplyCounts()
  const moveToFolder = useMoveConversationToFolder()

  // Auto-select Inbox on first load
  useEffect(() => {
    if (!selectedFolderId && folders.length > 0) {
      const inbox = folders.find((f) => f.is_system && f.name === 'Inbox')
      setSelectedFolderId(inbox?.id ?? folders[0].id)
    }
  }, [folders, selectedFolderId])

  const filters = useMemo(() => ({
    folder_id: selectedFolderId ?? undefined,
    search: search || undefined,
    assigned_staff_id: mineOnly ? user?.id : undefined,
  }), [selectedFolderId, search, mineOnly, user])

  const { data: conversations = [], isLoading: loadingConversations } = useConversations(filters)
  const { data: selectedConversation } = useConversation(selectedConvId ?? '')
  const { data: messages = [] } = useMessages(selectedConvId ?? '')

  const sendMessage = useSendMessage()
  const rejectDraft = useRejectDraft()
  const retryMessage = useRetryMessage()
  const linkCustomer = useLinkCustomer()
  const updateConversation = useUpdateConversation()
  const markRead = useMarkConversationRead()

  // Build staffMap for avatars
  const staffMap = useMemo(() => {
    const map: Record<string, { display_name: string; avatar_url: string | null }> = {}
    for (const s of staffProfiles) {
      map[s.id] = { display_name: s.display_name, avatar_url: s.avatar_url ?? null }
    }
    return map
  }, [staffProfiles])

  // Realtime subscriptions — replaces polling
  useMessagingRealtime(selectedConvId)

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
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      <PageHeader
        title="Messages"
        description="Customer conversations via Missive"
      />

      <div className="flex flex-1 min-h-0 mt-4 rounded-lg border bg-card overflow-hidden">
        {/* Pane 1 — Folder sidebar */}
        <FolderSidebar
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          awaitingCounts={awaitingCounts}
        />

        {/* Pane 2 — Conversation list */}
        <div className="flex w-[300px] shrink-0 flex-col border-r min-h-0">
          <div className="flex-1 min-h-0">
            {loadingConversations ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            ) : (
              <ConversationList
                conversations={conversations}
                selectedId={selectedConvId}
                onSelect={setSelectedConvId}
                onLinkCustomer={handleLinkCustomerFromList}
                mineOnly={mineOnly}
                onToggleMineOnly={setMineOnly}
                staffMap={staffMap}
                currentUserId={user?.id}
                search={search}
                onSearchChange={setSearch}
                folders={folders.map(f => ({ id: f.id, name: f.name }))}
                onMoveToFolder={(conversationId, folderId) =>
                  moveToFolder.mutate(
                    { conversationId, folderId },
                    { onSuccess: () => toast.success('Moved to folder') }
                  )
                }
              />
            )}
          </div>
        </div>

        {/* Pane 3 — Conversation thread */}
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
              staffMap={staffMap}
              folders={folders}
              onMoveToFolder={(folderId) =>
                moveToFolder.mutate(
                  { conversationId: selectedConvId!, folderId },
                  { onSuccess: () => toast.success('Moved to folder') }
                )
              }
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/30" />
                <p className="mt-2 text-sm text-muted-foreground">Select a conversation to view messages</p>
              </div>
            </div>
          )}
        </div>

        {/* Pane 4 — Customer info panel */}
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
