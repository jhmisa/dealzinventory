import { useState } from 'react'
import { ShootCard } from './shoot-card'
import type { ShootStatus } from '@/lib/types'
import type { ShootWithAssignee } from '@/services/shoots'

interface ShootKanbanProps {
  shoots: ShootWithAssignee[]
  onSelect: (shoot: ShootWithAssignee) => void
  onStatusChange: (id: string, status: ShootStatus) => void
  onDelete: (id: string) => void
}

const columns: { status: ShootStatus; label: string; color: string }[] = [
  { status: 'PLANNED', label: 'Planned', color: 'bg-slate-400' },
  { status: 'ASSIGNED', label: 'Assigned', color: 'bg-blue-500' },
  { status: 'SHOOTING', label: 'Shooting', color: 'bg-yellow-500' },
  { status: 'PUBLISHED', label: 'Published', color: 'bg-green-500' },
]

export function ShootKanban({ shoots, onSelect, onStatusChange, onDelete }: ShootKanbanProps) {
  // Lane currently hovered during a drag, for a subtle drop-target highlight.
  const [dragOverStatus, setDragOverStatus] = useState<ShootStatus | null>(null)

  return (
    <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {columns.map((col) => {
        const items = shoots.filter((s) => s.status === col.status)
        return (
          <div
            key={col.status}
            className="flex min-h-0 flex-col"
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (dragOverStatus !== col.status) setDragOverStatus(col.status)
            }}
            onDragLeave={(e) => {
              // Only clear when leaving the lane itself, not when moving between its children.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStatus(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/plain')
              setDragOverStatus(null)
              if (id) onStatusChange(id, col.status)
            }}
          >
            <div className="mb-3 flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
              <h3 className="text-sm font-medium">{col.label}</h3>
              <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
            </div>
            <div
              className={`min-h-[200px] flex-1 space-y-2 overflow-y-auto rounded-lg p-2 transition-colors ${
                dragOverStatus === col.status ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-muted/30'
              }`}
            >
              {items.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">No shoots</p>
              ) : (
                items.map((shoot) => (
                  <ShootCard
                    key={shoot.id}
                    shoot={shoot}
                    onEdit={onSelect}
                    onDelete={onDelete}
                    onStatusChange={onStatusChange}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
