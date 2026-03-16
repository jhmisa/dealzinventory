import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { getItemAuditLogs } from '@/services/item-audit-logs'

export function useItemAuditLogs(itemId: string) {
  return useQuery({
    queryKey: queryKeys.items.auditLogs(itemId),
    queryFn: () => getItemAuditLogs(itemId),
    enabled: !!itemId,
  })
}
