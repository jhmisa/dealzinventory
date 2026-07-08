import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Film, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader, InventoryPicker } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { VideoEditor } from '@/components/video-editor'
import { Recorder } from '@/components/video-recorder'
import { createSocialMediaPost } from '@/services/social-media-posts'
import { getShoot } from '@/services/shoots'
import type { Orientation } from '@/lib/video-recorder'
import { cn } from '@/lib/utils'

type Mode = 'pick' | 'record' | 'edit'

function parseCodes(raw: string): string[] {
  return [...new Set(raw.split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean))]
}

export default function VideoEditorPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [mode, setMode] = useState<Mode>('pick')
  const [source, setSource] = useState<Blob | null>(null)
  const [itemBounds, setItemBounds] = useState<number[]>([])
  const [durationHint, setDurationHint] = useState<number | undefined>(undefined)
  const [codes, setCodes] = useState<string[]>([]) // staged items for the shoot
  const [started, setStarted] = useState(false) // recorder is live
  const [orientation, setOrientation] = useState<Orientation | undefined>(undefined)
  const [firstCode, setFirstCode] = useState<string | null>(null)
  const [codesInput, setCodesInput] = useState('')
  const [dragOver, setDragOver] = useState(false)

  // Preload codes from a Shoot and jump straight into recording when arriving via ?shoot=/?mode=record.
  useEffect(() => {
    const shootId = searchParams.get('shoot')
    const wantRecord = searchParams.get('mode') === 'record'
    if (shootId) {
      getShoot(shootId)
        .then((s) => {
          if (s?.orientation === 'landscape' || s?.orientation === 'portrait') setOrientation(s.orientation)
          if (s?.item_codes?.length) {
            setCodes(s.item_codes)
            setStarted(true)
            setMode('record')
          } else if (wantRecord) {
            setMode('record')
          }
        })
        .catch(() => {
          if (wantRecord) setMode('record')
        })
    } else if (wantRecord) {
      setMode('record')
    }
  }, [searchParams])

  const addCode = useCallback((code: string) => {
    setCodes((prev) => (prev.includes(code) ? prev : [...prev, code]))
  }, [])

  const removeCode = useCallback((code: string) => {
    setCodes((prev) => prev.filter((c) => c !== code))
  }, [])

  const pickFile = useCallback((file: File | undefined | null) => {
    if (!file) return
    if (!file.type.startsWith('video/')) {
      toast.error('Please choose a video file.')
      return
    }
    setSource(file)
    setItemBounds([])
    setDurationHint(undefined)
    setFirstCode(null)
    setMode('edit')
  }, [])

  const handleRecorderComplete = useCallback(
    (blob: Blob, bounds: number[], durationSec: number, first: string | null) => {
      setSource(blob)
      setItemBounds(bounds)
      setDurationHint(durationSec)
      setFirstCode(first)
      setMode('edit')
    },
    [],
  )

  const handleExport = useCallback(
    async (mp4: Blob) => {
      const id = crypto.randomUUID()
      const path = `exports/${id}.mp4`
      // Upload the already-encoded MP4 directly — do NOT route through uploadMedia,
      // which strips audio (-an) and square-crops (would wreck a portrait Reel with voiceover).
      const up = await supabase.storage
        .from('social-media')
        .upload(path, mp4, { contentType: 'video/mp4', upsert: false })
      if (up.error) {
        toast.error(`Upload failed: ${up.error.message}`)
        return
      }
      const { data: pub } = supabase.storage.from('social-media').getPublicUrl(path)

      try {
        // Draft only — the team sets the Facebook target + queues via the existing flow.
        // Tag the featured item so the recorded-videos library can group by product.
        await createSocialMediaPost({
          media_urls: [pub.publicUrl],
          post_type: 'video',
          platform: 'facebook',
          status: 'draft',
          ...(firstCode ? { item_code: firstCode } : {}),
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not create the draft post.')
        return
      }

      toast.success('Video exported — draft post created on Social Media.')
      navigate('/admin/recorded-videos')
    },
    [navigate, firstCode],
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Video Editor" description="Record or upload, trim, brand, and export a video — then post it." />

      {mode === 'edit' && source ? (
        <VideoEditor source={source} itemBounds={itemBounds} durationHint={durationHint} onExport={handleExport} />
      ) : mode === 'record' && started && codes.length > 0 ? (
        <Recorder
          codes={codes}
          initialOrientation={orientation}
          onComplete={handleRecorderComplete}
          onCancel={() => {
            setStarted(false)
          }}
        />
      ) : mode === 'record' ? (
        // Record mode: stage the items to feature via the canonical inventory picker.
        <div className="mx-auto max-w-2xl space-y-3">
          <div>
            <h3 className="text-sm font-medium">Which items are you recording?</h3>
            <p className="text-xs text-muted-foreground">
              Search and add the items to feature. During recording, press <b>Space</b> to advance to the next one and
              <b> T</b> to switch between an item&apos;s photos and video.
            </p>
          </div>

          {codes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {codes.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-mono text-xs"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() => removeCode(c)}
                    className="rounded-full text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${c}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex h-[400px] flex-col rounded-lg border border-border p-3">
            <InventoryPicker onAdd={(item) => addCode(item.code)} addedCodes={codes} autoFocus />
          </div>

          <div className="flex gap-2">
            <Input
              value={codesInput}
              onChange={(e) => setCodesInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  parseCodes(codesInput).forEach(addCode)
                  setCodesInput('')
                }
              }}
              placeholder="…or type codes: P000840 G000123"
              className="h-9 font-mono text-sm"
            />
            <Button
              variant="outline"
              onClick={() => {
                parseCodes(codesInput).forEach(addCode)
                setCodesInput('')
              }}
            >
              Add
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              disabled={codes.length === 0}
              onClick={() => {
                if (!codes.length) {
                  toast.error('Add at least one item.')
                  return
                }
                setStarted(true)
              }}
            >
              <Video className="mr-2 h-4 w-4" />
              Start recording ({codes.length})
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCodes([])
                setMode('pick')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        // pick mode: upload OR record
        <div className="space-y-4">
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              pickFile(e.dataTransfer.files?.[0])
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-16 text-center transition-colors',
              dragOver && 'border-primary bg-primary/5',
            )}
          >
            <Film className="h-10 w-10 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Drop a video here</span> or click to choose
            </div>
            <p className="text-xs text-muted-foreground">Best in Chrome or Edge · portrait clips post as Facebook Reels</p>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </label>

          <div className="flex items-center justify-center">
            <Button variant="outline" onClick={() => setMode('record')}>
              <Video className="mr-2 h-4 w-4" />
              Record a live-selling video
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
