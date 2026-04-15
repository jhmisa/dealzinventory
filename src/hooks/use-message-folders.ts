import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
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
