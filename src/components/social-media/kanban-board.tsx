import { useMemo } from 'react'
import type { SocialMediaPostWithItem, SocialPostStatus } from '@/lib/types'
import { KanbanColumn } from './kanban-column'

const COLUMNS: SocialPostStatus[] = ['draft', 'queued', 'published', 'failed']

interface KanbanBoardProps {
  posts: SocialMediaPostWithItem[]
  onQueue: (id: string) => void
  onDelete: (id: string) => void
  onRetry: (id: string) => void
}

export function KanbanBoard({ posts, onQueue, onDelete, onRetry }: KanbanBoardProps) {
  const grouped = useMemo(() => {
    const map: Record<SocialPostStatus, SocialMediaPostWithItem[]> = {
      draft: [],
      queued: [],
      processing: [],
      published: [],
      failed: [],
    }
    for (const post of posts) {
      map[post.status].push(post)
    }
    // Merge processing into queued for display
    map.queued.push(...map.processing)
    return map
  }, [posts])

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          posts={grouped[status]}
          onQueue={status === 'draft' ? onQueue : undefined}
          onDelete={['draft', 'queued', 'failed'].includes(status) ? onDelete : undefined}
          onRetry={status === 'failed' ? onRetry : undefined}
        />
      ))}
    </div>
  )
}
