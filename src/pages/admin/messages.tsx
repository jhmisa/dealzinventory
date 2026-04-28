import { useState, useCallback, useEffect, useMemo } from 'react'
import { Loader2, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useStaffProfiles } from '@/hooks/use-staff-profiles'
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
  useUnlinkCustomer,
  useUpdateConversation,
  useMessagingRealtime,
  useMarkConversationRead,
} from '@/hooks/use-messaging'
import {
  useMessageFolders,
  useAwaitingReplyCounts,
  useMoveConversationToFolder,
  useArchiveConversation,
  useUnarchiveConversation,
} from '@/hooks/use-message-folders'

export default function MessagesPage() {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [isArchiveView, setIsArchiveView] = useState(false)
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
  const archiveConversation = useArchiveConversation()
  const unarchiveConversation = useUnarchiveConversation()

  // Auto-select Inbox on first load
  useEffect(() => {
    if (!selectedFolderId && folders.length > 0) {
      const inbox = folders.find((f) => f.is_system && f.name === 'Inbox')
      setSelectedFolderId(inbox?.id ?? folders[0].id)
    }
  }, [folders, selectedFolderId])

  const filters = useMemo(() => ({
    ...(isArchiveView
      ? { is_archived: true as const }
      : { is_archived: false as const, folder_id: selectedFolderId ?? undefined }),
    search: search || undefined,
    assigned_staff_id: mineOnly ? user?.id : undefined,
  }), [selectedFolderId, isArchiveView, search, mineOnly, user])

  const { data: conversations = [] } = useConversations(filters)
  const { data: selectedConversation } = useConversation(selectedConvId ?? '')
  const { data: messages = [] } = useMessages(selectedConvId ?? '')

  const sendMessage = useSendMessage()
  const rejectDraft = useRejectDraft()
  const retryMessage = useRetryMessage()
  const linkCustomer = useLinkCustomer()
  const unlinkCustomer = useUnlinkCustomer()
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

  const handleUnlinkCustomer = useCallback(
    () => {
      if (!selectedConvId) return
      unlinkCustomer.mutate(selectedConvId, {
        onSuccess: () => toast.success('Customer unlinked'),
        onError: (err) => toast.error(`Failed to unlink: ${err.message}`),
      })
    },
    [selectedConvId, unlinkCustomer],
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
      <div className="relative flex flex-1 min-h-0 rounded-lg border bg-card overflow-hidden">
        {/* Blocking overlay while moving */}
        {moveToFolder.isPending && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Moving conversation...</p>
            </div>
          </div>
        )}

        {/* Pane 1 — Folder sidebar */}
        <FolderSidebar
          folders={folders}
          selectedFolderId={isArchiveView ? null : selectedFolderId}
          onSelectFolder={(id) => { setIsArchiveView(false); setSelectedFolderId(id) }}
          awaitingCounts={awaitingCounts}
          onSelectArchive={() => { setIsArchiveView(true); setSelectedFolderId(null); setSelectedConvId(null) }}
          isArchiveSelected={isArchiveView}
        />

        {/* Pane 2 — Conversation list */}
        <div className="w-[300px] shrink-0 flex flex-col min-h-0 border-r overflow-hidden">
          <ConversationList
            conversations={conversations}
            selectedId={selectedConvId}
            onSelect={setSelectedConvId}
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
            onArchive={(conversationId) =>
              archiveConversation.mutate(conversationId, {
                onSuccess: () => {
                  toast.success('Conversation archived')
                  if (selectedConvId === conversationId) setSelectedConvId(null)
                },
              })
            }
          />
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
              isArchived={selectedConversation.is_archived}
              onArchive={() => {
                if (selectedConversation.is_archived) {
                  unarchiveConversation.mutate(selectedConvId!, {
                    onSuccess: () => toast.success('Conversation unarchived'),
                  })
                } else {
                  archiveConversation.mutate(selectedConvId!, {
                    onSuccess: () => {
                      toast.success('Conversation archived')
                      setSelectedConvId(null)
                    },
                  })
                }
              }}
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
            onUnlinkCustomer={handleUnlinkCustomer}
            collapsed={panelCollapsed}
            onToggleCollapse={handleTogglePanel}
          />
        )}
      </div>
    </div>
  )
}
