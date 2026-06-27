import { useState } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { BackorderList, AddBackorderDialog } from '@/components/backorders'

export default function BackordersPage() {
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Backorders"
        description="Manage pre-orders for out-of-stock items."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Backorder
          </Button>
        }
      />
      <BackorderList />
      <AddBackorderDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
