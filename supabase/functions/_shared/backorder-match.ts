const CORE_FIELDS = ["product_id", "storage_gb", "color", "condition_grade"] as const
type Core = typeof CORE_FIELDS[number]

export interface MatchResult {
  ok: boolean
  fields: Array<{ field: Core; itemValue: unknown; lineValue: unknown; match: boolean }>
  blocking: Core[]
}

export function verifyPCodeMatch(item: Record<string, unknown>, line: Record<string, unknown>): MatchResult {
  const fields = CORE_FIELDS.map((f) => {
    const match = norm(item[f]) === norm(line[f])
    return { field: f, itemValue: item[f], lineValue: line[f], match }
  })
  const blocking = fields.filter((f) => !f.match).map((f) => f.field)
  return { ok: blocking.length === 0, fields, blocking }
}

function norm(v: unknown) {
  return typeof v === "string" ? v.trim().toLowerCase() : v
}
