import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as mineService from '@/services/mine'

export function useClaimableByCode(code: string) {
  return useQuery({
    queryKey: ['mine', 'claimable', code],
    queryFn: () => mineService.getClaimableByCode(code),
    enabled: code.length === 7,
  })
}

export function useClaimMine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: mineService.claimMine,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}
