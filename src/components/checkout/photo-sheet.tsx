import { X } from 'lucide-react'
import { MediaGallery, type CheckoutMedia } from './media-gallery'

interface PhotoSheetProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string // e.g. "P000315 · GRADE B · ¥16,900"
  media: CheckoutMedia[]
  backLabel: string // e.g. "Back to shipping"
}

export function PhotoSheet({ open, onClose, title, subtitle, media, backLabel }: PhotoSheetProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[88vh] overflow-y-auto rounded-t-3xl bg-brand-paper px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-brand-ash/40" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-brand text-lg font-bold text-brand-ink">{title}</h2>
            <p className="font-data text-xs uppercase tracking-wider text-brand-umber">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-ash/20"
          >
            <X className="h-4 w-4 text-brand-ink" />
          </button>
        </div>
        <MediaGallery media={media} variant="sheet" />
        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-[52px] w-full rounded-2xl bg-brand-ink font-brand text-base font-semibold text-brand-paper"
        >
          {backLabel}
        </button>
      </div>
    </div>
  )
}
