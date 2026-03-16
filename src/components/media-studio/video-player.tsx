import { useState, useRef } from 'react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VideoPlayerProps {
  src: string
  className?: string
  controls?: boolean
  autoPlay?: boolean
  muted?: boolean
  poster?: string
}

export function VideoPlayer({
  src,
  className,
  controls = true,
  autoPlay = false,
  muted = true,
  poster,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [paused, setPaused] = useState(!autoPlay)

  function handlePlayClick() {
    if (videoRef.current) {
      videoRef.current.play()
    }
  }

  function handlePlay() {
    setPaused(false)
  }

  function handlePause() {
    setPaused(true)
  }

  return (
    <div className={cn('relative aspect-square bg-black rounded-lg overflow-hidden', className)}>
      <video
        ref={videoRef}
        src={src}
        controls={controls}
        autoPlay={autoPlay}
        muted={muted}
        poster={poster}
        onPlay={handlePlay}
        onPause={handlePause}
        className="w-full h-full object-contain"
      />
      {paused && !controls && (
        <button
          type="button"
          onClick={handlePlayClick}
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity hover:bg-black/40"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg">
            <Play className="h-7 w-7 text-black ml-1" />
          </div>
        </button>
      )}
      {paused && controls && (
        <button
          type="button"
          onClick={handlePlayClick}
          className="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity hover:bg-black/30 pointer-events-auto"
          style={{ zIndex: 1 }}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg">
            <Play className="h-7 w-7 text-black ml-1" />
          </div>
        </button>
      )}
    </div>
  )
}
