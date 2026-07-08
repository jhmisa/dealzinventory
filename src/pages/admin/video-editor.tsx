import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Film } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/shared'
import { VideoEditor } from '@/components/video-editor'
import { createSocialMediaPost } from '@/services/social-media-posts'
import { cn } from '@/lib/utils'

export default function VideoEditorPage() {
  const navigate = useNavigate()
  const [source, setSource] = useState<Blob | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const pickFile = useCallback((file: File | undefined | null) => {
    if (!file) return
    if (!file.type.startsWith('video/')) {
      toast.error('Please choose a video file.')
      return
    }
    setSource(file)
  }, [])

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
        // account_id/page_id/schedule_type fall to the table defaults (the real Dealz FB page).
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
      <PageHeader title="Video Editor" description="Trim, cut, brand, and export a video — then post it." />

      {!source ? (
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
      ) : (
        <VideoEditor source={source} onExport={handleExport} />
      )}
    </div>
  )
}
