import { iosysAdapter } from "./iosys.ts"
import type { SupplierAdapter } from "./types.ts"

const ADAPTERS: SupplierAdapter[] = [iosysAdapter]

export function resolveAdapter(url: string): SupplierAdapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null
}
