import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as snapshotService from '@/services/inventory-snapshots'

export function useSnapshots() {
  return useQuery({
    queryKey: queryKeys.inventorySnapshots.lists(),
    queryFn: () => snapshotService.getSnapshots(),
  })
}

export function useSnapshot(id: string) {
  return useQuery({
    queryKey: queryKeys.inventorySnapshots.detail(id),
    queryFn: () => snapshotService.getSnapshot(id),
    enabled: !!id,
  })
}

export function useSnapshotItems(snapshotId: string) {
  return useQuery({
    queryKey: queryKeys.inventorySnapshots.items(snapshotId),
    queryFn: () => snapshotService.getSnapshotItems(snapshotId),
    enabled: !!snapshotId,
  })
}

export function useGenerateSnapshot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => snapshotService.generateSnapshot(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventorySnapshots.all })
    },
  })
}
