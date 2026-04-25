import { Clock, ExternalLink, Facebook, AlertCircle, Trash2, Play, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SocialMediaPostWithItem, SocialPostStatus } from '@/lib/types'

interface PostCardProps {
  post: SocialMediaPostWithItem
  onQueue?: () => void
  onDelete?: () => void
  onRetry?: () => void
}

const statusActions: Record<SocialPostStatus, string[]> = {
  draft: ['queue', 'delete'],
  queued: ['delete'],
  processing: [],
  published: [],
  failed: ['retry', 'delete'],
}

export function PostCard({ post, onQueue, onDelete, onRetry }: PostCardProps) {
  const item = post.items
  const modelName = item?.product_models
    ? `${item.product_models.brand} ${item.product_models.model_name}`
    : null
  const actions = statusActions[post.status]
  const mediaUrls = post.media_urls ?? []
  const firstMedia = mediaUrls[0]

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3 space-y-2">
        <div className="flex gap-3">
          {firstMedia && (
            <div className="w-14 h-14 rounded-md overflow-hidden shrink-0 bg-muted">
              <img src={firstMedia} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-medium truncate">
              {post.item_code ?? 'No item'}
            </p>
            {modelName && (
              <p className="text-xs text-muted-foreground truncate">{modelName}</p>
            )}
            {item?.condition_grade && (
              <Badge variant="outline" className="text-[10px] mt-1">
                Grade {item.condition_grade}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Facebook className="h-3 w-3" />
          <span className="capitalize">{post.platform}</span>
          <span className="mx-1">·</span>
          <Clock className="h-3 w-3" />
          <span>
            {post.schedule_type === 'now'
              ? 'Immediate'
              : post.schedule_type === 'next_slot'
                ? 'Next slot'
                : new Date(post.scheduled_at!).toLocaleDateString()}
          </span>
          <span className="mx-1">·</span>
          <span>{mediaUrls.length} media</span>
        </div>

        {post.caption && (
          <p className="text-xs text-muted-foreground line-clamp-2">{post.caption}</p>
        )}

        {post.error_message && (
          <div className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2">{post.error_message}</span>
          </div>
        )}

        {post.blotato_post_url && (
          <a
            href={post.blotato_post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            View post
          </a>
        )}

        {actions.length > 0 && (
          <div className="flex gap-1.5 pt-1">
            {actions.includes('queue') && (
              <Button size="sm" variant="default" className="h-7 text-xs" onClick={onQueue}>
                <ArrowRight className="h-3 w-3 mr-1" />
                Queue
              </Button>
            )}
            {actions.includes('retry') && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>
                <Play className="h-3 w-3 mr-1" />
                Retry
              </Button>
            )}
            {actions.includes('delete') && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={onDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
