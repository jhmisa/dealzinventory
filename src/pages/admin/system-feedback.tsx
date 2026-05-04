import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared'
import { KanbanBoard, CreateFeedbackDialog, FeedbackDetailDialog } from '@/components/system-feedback'
import { useSystemFeedback, useCreateSystemFeedback, useUpdateSystemFeedback, useDeleteSystemFeedback } from '@/hooks/use-system-feedback'
import type { SystemFeedback, SystemFeedbackStatus } from '@/services/system-feedback'
import type { CreateSystemFeedbackFormValues } from '@/validators/system-feedback'

export default function SystemFeedbackPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedFeedback, setSelectedFeedback] = useState<SystemFeedback | null>(null)

  const { data: feedbackItems = [], isLoading } = useSystemFeedback()
  const createMutation = useCreateSystemFeedback()
  const updateMutation = useUpdateSystemFeedback()
  const deleteMutation = useDeleteSystemFeedback()

  const handleCreate = (values: CreateSystemFeedbackFormValues) => {
    createMutation.mutate(values, {
      onSuccess: () => {
        toast.success('Feedback created')
        setCreateOpen(false)
      },
      onError: (err) => toast.error(`Failed to create: ${err.message}`),
    })
  }

  const handleStatusChange = (id: string, status: SystemFeedbackStatus) => {
    updateMutation.mutate({ id, status }, {
      onSuccess: () => toast.success(`Moved to ${status.replace('_', ' ')}`),
      onError: (err) => toast.error(`Failed to update: ${err.message}`),
    })
  }

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success('Feedback deleted')
        setSelectedFeedback(null)
      },
      onError: (err) => toast.error(`Failed to delete: ${err.message}`),
    })
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <PageHeader title="System Feedback">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />New Feedback
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <KanbanBoard
          feedbackItems={feedbackItems}
          onSelect={setSelectedFeedback}
          onStatusChange={handleStatusChange}
        />
      )}

      <CreateFeedbackDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isLoading={createMutation.isPending}
      />

      <FeedbackDetailDialog
        feedback={selectedFeedback}
        open={!!selectedFeedback}
        onOpenChange={(open) => { if (!open) setSelectedFeedback(null) }}
        onStatusChange={(id, status) => {
          handleStatusChange(id, status)
          setSelectedFeedback((prev) => prev ? { ...prev, status } : null)
        }}
        onDelete={handleDelete}
      />
    </div>
  )
}
