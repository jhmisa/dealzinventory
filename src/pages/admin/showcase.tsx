import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Image, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/utils'
import { getShowcaseItem, getShowcaseAccessory, type ShowcaseItem } from '@/services/showcase'

const TIMER_SECONDS = 3
const DESIGN_W = 720
const DESIGN_H = 1280

function useWindowScale() {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const update = () => {
      setScale(Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return scale
}

export default function ShowcasePage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [currentItem, setCurrentItem] = useState<ShowcaseItem | null>(null)
  const [mediaMode, setMediaMode] = useState<'photos' | 'videos'>('photos')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [countdown, setCountdown] = useState(TIMER_SECONDS)
  const [loading, setLoading] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(!!data.session)
    })
  }, [])

  // Auto-load item from ?item= query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const itemCode = params.get('item')
    if (!itemCode) return

    const mode = params.get('mode')
    const fetcher = itemCode.toUpperCase().startsWith('A') ? getShowcaseAccessory : getShowcaseItem
    setLoading(true)
    fetcher(itemCode).then((item) => {
      if (item) {
        setCurrentItem(item)
        setMediaMode(mode === 'videos' ? 'videos' : 'photos')
      }
    }).finally(() => setLoading(false))

    // Clean up query param from URL
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  // Listen for cross-window item updates via BroadcastChannel
  useEffect(() => {
    const channel = new BroadcastChannel('showcase')
    channel.onmessage = (event) => {
      const { itemCode, mediaMode: mode } = event.data as { itemCode: string; mediaMode?: 'photos' | 'videos' }
      if (!itemCode) return
      const fetcher = itemCode.toUpperCase().startsWith('A') ? getShowcaseAccessory : getShowcaseItem
      setLoading(true)
      fetcher(itemCode).then((item) => {
        if (item) {
          setCurrentItem(item)
          setMediaMode(mode === 'videos' ? 'videos' : 'photos')
        }
      }).finally(() => setLoading(false))
    }
    return () => channel.close()
  }, [])

  // Media arrays for current mode
  const photos = currentItem?.photos ?? []
  const videos = currentItem?.videos ?? []
  const mediaItems = mediaMode === 'photos' ? photos : videos
  const mediaCount = mediaItems.length

  // Photo auto-advance timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)

    if (mediaMode !== 'photos' || mediaCount === 0) return

    setCountdown(TIMER_SECONDS)
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setCurrentIndex((i) => (i + 1) % mediaCount)
          return TIMER_SECONDS
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [mediaMode, mediaCount, currentIndex])

  // Video auto-advance on end
  const handleVideoEnded = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % mediaCount)
  }, [mediaCount])

  // Reset index when switching modes or loading new item
  useEffect(() => {
    setCurrentIndex(0)
    setCountdown(TIMER_SECONDS)
  }, [mediaMode, currentItem])

  const scale = useWindowScale()

  if (authenticated === null) return null

  if (!authenticated) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-black flex items-start justify-center">
        <div
          className="flex items-center justify-center w-[720px] h-[1280px] bg-white"
          style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
        >
          <p className="text-lg text-muted-foreground">Please log in to use the showcase.</p>
        </div>
      </div>
    )
  }

  const price = currentItem?.selling_price ?? currentItem?.purchase_price
  const currentMedia = mediaItems[currentIndex]

  return (
    <div className="w-screen h-screen overflow-hidden bg-black flex items-start justify-center">
    <div
      className="[font-synthesis:none] flex overflow-clip w-[720px] h-[1280px] flex-col bg-white antialiased text-xs/4 relative"
      style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
    >
      {/* Media Viewer — 720x720 square */}
      <div className="w-[720px] h-[720px] flex items-center justify-center relative shrink-0 bg-[#1A1A1A]">
        {mediaMode === 'photos' && currentMedia ? (
          <img
            key={currentMedia.id}
            src={currentMedia.url}
            alt={currentItem?.item_code ?? ''}
            className="w-full h-full object-contain"
          />
        ) : mediaMode === 'videos' && currentMedia ? (
          <video
            ref={videoRef}
            key={currentMedia.id}
            src={currentMedia.url}
            autoPlay
            muted
            loop={mediaCount === 1}
            onEnded={handleVideoEnded}
            className="w-full h-full object-contain"
          />
        ) : (
          <Image className="h-16 w-16 text-[#404040]" strokeWidth={1.5} />
        )}

        {/* Photo indicator dots */}
        {mediaCount > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {mediaItems.map((m, i) => (
              <div
                key={m.id}
                className={`rounded-full shrink-0 ${i === currentIndex ? 'size-2 bg-white' : 'size-1.5 bg-white/40'}`}
              />
            ))}
          </div>
        )}

        {/* Timer badge — top left (photos only) */}
        {mediaMode === 'photos' && mediaCount > 0 && (
          <div className="absolute top-4 left-4 flex items-center rounded-full py-1.5 px-2.5 gap-1.5 bg-black/50">
            <Clock className="h-3 w-3 text-white" strokeWidth={2} />
            <span className="text-white font-medium text-[11px]/3.5">
              {countdown}s
            </span>
          </div>
        )}

        {/* Counter badge — top right */}
        {mediaCount > 0 && (
          <div className="absolute top-4 right-4 flex items-center rounded-full py-1.5 px-2.5 gap-1 bg-black/50">
            <span className="text-white font-semibold text-[11px]/3.5">
              {currentIndex + 1}
            </span>
            <span className="text-white/50 text-[11px]/3.5">/</span>
            <span className="text-white/50 text-[11px]/3.5">
              {mediaCount}
            </span>
          </div>
        )}

      </div>

      {/* Product Info — floating overlay straddling media boundary */}
      {currentItem && (
        <div className="absolute top-[570px] left-0 right-0 z-10 px-3 pt-10 pb-2 bg-gradient-to-b from-transparent via-black/70 to-black">
          <div className="flex items-end gap-6">
            {/* Left: code + rank (inline) then price */}
            <div className="flex flex-col shrink-0 min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="tracking-[0.02em] text-white font-bold text-[36px]/[40px]">
                  {currentItem.item_code}
                </span>
                {currentItem.condition_grade && (
                  <div className="flex items-center rounded-md py-0.5 px-2.5 bg-white/20 border border-white/25">
                    <span className="text-white font-semibold text-[20px]/[26px]">
                      Rank {currentItem.condition_grade}
                    </span>
                  </div>
                )}
              </div>
              <span className="tracking-[-0.03em] text-white font-extrabold text-[72px]/[72px] mt-1">
                {price != null ? formatPrice(price) : '—'}
              </span>
            </div>

            {/* Right: description + condition */}
            <div className="flex flex-col grow min-w-0 gap-1.5 pb-1.5">
              {currentItem.description && (
                <p className="text-white/95 font-medium text-[30px]/[36px] line-clamp-3">
                  {currentItem.description}
                </p>
              )}
              {currentItem.condition_notes && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-white/60 text-[9px]/[12px] font-semibold uppercase tracking-[0.12em]">
                    Condition
                  </span>
                  <span className="text-white/85 text-[12px]/[16px] line-clamp-2">
                    {currentItem.condition_notes}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Half — split into left (product info) and right (camera) */}
      <div className="flex grow shrink basis-0 overflow-hidden">
        {/* Left column — empty state only (product info is now overlaid on the media area) */}
        <div className="w-[360px] shrink-0 flex flex-col bg-black">
          {!currentItem && (
            <div className="flex flex-col items-center justify-center grow shrink basis-0 text-[#A1A1AA] gap-3">
              <Search className="h-10 w-10" strokeWidth={1.5} />
              <span className="text-base">Scan or search a P-code or A-code to begin</span>
            </div>
          )}
        </div>

        {/* Right column — camera placeholder */}
        <div className="w-[360px] shrink-0 bg-black" />
      </div>
    </div>
    </div>
  )
}
