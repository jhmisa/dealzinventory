import { ArrowLeft, ArrowRight, Pencil, Trash2, MonitorSmartphone, Smartphone, Monitor, Video } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { ShootStatus } from '@/lib/types'
import type { ShootWithAssignee } from '@/services/shoots'

interface ShootCardProps {
  shoot: ShootWithAssignee
  onEdit: (shoot: ShootWithAssignee) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: ShootStatus) => void
}

// Adjacent lanes a card can move to via the on-card buttons.
const statusTransitions: Record<ShootStatus, { next?: ShootStatus; prev?: ShootStatus }> = {
  PLANNED: { next: 'ASSIGNED' },
  ASSIGNED: { next: 'SHOOTING', prev: 'PLANNED' },
  SHOOTING: { next: 'PUBLISHED', prev: 'ASSIGNED' },
  PUBLISHED: { prev: 'SHOOTING' },
}

// Show the first few item codes as chips; collapse the rest into a "+N" pill.
const MAX_VISIBLE_CODES = 4

export function ShootCard({ shoot, onEdit, onDelete, onStatusChange }: ShootCardProps) {
  const navigate = useNavigate()
  const { next, prev } = statusTransitions[shoot.status]
  const codes = shoot.item_codes ?? []
  const visibleCodes = codes.slice(0, MAX_VISIBLE_CODES)
  const overflow = codes.length - visibleCodes.length

  return (
    <Card
      className="cursor-grab transition-shadow hover:shadow-md active:cursor-grabbing"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', shoot.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-2 text-sm font-medium leading-tight">{shoot.title}</h4>
          {shoot.orientation && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              {shoot.orientation === 'portrait' ? (
                <Smartphone className="mr-1 h-3 w-3" />
              ) : (
                <Monitor className="mr-1 h-3 w-3" />
              )}
              {shoot.orientation}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MonitorSmartphone className="h-3 w-3 shrink-0" />
          <span className="truncate">{shoot.assignee?.display_name ?? 'Unassigned'}</span>
        </div>

        {codes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visibleCodes.map((code) => (
              <Badge key={code} variant="outline" className="font-mono text-[10px]">
                {code}
              </Badge>
            ))}
            {overflow > 0 && (
              <Badge variant="outline" className="text-[10px]">
                +{overflow}
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-center gap-1 pt-1">
          {prev && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => onStatusChange(shoot.id, prev)}
            >
              <ArrowLeft className="mr-1 h-3 w-3" />
              {prev}
            </Button>
          )}
          {next && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => onStatusChange(shoot.id, next)}
            >
              {next}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              aria-label="Record video"
              title="Record a live-selling video"
              onClick={() => navigate(`/admin/video-editor?shoot=${shoot.id}&mode=record`)}
            >
              <Video className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              aria-label="Edit shoot"
              onClick={() => onEdit(shoot)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-destructive hover:text-destructive"
              aria-label="Delete shoot"
              onClick={() => onDelete(shoot.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
