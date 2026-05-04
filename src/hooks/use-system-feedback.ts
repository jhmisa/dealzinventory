import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as systemFeedbackService from '@/services/system-feedback'
import type { SystemFeedbackStatus, SystemFeedbackType } from '@/services/system-feedback'

export function useSystemFeedback(filters: systemFeedbackService.SystemFeedbackFilters = {}) {
  return useQuery({
    queryKey: queryKeys.systemFeedback.list(filters),
    queryFn: () => systemFeedbackService.getSystemFeedback(filters),
  })
}

export function useSystemFeedbackById(id: string) {
  return useQuery({
    queryKey: queryKeys.systemFeedback.detail(id),
    queryFn: () => systemFeedbackService.getSystemFeedbackById(id),
    enabled: !!id,
  })
}

export function useCreateSystemFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: systemFeedbackService.createSystemFeedback,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemFeedback.all })
    },
  })
}

export function useUpdateSystemFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...updates }: { id: string; title?: string; description?: string; status?: SystemFeedbackStatus; type?: SystemFeedbackType }) =>
      systemFeedbackService.updateSystemFeedback(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemFeedback.all })
    },
  })
}

export function useDeleteSystemFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: systemFeedbackService.deleteSystemFeedback,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemFeedback.all })
    },
  })
}

export function useUploadFeedbackMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ feedbackId, file }: { feedbackId: string; file: File }) =>
      systemFeedbackService.uploadFeedbackMedia(feedbackId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemFeedback.all })
    },
  })
}
