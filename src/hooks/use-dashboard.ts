import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as dashboardService from '@/services/dashboard'

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats(),
    queryFn: () => dashboardService.getDashboardStats(),
  })
}

export function useStaleMissingItems() {
  return useQuery({
    queryKey: [...queryKeys.dashboard.all, 'stale-missing'] as const,
    queryFn: () => dashboardService.getStaleMissingItems(),
  })
}
