import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RefreshCw, Send, Scissors, FileVideo } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader, ConfirmDialog } from '@/components/shared'
import { KanbanBoard, PostFormDialog, PostEditDialog } from '@/components/social-media'
import {
  useSocialMediaPosts,
  useUpdateSocialMediaPost,
  useDeleteSocialMediaPost,
  useSyncSocialMediaStatuses,
  useProcessSocialQueue,
  useGeneratePostCaption,
} from '@/hooks/use-social-media-posts'

export default function SocialMediaPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [processConfirm, setProcessConfirm] = useState(false)
  const [captionId, setCaptionId] = useState<string | null>(null)

  const navigate = useNavigate()
  const { data: posts = [], isLoading } = useSocialMediaPosts()
  const updateMutation = useUpdateSocialMediaPost()
  const deleteMutation = useDeleteSocialMediaPost()
  const syncMutation = useSyncSocialMediaStatuses()
  const processMutation = useProcessSocialQueue()
  const captionMutation = useGeneratePostCaption()
  const hasSynced = useRef(false)

  const queuedCount = posts.filter((p) => p.status === 'queued').length

  useEffect(() => {
    if (hasSynced.current) return
    hasSynced.current = true
    syncMutation.mutate(undefined, {
      onSuccess: (data) => {
        if (data.published > 0 || data.failed > 0) {
          toast.success(`Synced: ${data.published} published, ${data.failed} failed`)
        }
      },
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleQueue(id: string) {
    updateMutation.mutate(
      { id, updates: { status: 'queued' } },
      {
        onSuccess: () => toast.success('Post queued'),
        onError: (err) => toast.error(`Failed: ${err.message}`),
      }
    )
  }

  function handleRetry(id: string) {
    updateMutation.mutate(
      { id, updates: { status: 'queued', error_message: null } },
      {
        onSuccess: () => toast.success('Post re-queued'),
        onError: (err) => toast.error(`Failed: ${err.message}`),
      }
    )
  }

  function handleProcessQueue() {
    setProcessConfirm(false)
    processMutation.mutate(undefined, {
      onSuccess: (data) =>
        toast.success(
          `Processed ${data.processed}: ${data.published} published, ${data.scheduled} scheduled, ${data.failed} failed`,
        ),
      onError: (err) => toast.error(`Process failed: ${err.message}`),
    })
  }

  function handleGenerateCaption(id: string) {
    setCaptionId(id)
    captionMutation.mutate(id, {
      onSuccess: () => toast.success('Caption generated'),
      onError: (err) => toast.error(`Caption failed: ${err.message}`),
      onSettled: () => setCaptionId(null),
    })
  }

  function handleUnqueue(id: string) {
    updateMutation.mutate(
      { id, updates: { status: 'draft', scheduled_at: null, error_message: null } },
      {
        onSuccess: () => toast.success('Removed from queue — the video stays in Recorded Videos'),
        onError: (err) => toast.error(`Failed: ${err.message}`),
      }
    )
  }

  function handleDelete() {
    if (!deleteId) return
    // Safety net: a video post is a Recorded Video (same row) — never hard-delete it here,
    // only un-queue. True deletion lives in Recorded Videos' trash.
    const post = posts.find((p) => p.id === deleteId)
    if (post?.post_type === 'video') {
      handleUnqueue(deleteId)
      setDeleteId(null)
      return
    }
    deleteMutation.mutate(deleteId, {
      onSuccess: () => {
        toast.success('Post deleted')
        setDeleteId(null)
      },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Social Media"
          description="Stage and queue posts for Blotato publishing."
        />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => syncMutation.mutate(undefined, {
              onSuccess: (data) => {
                toast.success(`Synced: ${data.published} published, ${data.failed} failed, ${data.unchanged} unchanged`)
              },
              onError: (err) => toast.error(`Sync failed: ${err.message}`),
            })}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            onClick={() => setProcessConfirm(true)}
            disabled={processMutation.isPending || queuedCount === 0}
          >
            <Send className={`h-4 w-4 mr-2 ${processMutation.isPending ? 'animate-pulse' : ''}`} />
            {processMutation.isPending ? 'Processing…' : `Process Queue${queuedCount > 0 ? ` (${queuedCount})` : ''}`}
          </Button>
          <Button variant="outline" onClick={() => navigate('/admin/recorded-videos')}>
            <FileVideo className="h-4 w-4 mr-2" />
            Recorded videos
          </Button>
          <Button variant="outline" onClick={() => navigate('/admin/video-editor')}>
            <Scissors className="h-4 w-4 mr-2" />
            Trim &amp; post a video
          </Button>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Post
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading posts...</div>
      ) : (
        <KanbanBoard
          posts={posts}
          onQueue={handleQueue}
          onDelete={setDeleteId}
          onUnqueue={handleUnqueue}
          onRetry={handleRetry}
          onEdit={setEditId}
          onGenerateCaption={handleGenerateCaption}
          generatingCaptionId={captionId}
        />
      )}

      <PostFormDialog open={formOpen} onOpenChange={setFormOpen} />

      <PostEditDialog
        key={editId ?? 'none'}
        post={posts.find((p) => p.id === editId) ?? null}
        onOpenChange={(open) => !open && setEditId(null)}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete Post"
        description="Are you sure you want to delete this post? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={processConfirm}
        onOpenChange={setProcessConfirm}
        title="Process the queue?"
        description={`This generates captions for any blank ones and PUBLISHES ${queuedCount} queued post(s) to Blotato (real social accounts). Continue?`}
        confirmLabel="Publish to Blotato"
        onConfirm={handleProcessQueue}
        loading={processMutation.isPending}
      />
    </div>
  )
}
