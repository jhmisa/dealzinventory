import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as socialMediaPostService from '@/services/social-media-posts'
import type { SocialMediaPostInsert, SocialMediaPostUpdate } from '@/lib/types'

export function useSocialMediaPosts() {
  return useQuery({
    queryKey: queryKeys.socialMediaPosts.lists(),
    queryFn: () => socialMediaPostService.getSocialMediaPosts(),
  })
}

export function useSocialMediaPost(id: string) {
  return useQuery({
    queryKey: queryKeys.socialMediaPosts.detail(id),
    queryFn: () => socialMediaPostService.getSocialMediaPost(id),
    enabled: !!id,
  })
}

export function useCreateSocialMediaPost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (post: SocialMediaPostInsert) =>
      socialMediaPostService.createSocialMediaPost(post),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.socialMediaPosts.all })
    },
  })
}

export function useUpdateSocialMediaPost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: SocialMediaPostUpdate }) =>
      socialMediaPostService.updateSocialMediaPost(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.socialMediaPosts.all })
    },
  })
}

export function useDeleteSocialMediaPost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => socialMediaPostService.deleteSocialMediaPost(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.socialMediaPosts.all })
    },
  })
}

export function useSourceMedia(
  sourceType: socialMediaPostService.MediaSourceType | undefined,
  sourceId: string | undefined,
  productId?: string | null,
  accessoryId?: string | null,
) {
  return useQuery({
    queryKey: queryKeys.socialMediaPosts.itemMedia(sourceId ?? '', productId ?? undefined),
    queryFn: () => socialMediaPostService.getMediaForSource(sourceType!, sourceId!, productId, accessoryId),
    enabled: !!sourceType && !!sourceId,
  })
}
