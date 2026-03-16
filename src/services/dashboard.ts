import { supabase } from '@/lib/supabase'

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

  const statusCounts = { INTAKE: 0, AVAILABLE: 0, REPAIR: 0, MISSING: 0 }
  for (const item of itemsResult.data ?? []) {
    statusCounts[item.item_status as keyof typeof statusCounts]++
  }

  return {
    total: itemsResult.data?.length ?? 0,
    statusCounts,
    intakeCount: intakeResult.count ?? 0,
    recentInspections: recentResult.data ?? [],
  }
}
