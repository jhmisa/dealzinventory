import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as aiPromptService from '@/services/ai-prompts'
import type { AiPromptInsert, AiPromptUpdate } from '@/services/ai-prompts'

export function useAiPrompts(mediaType?: string) {
  return useQuery({
    queryKey: queryKeys.aiPrompts.list({ mediaType }),
    queryFn: () => aiPromptService.getAiPrompts(mediaType),
  })
}

export function useActiveAiPrompts(mediaType?: string) {
  return useQuery({
    queryKey: queryKeys.aiPrompts.active(mediaType),
    queryFn: () => aiPromptService.getActiveAiPrompts(mediaType),
  })
}

export function useCreateAiPrompt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (prompt: AiPromptInsert) =>
      aiPromptService.createAiPrompt(prompt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiPrompts.all })
    },
  })
}

export function useUpdateAiPrompt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: AiPromptUpdate }) =>
      aiPromptService.updateAiPrompt(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiPrompts.all })
    },
  })
}

export function useDeleteAiPrompt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => aiPromptService.deleteAiPrompt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiPrompts.all })
    },
  })
}
