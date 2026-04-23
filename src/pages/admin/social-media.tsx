import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader, ConfirmDialog } from '@/components/shared'
import { KanbanBoard, PostFormDialog } from '@/components/social-media'
import {
  useSocialMediaPosts,
  useUpdateSocialMediaPost,
  useDeleteSocialMediaPost,
} from '@/hooks/use-social-media-posts'

export default function SocialMediaPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: posts = [], isLoading } = useSocialMediaPosts()
  const updateMutation = useUpdateSocialMediaPost()
  const deleteMutation = useDeleteSocialMediaPost()

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
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Post
        </Button>
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
