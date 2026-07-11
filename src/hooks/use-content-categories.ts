import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as contentCategoryService from '@/services/content-categories'

export function useContentCategories() {
  return useQuery({
    queryKey: queryKeys.contentCategories.list(),
    queryFn: () => contentCategoryService.getContentCategories(),
    staleTime: 5 * 60 * 1000,
  })
}
