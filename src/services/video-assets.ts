import { supabase } from '@/lib/supabase'

export type VideoAssetKind = 'intro' | 'outro' | 'music'

// Branded intro/outro clips (and background-music tracks) the team uploads once and stitches onto /
// mixes into exported marketing videos.
export interface VideoAsset {
  id: string
  name: string
  kind: VideoAssetKind
  file_url: string
  created_by: string | null
  created_at: string
}

export async function getVideoAssets(): Promise<VideoAsset[]> {
  const { data, error } = await supabase
    .from('video_assets')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as VideoAsset[]
}

export async function createVideoAsset(input: {
  name: string
  kind: VideoAssetKind
  file: File
}): Promise<VideoAsset> {
  const { data: { user } } = await supabase.auth.getUser()
  const isMusic = input.kind === 'music'
  const ext = input.file.name.split('.').pop()?.toLowerCase() || (isMusic ? 'mp3' : 'mp4')
  const path = `${input.kind}/${crypto.randomUUID()}.${ext}`

  const up = await supabase.storage
    .from('video-assets')
    .upload(path, input.file, { contentType: input.file.type || (isMusic ? 'audio/mpeg' : 'video/mp4'), upsert: false })
  if (up.error) throw up.error

  const { data: pub } = supabase.storage.from('video-assets').getPublicUrl(path)
  const { data, error } = await supabase
    .from('video_assets')
    .insert({ name: input.name, kind: input.kind, file_url: pub.publicUrl, created_by: user?.id ?? null })
    .select()
    .single()
  if (error) throw error
  return data as VideoAsset
}

export async function deleteVideoAsset(id: string, fileUrl: string): Promise<void> {
  const marker = '/video-assets/'
  const i = fileUrl.indexOf(marker)
  if (i >= 0) {
    const path = decodeURIComponent(fileUrl.slice(i + marker.length))
    await supabase.storage.from('video-assets').remove([path])
  }
  const { error } = await supabase.from('video_assets').delete().eq('id', id)
  if (error) throw error
}

/** Fetch an asset's file as a Blob so the exporter can decode + stitch it. */
export async function fetchAssetBlob(fileUrl: string): Promise<Blob> {
  const res = await fetch(fileUrl)
  if (!res.ok) throw new Error(`Could not load clip (${res.status})`)
  return res.blob()
}
