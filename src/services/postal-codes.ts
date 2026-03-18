import { supabase } from '@/lib/supabase'

export interface PostalCodeEntry {
  id: string
  postal_code: string
  prefecture_ja: string
  prefecture_en: string
  city_ja: string
  city_en: string
  town_ja: string
  town_en: string
}

export async function lookupPostalCode(code: string): Promise<PostalCodeEntry[]> {
  const normalized = code.replace(/-/g, '')
  if (normalized.length !== 7) return []

  // @ts-expect-error postal_codes table not yet in generated types
  const { data, error } = await supabase
    .from('postal_codes')
    .select('*')
    .eq('postal_code', normalized)

  if (error) throw error
  return (data ?? []) as PostalCodeEntry[]
}

export async function getPostalCodeStats() {
  // @ts-expect-error postal_codes table not yet in generated types
  const { count, error } = await supabase
    .from('postal_codes')
    .select('*', { count: 'exact', head: true })

  if (error) throw error
  return { totalRows: count ?? 0 }
}
