import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as settingsService from '@/services/settings'

export function useItemListColumnSettings() {
  return useQuery({
    queryKey: queryKeys.settings.itemListColumns(),
    queryFn: () => settingsService.getItemListColumnSettings(),
  })
}

export function useUpdateItemListColumnSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ statusTab, visibleColumns }: { statusTab: string; visibleColumns: string[] }) =>
      settingsService.updateItemListColumnSettings(statusTab, visibleColumns),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all })
    },
  })
}
