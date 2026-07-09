import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useGeneratePostCaption, useUpdateSocialMediaPost } from '@/hooks/use-social-media-posts'
import type { SocialMediaPostWithItem } from '@/lib/types'

interface PostEditDialogProps {
  post: SocialMediaPostWithItem | null
  onOpenChange: (open: boolean) => void
}

function isVideoUrl(url: string, isVideoPost: boolean): boolean {
  if (isVideoPost) return true
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
}

// View + edit a Draft/Queued/Scheduled post: preview its media, generate a caption with AI,
// tweak it by hand, and save. Generate persists server-side (via generatePostCaption) and returns
// the text; Save persists any manual edits via updateSocialMediaPost. Reachable from the kanban Edit
// action (R5). The parent keys this by post id so it remounts per post — seeding the caption from
// props without a syncing effect.
export function PostEditDialog({ post, onOpenChange }: PostEditDialogProps) {
  const [caption, setCaption] = useState(() => post?.caption ?? '')
  const generateMutation = useGeneratePostCaption()
  const updateMutation = useUpdateSocialMediaPost()

  if (!post) return null

  const mediaUrls = post.media_urls ?? []
  const isVideoPost = post.post_type === 'video'
  const modelName = post.items?.product_models
    ? `${post.items.product_models.brand} ${post.items.product_models.model_name}`
    : null

  function handleGenerate() {
    if (!post) return
    generateMutation.mutate(post.id, {
      onSuccess: (generated) => {
        setCaption(generated)
        toast.success(post.caption ? 'Caption regenerated' : 'Caption generated')
      },
      onError: (err) => toast.error(`Caption failed: ${err.message}`),
    })
  }

  function handleSave() {
    if (!post) return
    updateMutation.mutate(
      { id: post.id, updates: { caption: caption.trim() || null } },
      {
        onSuccess: () => {
          toast.success('Caption saved')
          onOpenChange(false)
        },
        onError: (err) => toast.error(`Save failed: ${err.message}`),
      },
    )
  }

  const busy = generateMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={!!post} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit post</DialogTitle>
          <DialogDescription>
            {post.item_code ?? 'No item'}
            {modelName ? ` · ${modelName}` : ''} · {post.status}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Media preview */}
          {mediaUrls.length > 0 && (
            <div className="space-y-1.5">
              <Label>Media ({mediaUrls.length})</Label>
              <div className="flex gap-2 overflow-x-auto rounded-md bg-muted/40 p-2">
                {mediaUrls.map((url, i) =>
                  isVideoUrl(url, isVideoPost) ? (
                    <video
                      key={i}
                      src={url}
                      controls
                      preload="metadata"
                      playsInline
                      className="h-40 shrink-0 rounded bg-black"
                    />
                  ) : (
                    <img
                      key={i}
                      src={url}
                      alt=""
                      className="h-40 shrink-0 rounded object-cover"
                    />
                  ),
                )}
              </div>
            </div>
          )}

          {/* Caption editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-caption">Caption</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={handleGenerate}
                disabled={busy}
              >
                <Sparkles className={`h-3 w-3 mr-1 ${generateMutation.isPending ? 'animate-pulse' : ''}`} />
                {caption.trim() ? 'Regenerate' : 'Generate'}
              </Button>
            </div>
            <Textarea
              id="edit-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={10}
              placeholder="Write a caption, or Generate one with AI…"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" className="flex-1" disabled={busy} onClick={handleSave}>
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
