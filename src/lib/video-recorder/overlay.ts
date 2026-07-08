/** SPACE-press timestamps → sorted, de-duped, in-range (0,duration) item boundaries. */
export function computeItemBounds(spaceTimestamps: number[], duration: number): number[] {
  return [...new Set(spaceTimestamps.filter((t) => t > 0 && t < duration))].sort((a, b) => a - b)
}
