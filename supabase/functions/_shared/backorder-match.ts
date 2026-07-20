const CORE_FIELDS = ["product_id", "storage_gb", "color", "condition_grade"] as const
type Core = typeof CORE_FIELDS[number]

export interface MatchResult {
  ok: boolean
  fields: Array<{ field: Core; itemValue: unknown; lineValue: unknown; match: boolean }>
  blocking: Core[]
}

/**
 * Normalize a free-text storage value to integer GB. Mirrors the SQL helper
 * `public._backorder_norm_storage_gb` and the frontend `normalizeStorageGb` in
 * src/lib/utils.ts (keep all three in sync).
 *
 * Rules: extract the leading digit run; if the string matches /tb/i, multiply by
 * 1024 (TB→GB — matches the supplier adapter + catalog harvest). Numbers pass through
 * (floored). null/no-digits → null.
 * Examples: '128GB'→128, '1TB'→1024, '256GB SSD'→256, '128'→128, 512→512.
 */
export function normalizeStorageGb(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === "number") return Number.isFinite(v) ? Math.floor(v) : null
  if (typeof v !== "string") return null
  const m = v.match(/(\d+)/)
  if (!m) return null
  const gb = parseInt(m[1], 10)
  if (Number.isNaN(gb)) return null
  return /t\s*b/i.test(v) ? gb * 1024 : gb
}

export function verifyPCodeMatch(item: Record<string, unknown>, line: Record<string, unknown>): MatchResult {
  const fields = CORE_FIELDS.map((f) => {
    // storage_gb is messy free-text on items but integer on backorder_lines —
    // normalize both sides before comparing (mirrors the SQL hard-block in
    // fulfill_backorder_with_item). Other fields keep the plain norm() compare.
    const match = f === "storage_gb"
      ? normalizeStorageGb(item[f]) === normalizeStorageGb(line[f])
      : norm(item[f]) === norm(line[f])
    return { field: f, itemValue: item[f], lineValue: line[f], match }
  })
  const blocking = fields.filter((f) => !f.match).map((f) => f.field)
  return { ok: blocking.length === 0, fields, blocking }
}

function norm(v: unknown) {
  return typeof v === "string" ? v.trim().toLowerCase() : v
}
