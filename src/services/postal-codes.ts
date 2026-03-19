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

/** Reverse lookup: find postal code(s) by prefecture + city + town */
export async function reverseLookupPostalCode(
  prefectureJa: string,
  cityJa: string,
  townJa: string
): Promise<PostalCodeEntry[]> {
  if (!prefectureJa || !cityJa) return []

  // @ts-expect-error postal_codes table not yet in generated types
  let query = supabase
    .from('postal_codes')
    .select('*')
    .eq('prefecture_ja', prefectureJa)
    .eq('city_ja', cityJa)

  if (townJa) {
    query = query.eq('town_ja', townJa)
  }

  const { data, error } = await query.limit(20)
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

/** Parse a Shift-JIS (or UTF-8) CSV file into PostalCodeEntry rows */
export function parsePostalCodeCSV(buffer: ArrayBuffer): Omit<PostalCodeEntry, 'id'>[] {
  // Try Shift-JIS first (Japan Post default), fallback to UTF-8
  let text: string
  try {
    const decoder = new TextDecoder('shift_jis')
    text = decoder.decode(buffer)
  } catch {
    text = new TextDecoder('utf-8').decode(buffer)
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const rows: Omit<PostalCodeEntry, 'id'>[] = []

  for (const line of lines) {
    // Parse quoted CSV: "val1","val2",...
    const cols = line.match(/"([^"]*)"/g)?.map((c) => c.replace(/^"|"$/g, ''))
    if (!cols || cols.length < 7) continue

    const [postal_code, prefecture_ja, city_ja, town_ja, prefecture_en, city_en, town_en] = cols
    // Skip if postal_code is not 7 digits (header row or invalid)
    if (!/^\d{7}$/.test(postal_code)) continue

    rows.push({
      postal_code,
      prefecture_ja,
      prefecture_en: prefecture_en.toUpperCase(),
      city_ja: city_ja.replace(/\u3000/g, ''), // Remove full-width spaces
      city_en: city_en.toUpperCase(),
      town_ja: town_ja.replace(/\u3000/g, '').replace(/（.*?）/g, '').trim(), // Remove full-width parens
      town_en: town_en.toUpperCase().replace(/\(.*?\)/g, '').trim(), // Remove half-width parens
    })
  }

  return rows
}

/** Truncate postal_codes table and bulk insert new data in batches */
export async function seedPostalCodes(
  rows: Omit<PostalCodeEntry, 'id'>[],
  onProgress?: (inserted: number, total: number) => void
): Promise<{ totalInserted: number }> {
  const BATCH_SIZE = 500

  // Truncate existing data using RPC to avoid UUID type issues
  // @ts-expect-error postal_codes table not yet in generated types
  const { error: deleteError } = await supabase.from('postal_codes').delete().gt('created_at', '1970-01-01')
  if (deleteError) throw new Error(`Failed to clear table: ${deleteError.message}`)

  let totalInserted = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    // @ts-expect-error postal_codes table not yet in generated types
    const { error } = await supabase.from('postal_codes').insert(batch)
    if (error) throw new Error(`Batch insert failed at row ${i}: ${error.message}`)
    totalInserted += batch.length
    onProgress?.(totalInserted, rows.length)
  }

  return { totalInserted }
}
