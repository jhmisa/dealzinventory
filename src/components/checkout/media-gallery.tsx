import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageIcon, Play, Video as VideoIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CheckoutMedia {
  url: string
  type: 'image' | 'video'
}

interface MediaGalleryProps {
  media: CheckoutMedia[]
  /** Compact = used inside the photo sheet; full = used on the Item landing. */
  variant?: 'full' | 'sheet'
}

export function MediaGallery({ media, variant = 'full' }: MediaGalleryProps) {
  const [tab, setTab] = useState<'photos' | 'videos'>('photos')
  const photos = useMemo(() => media.filter((m) => m.type === 'image'), [media])
  const videos = useMemo(() => media.filter((m) => m.type === 'video'), [media])
  const list = tab === 'photos' ? photos : videos
  const [index, setIndex] = useState(0)
  const active = list[index] ?? list[0]
  const videoRef = useRef<HTMLVideoElement>(null)
  // Track which media URL is playing (derived state) so the play overlay reappears
  // automatically whenever the shown media changes — no effect needed.
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)
  const playing = !!active && playingUrl === active.url

  const switchTab = (t: 'photos' | 'videos') => {
    setTab(t)
    setIndex(0)
  }

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-2 rounded-2xl bg-brand-ash/15 p-1">
        <button
          type="button"
          onClick={() => switchTab('photos')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-2 font-brand text-sm font-semibold transition',
            tab === 'photos' ? 'bg-white text-brand-ink shadow-sm' : 'text-brand-umber',
          )}
        >
          <ImageIcon className="h-4 w-4" /> Photos <span className="font-data text-xs">{photos.length}</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab('videos')}
          disabled={videos.length === 0}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-2 font-brand text-sm font-semibold transition disabled:opacity-40',
            tab === 'videos' ? 'bg-white text-brand-ink shadow-sm' : 'text-brand-umber',
          )}
        >
          <VideoIcon className="h-4 w-4" /> Videos <span className="font-data text-xs">{videos.length}</span>
        </button>
      </div>

      {/* Viewer */}
      <div className={cn('relative overflow-hidden rounded-2xl bg-brand-ash/15', variant === 'full' ? 'aspect-[4/3]' : 'aspect-video')}>
        {tab === 'videos' && (
          <span className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 font-data text-[10px] uppercase tracking-wider text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-signal" /> Tested Live
          </span>
        )}
        {active ? (
          active.type === 'image' ? (
            <img src={active.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="relative h-full w-full">
              <video
                ref={videoRef}
                src={active.url}
                className="h-full w-full object-cover"
                controls={playing}
                playsInline
                preload="metadata"
                onEnded={() => setPlayingUrl(null)}
              />
              {!playing && (
                <button
                  type="button"
                  aria-label="Play video"
                  onClick={() => {
                    setPlayingUrl(active.url)
                    void videoRef.current?.play()
                  }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/85">
                    <Play className="h-6 w-6 fill-brand-ink text-brand-ink" />
                  </span>
                </button>
              )}
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-brand-ash">No media</div>
        )}

        {list.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + list.length) % list.length)}
              className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow"
            >
              <ChevronLeft className="h-4 w-4 text-brand-ink" />
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % list.length)}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow"
            >
              <ChevronRight className="h-4 w-4 text-brand-ink" />
            </button>
            <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 font-data text-[11px] text-white">
              <ImageIcon className="h-3 w-3" /> {index + 1} / {list.length}
            </span>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {list.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map((m, i) => (
            <button
              key={`${m.url}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                'h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-brand-ash/20',
                i === index ? 'ring-2 ring-brand-signal' : 'ring-1 ring-brand-ash/30',
              )}
            >
              {m.type === 'image' ? (
                <img src={m.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Play className="h-4 w-4 fill-brand-ink text-brand-ink" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
