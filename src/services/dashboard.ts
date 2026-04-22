import { supabase } from '@/lib/supabase'

export async function getStaleMissingItems() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('items')
    .select('id, item_code, missing_since, missing_notes, product_models(brand, model_name)')
    .eq('item_status', 'MISSING')
    .lt('missing_since', sevenDaysAgo)
    .order('missing_since', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getDashboardStats() {
  const [itemsResult, intakeResult, recentResult] = await Promise.all([
    supabase.from('items').select('item_status'),
    supabase.from('items').select('id', { count: 'exact', head: true }).eq('item_status', 'INTAKE'),
    supabase
      .from('items')
      .select(`
        id, item_code, item_status, condition_grade, inspected_at,
        product_models(brand, model_name)
      `)
      .not('inspected_at', 'is', null)
      .order('inspected_at', { ascending: false })
      .limit(10),
  ])

  if (itemsResult.error) throw itemsResult.error
  if (intakeResult.error) throw intakeResult.error
  if (recentResult.error) throw recentResult.error

  const statusCounts: Record<string, number> = { INTAKE: 0, AVAILABLE: 0, RESERVED: 0, REPAIR: 0, MISSING: 0, SOLD: 0 }
  for (const item of itemsResult.data ?? []) {
    if (item.item_status in statusCounts) {
      statusCounts[item.item_status]++
    }
  }

  return {
    total: itemsResult.data?.length ?? 0,
    statusCounts,
    intakeCount: intakeResult.count ?? 0,
    recentInspections: recentResult.data ?? [],
  }
}
