import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as svc from '@/services/video-assets'

const QK = ['video-assets']

export function useVideoAssets() {
  return useQuery({ queryKey: QK, queryFn: svc.getVideoAssets })
}

export function useCreateVideoAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; kind: 'intro' | 'outro'; file: File }) => svc.createVideoAsset(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}

export function useDeleteVideoAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { id: string; file_url: string }) => svc.deleteVideoAsset(a.id, a.file_url),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  })
}
