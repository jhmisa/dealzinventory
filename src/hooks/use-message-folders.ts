import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as folderService from '@/services/message-folders'

export function useMessageFolders() {
  return useQuery({
    queryKey: ['message-folders'],
    queryFn: folderService.getMessageFolders,
  })
}

export function useAwaitingReplyCounts() {
  return useQuery({
    queryKey: ['message-folders', 'awaiting-reply-counts'],
    queryFn: folderService.getAwaitingReplyCounts,
    refetchInterval: 30_000,
  })
}

export function useMoveConversationToFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, folderId }: { conversationId: string; folderId: string }) =>
      folderService.moveConversationToFolder(conversationId, folderId),
    onMutate: async ({ conversationId, folderId }) => {
      await qc.cancelQueries({ queryKey: queryKeys.messaging.conversations() })
      const previousQueries = qc.getQueriesData({ queryKey: queryKeys.messaging.conversations() })
      qc.setQueriesData({ queryKey: queryKeys.messaging.conversations() }, (old: unknown) => {
        if (!Array.isArray(old)) return old
        return old.map((conv: Record<string, unknown>) =>
          conv.id === conversationId
            ? { ...conv, folder_id: folderId, is_archived: false }
            : conv
        )
      })
      return { previousQueries }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousQueries) {
        for (const [key, data] of context.previousQueries) {
          qc.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.messaging.conversations() })
      qc.invalidateQueries({ queryKey: ['message-folders'] })
    },
  })
}

export function useCreateMessageFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: folderService.createMessageFolder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['message-folders'] })
    },
  })
}

export function useDeleteMessageFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: folderService.deleteMessageFolder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['message-folders'] })
    },
  })
}

export function useArchiveConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: folderService.archiveConversation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.messaging.conversations() })
      qc.invalidateQueries({ queryKey: ['message-folders'] })
    },
  })
}

export function useUnarchiveConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: folderService.unarchiveConversation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.messaging.conversations() })
      qc.invalidateQueries({ queryKey: ['message-folders'] })
    },
  })
}
