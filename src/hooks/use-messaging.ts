import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'
import * as messagingService from '@/services/messaging'
import type { ConversationFilters } from '@/services/messaging'
import type {
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
    mutationFn: ({ conversationId, content, approveDraftId }: {
      conversationId: string
      content: string
      approveDraftId?: string
    }) => messagingService.sendMessage(conversationId, content, approveDraftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.all })
    },
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
