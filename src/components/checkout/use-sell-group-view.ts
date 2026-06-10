import { useMemo } from 'react'
import type { CheckoutMedia } from './media-gallery'
import { CONDITION_GRADES } from '@/lib/constants'

// Loose shapes — the sell group comes from a generated Supabase type; we read defensively.
interface SgLike {
  sell_group_code?: string
  condition_grade?: string | null
  discount_amount?: number | null
  product_models?: {
    brand?: string
    model_name?: string
    short_description?: string | null
    product_media?: Array<{ file_url: string; media_type?: string | null; role?: string | null; sort_order?: number | null }>
  } | null
  sell_group_items?: Array<{
    items: { item_code?: string; item_status?: string; condition_grade?: string | null; selling_price?: number | null } | null
  }>
}

export interface SellGroupView {
  name: string
  shortDescription: string
  grade: string | null
  gradeLabel: string
  unitPrice: number
  discountAmount: number
  effectiveUnitPrice: number
  stockCount: number
  primaryItemCode: string
  media: CheckoutMedia[]
  thumbnailUrl: string | null
}

export function useSellGroupView(sg: unknown | null | undefined): SellGroupView | null {
  return useMemo(() => {
    if (!sg) return null
    const s = sg as SgLike
    const pm = s.product_models ?? null
    const name = pm ? `${pm.brand ?? ''} ${pm.model_name ?? ''}`.trim() : s.sell_group_code ?? 'Item'
    const items = s.sell_group_items ?? []
    const available = items.filter(
      (i) => i.items?.item_status === 'AVAILABLE' && i.items?.condition_grade !== 'J',
    )
    const stockCount = available.length
    const unitPrice = Number(items.map((i) => i.items?.selling_price).find((p) => p != null) ?? 0)
    const discountAmount = Number(s.discount_amount ?? 0)
    const grade = s.condition_grade ?? null
    const gradeLabel = CONDITION_GRADES.find((g) => g.value === grade)?.value ?? (grade ?? '—')
    const primaryItemCode = available[0]?.items?.item_code ?? s.sell_group_code ?? ''

    const media: CheckoutMedia[] = (pm?.product_media ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((m) => ({ url: m.file_url, type: m.media_type === 'video' || m.role === 'video' ? 'video' : 'image' }))
    const thumbnailUrl = media.find((m) => m.type === 'image')?.url ?? null

    return {
      name,
      shortDescription: pm?.short_description ?? '',
      grade,
      gradeLabel,
      unitPrice,
      discountAmount,
      effectiveUnitPrice: Math.max(0, unitPrice - discountAmount),
      stockCount,
      primaryItemCode,
      media,
      thumbnailUrl,
    }
  }, [sg])
}
