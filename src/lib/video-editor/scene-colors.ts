// Pure: map a timeline piece to its "scene" (the item segment it belongs to, defined by the
// recorder's SPACE-tap itemBounds) so all pieces within one scene share a colour and adjacent
// scenes differ. Keeps the editor timeline readable as scenes, not just cut pieces.

// Neutral fills — differentiate by lightness, not hue (mirrors the mockup --seg1..4).
export const SCENE_FILLS = ['oklch(0.40 0 0)', 'oklch(0.50 0 0)', 'oklch(0.34 0 0)', 'oklch(0.45 0 0)']

/** Scene index of a piece = how many item boundaries start at or before its start time. */
export function sceneIndexOf(pieceStart: number, itemBounds: number[]): number {
  let n = 0
  for (const b of itemBounds) if (b <= pieceStart + 1e-6) n++
  return n
}

export function sceneFill(pieceStart: number, itemBounds: number[]): string {
  return SCENE_FILLS[sceneIndexOf(pieceStart, itemBounds) % SCENE_FILLS.length]
}
