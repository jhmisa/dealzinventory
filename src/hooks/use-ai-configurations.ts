import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as aiConfigService from '@/services/ai-configurations'
import type { AiConfigurationInsert, AiConfigurationUpdate } from '@/lib/types'

export function useAiConfigurations() {
  return useQuery({
    queryKey: queryKeys.aiConfigurations.list(),
    queryFn: () => aiConfigService.getAiConfigurations(),
  })
}

export function useActiveAiConfiguration(purpose?: string) {
  return useQuery({
    queryKey: [...queryKeys.aiConfigurations.active(), purpose],
    queryFn: () => aiConfigService.getActiveAiConfiguration(purpose),
  })
}

export function useCreateAiConfiguration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: AiConfigurationInsert) =>
      aiConfigService.createAiConfiguration(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiConfigurations.all })
    },
  })
}

export function useUpdateAiConfiguration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: AiConfigurationUpdate }) =>
      aiConfigService.updateAiConfiguration(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiConfigurations.all })
    },
  })
}

export function useDeleteAiConfiguration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => aiConfigService.deleteAiConfiguration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiConfigurations.all })
    },
  })
}

export function useSetActiveAiConfiguration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => aiConfigService.setActiveAiConfiguration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiConfigurations.all })
    },
  })
}

export function useTestAiConfiguration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ configId, fileUrl, fileType }: { configId: string; fileUrl: string; fileType: string }) =>
      aiConfigService.testAiConfiguration(configId, fileUrl, fileType),
    onSuccess: (_data, variables) => {
      aiConfigService.updateTestTimestamp(variables.configId)
      queryClient.invalidateQueries({ queryKey: queryKeys.aiConfigurations.all })
    },
  })
}
