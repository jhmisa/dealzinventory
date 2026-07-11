import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as calendarService from '@/services/content-calendar'
import type { ContentItem } from '@/lib/types'

export function useScheduledPosts(startISO: string, endISO: string) {
  return useQuery({
    queryKey: queryKeys.contentCalendar.range(startISO, endISO),
    queryFn: () => calendarService.getScheduledPosts(startISO, endISO),
  })
}

export function usePinContentToSlot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ item, scheduledAt }: { item: ContentItem; scheduledAt: string }) =>
      calendarService.pinContentToSlot(item, scheduledAt),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.contentCalendar.all }),
  })
}

export function useReschedulePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      calendarService.reschedulePost(id, scheduledAt),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.contentCalendar.all }),
  })
}

export function useUnpinPost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => calendarService.unpinPost(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.contentCalendar.all }),
  })
}
