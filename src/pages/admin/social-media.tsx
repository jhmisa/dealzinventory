import { useState, useEffect, useRef } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader, ConfirmDialog } from '@/components/shared'
import { KanbanBoard, PostFormDialog } from '@/components/social-media'
import {
  useSocialMediaPosts,
  useUpdateSocialMediaPost,
  useDeleteSocialMediaPost,
  useSyncSocialMediaStatuses,
} from '@/hooks/use-social-media-posts'

export default function SocialMediaPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: posts = [], isLoading } = useSocialMediaPosts()
  const updateMutation = useUpdateSocialMediaPost()
  const deleteMutation = useDeleteSocialMediaPost()
  const syncMutation = useSyncSocialMediaStatuses()
  const hasSynced = useRef(false)

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

  function handleDelete() {
    if (!deleteId) return
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
          onRetry={handleRetry}
        />
      )}

      <PostFormDialog open={formOpen} onOpenChange={setFormOpen} />

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
    </div>
  )
}
