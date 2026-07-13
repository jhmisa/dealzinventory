import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as aiOpsService from '@/services/ai-ops'
import type { AiOpsProposalStatus, AiOpsAutonomy } from '@/lib/types'

export function useAiOpsProposals(status?: AiOpsProposalStatus) {
  return useQuery({
    queryKey: queryKeys.aiOps.proposals(status),
    queryFn: () => aiOpsService.getAiOpsProposals(status),
    refetchInterval: 10_000,
  })
}

export function useAiOpsActivity() {
  return useQuery({
    queryKey: queryKeys.aiOps.activity(),
    queryFn: () => aiOpsService.getAiOpsActivity(),
    refetchInterval: 15_000,
  })
}

export function useAiOpsSettings() {
  return useQuery({
    queryKey: queryKeys.aiOps.settings(),
    queryFn: () => aiOpsService.getAiOpsSettings(),
  })
}

export function useApproveAiOpsProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content?: string }) =>
      aiOpsService.approveAiOpsProposal(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiOps.all })
    },
  })
}

export function useRejectAiOpsProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      aiOpsService.rejectAiOpsProposal(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiOps.all })
    },
  })
}

export function useAcknowledgeAiOpsProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => aiOpsService.acknowledgeAiOpsProposal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiOps.all })
    },
  })
}

export function useSetAiOpsEnabled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => aiOpsService.setAiOpsEnabled(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiOps.settings() })
    },
  })
}

export function useSetAiOpsReplyAutonomy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (level: AiOpsAutonomy) => aiOpsService.setAiOpsReplyAutonomy(level),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiOps.settings() })
    },
  })
}
