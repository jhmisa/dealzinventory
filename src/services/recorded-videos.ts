import { supabase } from '@/lib/supabase'
import type { SocialPostStatus } from '@/lib/types'

// A recorded/shot marketing video = a social_media_posts row of post_type 'video'.
// The library groups these by who shot them (created_by → staff_profiles.display_name).
export interface RecordedVideo {
  id: string
  url: string
  caption: string | null
  status: SocialPostStatus
  scheduled_at: string | null
  published_at: string | null
  created_at: string
  item_code: string | null
  shooter_id: string | null
  shooter_name: string | null
}

export async function getRecordedVideos(): Promise<RecordedVideo[]> {
  const { data, error } = await supabase
    .from('social_media_posts')
    .select('id, media_urls, caption, status, scheduled_at, published_at, created_at, item_code, created_by')
    .eq('post_type', 'video')
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows = (data ?? []) as Array<{
    id: string
    media_urls: string[] | null
    caption: string | null
    status: SocialPostStatus
    scheduled_at: string | null
    published_at: string | null
    created_at: string
    item_code: string | null
    created_by: string | null
  }>

  // created_by references auth.users; staff_profiles.id shares that id. There's no
  // direct FK for PostgREST to embed, so resolve display names in a second query.
  const shooterIds = [...new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v))]
  const nameById = new Map<string, string>()
  if (shooterIds.length) {
    const { data: staff } = await supabase
      .from('staff_profiles')
      .select('id, display_name')
      .in('id', shooterIds)
    for (const s of staff ?? []) nameById.set(s.id, s.display_name)
  }

  return rows.map((r) => ({
    id: r.id,
    url: r.media_urls?.[0] ?? '',
    caption: r.caption,
    status: r.status,
    scheduled_at: r.scheduled_at,
    published_at: r.published_at,
    created_at: r.created_at,
    item_code: r.item_code,
    shooter_id: r.created_by,
    shooter_name: r.created_by ? nameById.get(r.created_by) ?? 'Unknown' : null,
  }))
}

// Re-add a recorded video to the posting queue. Publishing still happens behind the
// human "Process Queue" button on the Social Media page (Blotato). Clears any prior error.
export async function requeueRecordedVideo(id: string): Promise<void> {
  const { error } = await supabase
    .from('social_media_posts')
    .update({ status: 'queued', error_message: null })
    .eq('id', id)
  if (error) throw error
}

// Delete a recorded video: remove the storage object (best-effort) then the post row.
export async function deleteRecordedVideo(id: string, url: string): Promise<void> {
  const marker = '/social-media/'
  const i = url.indexOf(marker)
  if (i >= 0) {
    const path = decodeURIComponent(url.slice(i + marker.length))
    await supabase.storage.from('social-media').remove([path])
  }
  const { error } = await supabase.from('social_media_posts').delete().eq('id', id)
  if (error) throw error
}
