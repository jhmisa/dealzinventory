import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Film, Video } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { VideoEditor } from '@/components/video-editor'
import { Recorder } from '@/components/video-recorder'
import { createSocialMediaPost } from '@/services/social-media-posts'
import { getShoot } from '@/services/shoots'
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
  const [codes, setCodes] = useState<string[]>([])
  const [codesInput, setCodesInput] = useState('')
  const [dragOver, setDragOver] = useState(false)

  // Preload codes from a Shoot and jump to record mode when arriving via ?shoot=/?mode=record.
  useEffect(() => {
    const shootId = searchParams.get('shoot')
    const wantRecord = searchParams.get('mode') === 'record'
    if (shootId) {
      getShoot(shootId)
        .then((s) => {
          if (s?.item_codes?.length) {
            setCodes(s.item_codes)
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

  const pickFile = useCallback((file: File | undefined | null) => {
    if (!file) return
    if (!file.type.startsWith('video/')) {
      toast.error('Please choose a video file.')
      return
    }
    setSource(file)
    setItemBounds([])
    setDurationHint(undefined)
    setMode('edit')
  }, [])

  const handleRecorderComplete = useCallback(
    (blob: Blob, bounds: number[], durationSec: number) => {
      setSource(blob)
      setItemBounds(bounds)
      setDurationHint(durationSec)
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
        await createSocialMediaPost({
          media_urls: [pub.publicUrl],
          post_type: 'video',
          platform: 'facebook',
          status: 'draft',
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not create the draft post.')
        return
      }

      toast.success('Video exported — draft post created on Social Media.')
      navigate('/admin/social-media')
    },
    [navigate],
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Video Editor" description="Record or upload, trim, brand, and export a video — then post it." />

      {mode === 'edit' && source ? (
        <VideoEditor source={source} itemBounds={itemBounds} durationHint={durationHint} onExport={handleExport} />
      ) : mode === 'record' && codes.length > 0 ? (
        <Recorder
          codes={codes}
          onComplete={handleRecorderComplete}
          onCancel={() => {
            setCodes([])
            setMode('pick')
          }}
        />
      ) : mode === 'record' ? (
        // Record mode without preset codes → collect them.
        <div className="mx-auto max-w-md space-y-3 rounded-lg border border-border p-6">
          <h3 className="text-sm font-medium">Which items are you recording?</h3>
          <p className="text-xs text-muted-foreground">
            Enter the item codes to feature (P / G / B), separated by spaces or commas. Press Space during recording to
            advance to the next one.
          </p>
          <Input
            value={codesInput}
            onChange={(e) => setCodesInput(e.target.value)}
            placeholder="P000840 P001892 G000123"
            className="font-mono"
          />
          <div className="flex gap-2">
            <Button
              onClick={() => {
                const parsed = parseCodes(codesInput)
                if (!parsed.length) {
                  toast.error('Enter at least one item code.')
                  return
                }
                setCodes(parsed)
              }}
            >
              <Video className="mr-2 h-4 w-4" />
              Start
            </Button>
            <Button variant="ghost" onClick={() => setMode('pick')}>
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
