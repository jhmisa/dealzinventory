// Render a backorder lead time as a working-day range. Mirrors offer-reply.ts formatLeadTime
// so pre-order rows read identically everywhere (inventory picker, messaging inserts).
export function formatLeadTime(min: number | null | undefined, max: number | null | undefined): string | null {
  const lo = typeof min === 'number' && min > 0 ? min : null
  const hi = typeof max === 'number' && max > 0 ? max : null
  if (lo && hi) return lo === hi ? `${hi} working days` : `${lo}–${hi} working days`
  if (hi) return `${hi} working days`
  if (lo) return `${lo} working days`
  return null
}
