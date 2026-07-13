/** Clamp a string for audit logs / snippets; appends an ellipsis when cut. */
export function truncate(text: string, max = 300): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '…'
}

/** Compact age label for worklist rows: 30m / 4h / 3d. */
export function ageLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—'
  const mins = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
