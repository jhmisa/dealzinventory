import { supabase } from '@/lib/supabase'
import { getClaimableByCode } from '@/services/mine'
import { processSocialQueue } from '@/services/social-media-posts'
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
  // Enriched from the tagged product (item_code → getClaimableByCode), so the card shows the
  // same spec-rich line + price as the recorder overlay / showcase. Null when the code can't
  // be resolved. See feedback_consistent_descriptions.
  product_title: string | null
  product_description: string | null
  product_price: number | null
  product_grade: string | null
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

  // Enrich each video with its tagged product's title/spec-line/price (deduped by code so a code
  // shared across videos resolves once). Reuses getClaimableByCode — the same source the recorder
  // overlay uses — for a consistent description. Resolution failures degrade gracefully to nulls.
  const codes = [...new Set(rows.map((r) => r.item_code).filter((v): v is string => !!v))]
  const productByCode = new Map<string, { title: string; subtitle: string; price: number; grade: string | null }>()
  await Promise.all(
    codes.map(async (code) => {
      try {
        const p = await getClaimableByCode(code)
        if (p) productByCode.set(code, { title: p.title, subtitle: p.subtitle, price: p.price, grade: p.grade })
      } catch {
        // leave unresolved → nulls on the card
      }
    }),
  )

  return rows.map((r) => {
    const product = r.item_code ? productByCode.get(r.item_code) ?? null : null
    return {
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
      product_title: product?.title ?? null,
      product_description: product?.subtitle ?? null,
      product_price: product?.price ?? null,
      product_grade: product?.grade ?? null,
    }
  })
}

// Stage a recorded video for posting (set schedule fields + status='queued', clear any prior error),
// then push THIS post to Blotato via the single-post processor. Shared by all three card actions.
async function stageAndPush(
  id: string,
  fields: { schedule_type: 'now' | 'next_slot' | 'scheduled'; scheduled_at?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('social_media_posts')
    .update({
      status: 'queued',
      error_message: null,
      schedule_type: fields.schedule_type,
      scheduled_at: fields.scheduled_at ?? null,
    })
    .eq('id', id)
  if (error) throw error
  await processSocialQueue(id)
}

// Queue for posting at Blotato's next free slot (auto-spaced). Pushes immediately — no Process Queue.
export async function queueRecordedVideo(id: string): Promise<void> {
  await stageAndPush(id, { schedule_type: 'next_slot' })
}

// Schedule for an exact time (ISO 8601). Pushes to Blotato immediately with that scheduledTime.
export async function scheduleRecordedVideo(id: string, whenISO: string): Promise<void> {
  await stageAndPush(id, { schedule_type: 'scheduled', scheduled_at: whenISO })
}

// Publish right now via Blotato.
export async function postRecordedVideoNow(id: string): Promise<void> {
  await stageAndPush(id, { schedule_type: 'now' })
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
