// Pure helper: derive a Library card's rotation-status chip from a content item.
// Structural input (no @/lib/types import) so this stays dependency-free and unit-testable.
export type RotationTone = 'muted' | 'active' | 'warn'
export interface RotationStatus {
  label: string
  tone: RotationTone
}

export interface RotationItem {
  retired_at: string | null
  is_evergreen: boolean
  times_posted: number
}

export interface RotationContext {
  /** Whether an active rule currently includes this item (Phase 2 populates this). */
  hasRule: boolean
  /** Next scheduled date label, if known. */
  nextDate?: string | null
}

export function rotationStatus(
  item: RotationItem,
  ctx: RotationContext = { hasRule: false },
): RotationStatus {
  if (item.retired_at) return { label: 'Retired', tone: 'muted' }
  if (ctx.hasRule && ctx.nextDate) {
    return { label: `In rotation · ${item.times_posted}× · next ${ctx.nextDate}`, tone: 'active' }
  }
  if (item.is_evergreen && !ctx.hasRule) return { label: 'Evergreen (no rule)', tone: 'warn' }
  return { label: 'Not scheduled', tone: 'muted' }
}
