import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProductChipProps {
  thumbnailUrl: string | null
  name: string
  metaLine: string // e.g. "¥16,900 · QTY 1 · GRADE B"
  onOpen: () => void
}

export function ProductChip({ thumbnailUrl, name, metaLine, onOpen }: ProductChipProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm"
    >
      <span className={cn('h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-brand-ash/20')}>
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-brand text-sm font-semibold text-brand-ink">{name}</span>
        <span className="block truncate font-data text-xs uppercase tracking-wider text-brand-umber">
          {metaLine}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-brand-ash" />
    </button>
  )
}
