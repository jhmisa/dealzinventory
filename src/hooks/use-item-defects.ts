import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as itemDefectsService from '@/services/item-defects'

const defectKeys = {
  all: ['item-defects'] as const,
  byItem: (itemId: string) => ['item-defects', itemId] as const,
}

export function useItemDefects(itemId: string) {
  return useQuery({
    queryKey: defectKeys.byItem(itemId),
    queryFn: () => itemDefectsService.getItemDefects(itemId),
    enabled: !!itemId,
  })
}

export function useAddItemDefect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: itemDefectsService.addItemDefect,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: defectKeys.byItem(vars.itemId) })
    },
  })
}

export function useDeleteItemDefect(itemId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: itemDefectsService.deleteItemDefect,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: defectKeys.byItem(itemId) })
    },
  })
}
