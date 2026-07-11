import { supabase } from '@/lib/supabase'
import type { ContentItem, SocialMediaPost, SocialMediaPostInsert } from '@/lib/types'

/** A scheduled post joined with its category (colour) for calendar rendering. */
export type CalendarPost = SocialMediaPost & {
  category: { id: string; name: string; color: string } | null
}

/** All scheduled posts whose scheduled_at falls in [startISO, endISO]. */
export async function getScheduledPosts(startISO: string, endISO: string): Promise<CalendarPost[]> {
  const { data, error } = await supabase
    .from('social_media_posts')
    .select('*, category:content_categories(id, name, color)')
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', startISO)
    .lte('scheduled_at', endISO)
    .order('scheduled_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as CalendarPost[]
}

/**
 * Pin a library item onto a calendar slot: creates a manual scheduled post that
 * references the content_item. The caption is seeded from the item title and is
 * (re)generated properly at publish time.
 */
export async function pinContentToSlot(item: ContentItem, scheduledAtISO: string): Promise<SocialMediaPost> {
  const insert: SocialMediaPostInsert = {
    content_item_id: item.id,
    origin: 'manual',
    status: 'scheduled',
    schedule_type: 'scheduled',
    scheduled_at: scheduledAtISO,
    media_urls: item.media_urls,
    item_codes: item.item_codes,
    category_id: item.category_id,
    post_type: item.kind === 'video' ? 'video' : 'product',
    caption: item.title,
  }
  const { data, error } = await supabase.from('social_media_posts').insert(insert).select().single()
  if (error) throw error
  return data as SocialMediaPost
}

/** Move a scheduled post to a new time (drag-to-reschedule). */
export async function reschedulePost(id: string, scheduledAtISO: string): Promise<void> {
  const { error } = await supabase
    .from('social_media_posts')
    .update({ scheduled_at: scheduledAtISO })
    .eq('id', id)
  if (error) throw error
}

/** Remove a pinned manual post from the calendar. */
export async function unpinPost(id: string): Promise<void> {
  const { error } = await supabase.from('social_media_posts').delete().eq('id', id)
  if (error) throw error
}

/**
 * Map each content_item to the earliest upcoming rule-materialised post date (ISO).
 * An item appearing here is "in rotation" — drives the Library rotation-status chip.
 */
export async function getUpcomingRulePostsByItem(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('social_media_posts')
    .select('content_item_id, scheduled_at')
    .eq('origin', 'rule')
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
  if (error) throw error
  const map = new Map<string, string>()
  for (const row of data ?? []) {
    const id = (row as { content_item_id: string | null }).content_item_id
    const at = (row as { scheduled_at: string | null }).scheduled_at
    if (id && at && !map.has(id)) map.set(id, at)
  }
  return map
}
