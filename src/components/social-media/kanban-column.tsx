import type { SocialMediaPostWithItem, SocialPostStatus } from '@/lib/types'
import { PostCard } from './post-card'

const statusConfig: Record<SocialPostStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-muted' },
  queued: { label: 'Queued', color: 'bg-blue-100 dark:bg-blue-950' },
  processing: { label: 'Processing', color: 'bg-yellow-100 dark:bg-yellow-950' },
  published: { label: 'Published', color: 'bg-green-100 dark:bg-green-950' },
  failed: { label: 'Failed', color: 'bg-red-100 dark:bg-red-950' },
}

interface KanbanColumnProps {
  status: SocialPostStatus
  posts: SocialMediaPostWithItem[]
  onQueue?: (id: string) => void
  onDelete?: (id: string) => void
  onRetry?: (id: string) => void
}

export function KanbanColumn({ status, posts, onQueue, onDelete, onRetry }: KanbanColumnProps) {
  const config = statusConfig[status]

  return (
    <div className="flex flex-col min-w-[280px] w-[280px]">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${config.color}`}>
        <h3 className="text-sm font-semibold">{config.label}</h3>
        <span className="text-xs text-muted-foreground">({posts.length})</span>
      </div>
      <div className="flex-1 space-y-2 p-2 bg-muted/30 rounded-b-lg min-h-[200px]">
        {posts.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No posts</p>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onQueue={onQueue ? () => onQueue(post.id) : undefined}
              onDelete={onDelete ? () => onDelete(post.id) : undefined}
              onRetry={onRetry ? () => onRetry(post.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  )
}
