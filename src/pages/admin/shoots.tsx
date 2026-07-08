import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader, ConfirmDialog } from '@/components/shared'
import { ShootKanban, ShootFormDialog } from '@/components/shoots'
import { useShoots, useUpdateShootStatus, useDeleteShoot } from '@/hooks/use-shoots'
import type { ShootStatus } from '@/lib/types'
import type { ShootWithAssignee } from '@/services/shoots'

export default function ShootsPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [editingShoot, setEditingShoot] = useState<ShootWithAssignee | undefined>(undefined)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: shoots = [], isLoading } = useShoots()
  const statusMutation = useUpdateShootStatus()
  const deleteMutation = useDeleteShoot()

  function handleNew() {
    setEditingShoot(undefined)
    setFormOpen(true)
  }

  function handleEdit(shoot: ShootWithAssignee) {
    setEditingShoot(shoot)
    setFormOpen(true)
  }

  function handleStatusChange(id: string, status: ShootStatus) {
    statusMutation.mutate(
      { id, status },
      {
        onSuccess: () => toast.success(`Moved to ${status}`),
        onError: (err) => toast.error(`Failed to update: ${err.message}`),
      },
    )
  }

  function handleDelete() {
    if (!deleteId) return
    deleteMutation.mutate(deleteId, {
      onSuccess: () => {
        toast.success('Shoot deleted')
        setDeleteId(null)
      },
      onError: (err) => toast.error(`Failed to delete: ${err.message}`),
    })
  }

  return (
    <div className="flex h-full flex-col space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Shoots" description="Plan live-selling & product video shoots." />
        <div className="flex items-center gap-2">
          {/* Reserved slot for a future "Plan with AI" action (owned by another workstream). */}
          <Button onClick={handleNew}>
            <Plus className="mr-2 h-4 w-4" />
            New Shoot
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading shoots...</div>
      ) : (
        <ShootKanban
          shoots={shoots}
          onSelect={handleEdit}
          onStatusChange={handleStatusChange}
          onDelete={setDeleteId}
        />
      )}

      <ShootFormDialog open={formOpen} onOpenChange={setFormOpen} shoot={editingShoot} />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete Shoot"
        description="Are you sure you want to delete this shoot? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
