import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Trash2, CalendarPlus, Film, Search, User } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, ConfirmDialog } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPrice } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getRecordedVideos,
  requeueRecordedVideo,
  deleteRecordedVideo,
  type RecordedVideo,
} from '@/services/recorded-videos'
import type { SocialPostStatus } from '@/lib/types'

const QK = ['recorded-videos']

const STATUS_STYLE: Record<SocialPostStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  queued: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  processing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  scheduled: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  published: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}

type SortKey = 'newest' | 'oldest' | 'shooter' | 'item' | 'status'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function VideoCard({
  video,
  onRequeue,
  onDelete,
  busy,
}: {
  video: RecordedVideo
  onRequeue: (v: RecordedVideo) => void
  onDelete: (v: RecordedVideo) => void
  busy: boolean
}) {
  const [duration, setDuration] = useState<number | null>(null)
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative flex h-64 items-center justify-center bg-black">
        {video.url ? (
          <video
            src={video.url}
            controls
            preload="metadata"
            playsInline
            className="h-full w-full object-contain"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          />
        ) : (
          <Film className="h-10 w-10 text-muted-foreground" />
        )}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[video.status]}`}
        >
          {video.status}
        </span>
        {duration != null && fmtDuration(duration) && (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
            {fmtDuration(duration)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-medium">{video.item_code ?? 'Untagged'}</span>
          <span className="text-xs text-muted-foreground">{fmtDate(video.created_at)}</span>
        </div>

        {(video.product_title || video.product_description || video.product_price != null) && (
          <div className="rounded-md bg-muted/50 px-2 py-1.5">
            {video.product_title && (
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{video.product_title}</span>
                {video.product_price != null && (
                  <span className="shrink-0 text-sm font-semibold">{formatPrice(video.product_price)}</span>
                )}
              </div>
            )}
            {video.product_description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{video.product_description}</p>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          {video.shooter_name ?? 'Unknown'}
        </div>
        {video.caption && <p className="line-clamp-2 text-xs text-muted-foreground">{video.caption}</p>}

        <div className="mt-auto flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" disabled={busy} onClick={() => onRequeue(video)}>
            <CalendarPlus className="h-3.5 w-3.5" />
            Re-queue
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => onDelete(video)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function RecordedVideosPage() {
  const queryClient = useQueryClient()
  const { data: videos = [], isLoading } = useQuery({ queryKey: QK, queryFn: getRecordedVideos })

  const [search, setSearch] = useState('')
  const [shooter, setShooter] = useState('all')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState<SortKey>('newest')
  const [deleteTarget, setDeleteTarget] = useState<RecordedVideo | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const requeueMutation = useMutation({
    mutationFn: (id: string) => requeueRecordedVideo(id),
    onSuccess: () => {
      toast.success('Re-queued for posting — publish it from Social Media → Process Queue.')
      queryClient.invalidateQueries({ queryKey: QK })
      queryClient.invalidateQueries({ queryKey: ['social-media-posts'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to re-queue'),
    onSettled: () => setBusyId(null),
  })

  const deleteMutation = useMutation({
    mutationFn: (v: RecordedVideo) => deleteRecordedVideo(v.id, v.url),
    onSuccess: () => {
      toast.success('Recorded video deleted.')
      queryClient.invalidateQueries({ queryKey: QK })
      queryClient.invalidateQueries({ queryKey: ['social-media-posts'] })
      setDeleteTarget(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete'),
    onSettled: () => setBusyId(null),
  })

  const shooters = useMemo(() => {
    const map = new Map<string, string>()
    for (const v of videos) if (v.shooter_id && v.shooter_name) map.set(v.shooter_id, v.shooter_name)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [videos])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = videos.filter((v) => {
      if (shooter !== 'all' && v.shooter_id !== shooter) return false
      if (status !== 'all' && v.status !== status) return false
      if (q) {
        const hay = `${v.item_code ?? ''} ${v.caption ?? ''} ${v.shooter_name ?? ''} ${v.product_title ?? ''} ${v.product_description ?? ''} ${v.product_price ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return a.created_at.localeCompare(b.created_at)
        case 'shooter':
          return (a.shooter_name ?? '').localeCompare(b.shooter_name ?? '')
        case 'item':
          return (a.item_code ?? '').localeCompare(b.item_code ?? '')
        case 'status':
          return a.status.localeCompare(b.status)
        case 'newest':
        default:
          return b.created_at.localeCompare(a.created_at)
      }
    })
    return list
  }, [videos, search, shooter, status, sort])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recorded Videos"
        description="Browse shot videos — search by who shot them, re-queue for posting, or delete."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product, item, shooter, or caption…"
            className="h-9 pl-9"
          />
        </div>
        <Select value={shooter} onValueChange={setShooter}>
          <SelectTrigger className="h-9 w-[170px] text-sm">
            <SelectValue placeholder="Shooter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All shooters</SelectItem>
            {shooters.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[150px] text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-9 w-[150px] text-sm">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="shooter">Shooter</SelectItem>
            <SelectItem value="item">Item code</SelectItem>
            <SelectItem value="status">Status</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Film className="h-10 w-10" />
          <p className="text-sm">
            {videos.length === 0 ? 'No recorded videos yet. Record one from the Video Editor.' : 'No videos match your filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              busy={busyId === v.id}
              onRequeue={(video) => {
                setBusyId(video.id)
                requeueMutation.mutate(video.id)
              }}
              onDelete={(video) => setDeleteTarget(video)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete recorded video"
        description="This permanently removes the video file and its post. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            setBusyId(deleteTarget.id)
            deleteMutation.mutate(deleteTarget)
          }
        }}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
