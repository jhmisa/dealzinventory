import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as contentItemService from '@/services/content-items'
import type { ContentItemFilters } from '@/services/content-items'
import type { ContentItemInsert, ContentItemUpdate } from '@/lib/types'

export function useContentItems(filters: ContentItemFilters = {}) {
  return useQuery({
    queryKey: queryKeys.contentItems.list(filters as Record<string, unknown>),
    queryFn: () => contentItemService.getContentItems(filters),
  })
}

export function useCreateContentItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ContentItemInsert) => contentItemService.createContentItem(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.contentItems.all }),
  })
}

export function useUpdateContentItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: ContentItemUpdate }) =>
      contentItemService.updateContentItem(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.contentItems.all }),
  })
}

export function useRetireContentItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, retired }: { id: string; retired: boolean }) =>
      retired ? contentItemService.retireContentItem(id) : contentItemService.unretireContentItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.contentItems.all }),
  })
}
