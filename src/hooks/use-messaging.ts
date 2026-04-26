import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'
import * as messagingService from '@/services/messaging'
import type { ConversationFilters } from '@/services/messaging'
import type {
  MessageAttachment,
  MessagingTemplateInsert,
  AiProviderInsert,
  MessagingPersonaUpdate,
  KnowledgeBaseEntryInsert,
  KnowledgeBaseEntryUpdate,
  TestAIMessage,
} from '@/lib/types'

// ---------- Conversations ----------

export function useConversations(filters: ConversationFilters = {}) {
  return useQuery({
    queryKey: queryKeys.messaging.conversationList(filters),
    queryFn: () => messagingService.getConversations(filters),
  })
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: queryKeys.messaging.conversationDetail(id),
    queryFn: () => messagingService.getConversation(id),
    enabled: !!id,
  })
}

export function useNeedsReviewCount() {
  return useQuery({
    queryKey: queryKeys.messaging.needsReviewCount(),
    queryFn: () => messagingService.getNeedsReviewCount(),
    refetchInterval: 30_000,
  })
}

export function useLinkCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, customerId }: { conversationId: string; customerId: string }) =>
      messagingService.linkCustomerToConversation(conversationId, customerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.all })
    },
  })
}

export function useUnlinkCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) =>
      messagingService.unlinkCustomerFromConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.all })
    },
  })
}

export function useUpdateConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof messagingService.updateConversation>[1] }) =>
      messagingService.updateConversation(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.all })
    },
  })
}

// ---------- Messages ----------

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: queryKeys.messaging.messages(conversationId),
    queryFn: () => messagingService.getMessages(conversationId),
    enabled: !!conversationId,
    refetchInterval: 10_000,
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, content, approveDraftId, attachments }: {
      conversationId: string
      content: string
      approveDraftId?: string
      attachments?: MessageAttachment[]
    }) => messagingService.sendMessage(conversationId, content, approveDraftId, attachments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.all })
    },
  })
}

export function useUploadAttachment() {
  return useMutation({
    mutationFn: ({ file, pathPrefix }: { file: File; pathPrefix: string }) =>
      messagingService.uploadAttachment(file, pathPrefix),
  })
}

export function useRejectDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (messageId: string) => messagingService.rejectDraft(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.all })
    },
  })
}

export function useRetryMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (messageId: string) => messagingService.retryFailedMessage(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.all })
    },
  })
}

// ---------- Templates ----------

export function useTemplates() {
  return useQuery({
    queryKey: queryKeys.messaging.templates(),
    queryFn: () => messagingService.getTemplates(),
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (template: MessagingTemplateInsert) =>
      messagingService.createTemplate(template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.templates() })
    },
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<MessagingTemplateInsert> }) =>
      messagingService.updateTemplate(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.templates() })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.templates() })
    },
  })
}

// ---------- AI Providers ----------

export function useAiProviders() {
  return useQuery({
    queryKey: queryKeys.messaging.aiProviders(),
    queryFn: () => messagingService.getAiProviders(),
  })
}

export function useCreateAiProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (provider: AiProviderInsert) =>
      messagingService.createAiProvider(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.aiProviders() })
    },
  })
}

export function useUpdateAiProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<AiProviderInsert> }) =>
      messagingService.updateAiProvider(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.aiProviders() })
    },
  })
}

export function useSetActiveAiProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, purpose }: { id: string; purpose?: string }) =>
      messagingService.setActiveAiProvider(id, purpose),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.aiProviders() })
    },
  })
}

export function useDeleteAiProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.deleteAiProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.aiProviders() })
    },
  })
}

// ---------- Persona ----------

export function useActivePersona() {
  return useQuery({
    queryKey: queryKeys.messaging.persona(),
    queryFn: () => messagingService.getActivePersona(),
  })
}

export function useUpdatePersona() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: MessagingPersonaUpdate }) =>
      messagingService.updatePersona(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.persona() })
    },
  })
}

// ---------- System Alerts ----------

export function useActiveAlerts() {
  return useQuery({
    queryKey: queryKeys.messaging.alerts(),
    queryFn: () => messagingService.getActiveAlerts(),
    refetchInterval: 60_000,
  })
}

export function useResolveAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.resolveAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.alerts() })
    },
  })
}

// ---------- Sync Health ----------

export function useSyncHealth() {
  return useQuery({
    queryKey: [...queryKeys.messaging.all, 'sync-health'],
    queryFn: () => messagingService.getMessageSyncHealth(),
    refetchInterval: 60_000,
  })
}

// ---------- Knowledge Base ----------

export function useKnowledgeBase() {
  return useQuery({
    queryKey: queryKeys.messaging.knowledgeBase(),
    queryFn: () => messagingService.getKnowledgeBaseEntries(),
  })
}

export function useCreateKnowledgeBaseEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entry: KnowledgeBaseEntryInsert) =>
      messagingService.createKnowledgeBaseEntry(entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.knowledgeBase() })
    },
  })
}

export function useUpdateKnowledgeBaseEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: KnowledgeBaseEntryUpdate }) =>
      messagingService.updateKnowledgeBaseEntry(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.knowledgeBase() })
    },
  })
}

export function useDeleteKnowledgeBaseEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.deleteKnowledgeBaseEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.knowledgeBase() })
    },
  })
}

// ---------- Test AI ----------

export function useTestAIReply() {
  return useMutation({
    mutationFn: ({ messages, customerId }: { messages: TestAIMessage[]; customerId?: string }) =>
      messagingService.testAIReply(messages, customerId),
  })
}

// ---------- System Settings ----------

export function useSystemSetting(key: string) {
  return useQuery({
    queryKey: queryKeys.messaging.systemSetting(key),
    queryFn: () => messagingService.getSystemSetting(key),
  })
}

export function useUpdateSystemSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      messagingService.updateSystemSetting(key, value),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.systemSetting(variables.key) })
    },
  })
}

// ---------- Analytics ----------

export function useMessagingStats() {
  return useQuery({
    queryKey: [...queryKeys.messaging.all, 'stats'] as const,
    queryFn: () => messagingService.getMessagingStats(),
    refetchInterval: 60_000,
  })
}

// ---------- Realtime ----------

export function useMessagingRealtime(activeConversationId?: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('messaging-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          // Refresh the specific conversation's messages
          const convId = (payload.new as { conversation_id?: string })?.conversation_id
          if (convId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.messaging.messages(convId) })
          }
          // Refresh conversation list (last_message, unread, etc.)
          queryClient.invalidateQueries({ queryKey: queryKeys.messaging.conversations() })
          queryClient.invalidateQueries({ queryKey: queryKeys.messaging.needsReviewCount() })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.messaging.conversations() })
          queryClient.invalidateQueries({ queryKey: queryKeys.messaging.needsReviewCount() })
          if (activeConversationId) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.messaging.conversationDetail(activeConversationId),
            })
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, activeConversationId])
}

// ---------- Mark Read ----------

export function useMarkConversationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) =>
      messagingService.updateConversation(conversationId, { unread_count: 0 } as Parameters<typeof messagingService.updateConversation>[1]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.conversations() })
    },
  })
}

// ---------- Message Sync ----------

export interface MessageSyncStatus {
  status: 'ok' | 'recovered' | 'error'
  checked_at: string
  since: string
  conversations_scanned: number
  conversations_remaining?: number
  inserted_count: number
  error_count: number
  inserted_preview?: Array<{ conversation_id: string; preview: string; created_at: string }>
  errors_preview?: Array<{ conversation_id: string; error: string }>
}

export function useMessageSyncStatus() {
  const { data: raw, ...rest } = useSystemSetting('messaging_last_sync')
  let parsed: MessageSyncStatus | null = null
  if (raw) {
    try {
      parsed = JSON.parse(raw) as MessageSyncStatus
    } catch {
      // ignore
    }
  }
  return { data: parsed, ...rest }
}

export interface MessageSyncResult {
  ok: boolean
  inserted_count: number
  skipped_count: number
  error_count: number
  conversations_scanned: number
  conversations_remaining: number
  inserted: Array<{ conversation_id: string; preview: string; created_at: string; attachments: number }>
  errors: Array<{ conversation_id: string; error: string }>
}

export interface MessageSyncProgress {
  scanned: number
  total: number
  recovered: number
  errors: number
}

const SYNC_BATCH_SIZE = 5
const SYNC_MAX_ITERATIONS = 200

export function useRunMessageSync() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      since,
      onProgress,
    }: {
      since: string
      onProgress?: (progress: MessageSyncProgress) => void
    }): Promise<MessageSyncResult> => {
      let offset = 0
      let totalInserted = 0
      let totalSkipped = 0
      let totalErrors = 0
      let totalScanned = 0
      const allInserted: MessageSyncResult['inserted'] = []
      const allErrors: MessageSyncResult['errors'] = []

      for (let iteration = 0; iteration < SYNC_MAX_ITERATIONS; iteration++) {
        let batch: MessageSyncResult
        try {
          const { data, error } = await supabase.functions.invoke('backfill-missive-inbound', {
            body: {
              since,
              batch_size: SYNC_BATCH_SIZE,
              batch_offset: offset,
              // Only write status on the last batch
              write_status: false,
            },
          })
          if (error) throw error
          batch = data as MessageSyncResult
        } catch (err) {
          // Log batch error and try next batch instead of aborting entirely
          console.error(`Sync batch at offset ${offset} failed:`, err)
          totalErrors++
          allErrors.push({
            conversation_id: `batch_offset_${offset}`,
            error: err instanceof Error ? err.message : String(err),
          })
          offset += SYNC_BATCH_SIZE
          continue
        }

        totalInserted += batch.inserted_count
        totalSkipped += batch.skipped_count
        totalErrors += batch.error_count
        totalScanned += batch.conversations_scanned
        allInserted.push(...batch.inserted)
        allErrors.push(...batch.errors)

        const total = offset + batch.conversations_scanned + batch.conversations_remaining
        onProgress?.({
          scanned: offset + batch.conversations_scanned,
          total,
          recovered: totalInserted,
          errors: totalErrors,
        })

        if (batch.conversations_remaining === 0) break
        offset += batch.conversations_scanned
      }

      // Write aggregated sync status to system_settings
      const status = totalInserted > 0
        ? 'recovered'
        : totalErrors > 0
          ? 'error'
          : 'ok'
      await supabase.from('system_settings').upsert(
        {
          key: 'messaging_last_sync',
          value: JSON.stringify({
            status,
            checked_at: new Date().toISOString(),
            since,
            conversations_scanned: totalScanned,
            conversations_remaining: 0,
            inserted_count: totalInserted,
            error_count: totalErrors,
            inserted_preview: allInserted.slice(0, 5),
            errors_preview: allErrors.slice(0, 3),
          }),
        },
        { onConflict: 'key' },
      )

      return {
        ok: true,
        inserted_count: totalInserted,
        skipped_count: totalSkipped,
        error_count: totalErrors,
        conversations_scanned: totalScanned,
        conversations_remaining: 0,
        inserted: allInserted,
        errors: allErrors,
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messaging.systemSetting('messaging_last_sync'),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.conversations() })
    },
  })
}
