import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as settingsService from '@/services/settings'

export function useSystemSetting(key: string) {
  return useQuery({
    queryKey: queryKeys.settings.system(key),
    queryFn: () => settingsService.getSystemSetting(key),
  })
}

export function useUpdateSystemSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      settingsService.updateSystemSetting(key, value),
    onSuccess: (_data, { key }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.system(key) })
    },
  })
}

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
