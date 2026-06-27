import { useState } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BackorderList, AddBackorderDialog, ToFulfill, SwapDialog } from '@/components/backorders'
import type { ToFulfillRow } from '@/services/backorders'

const VIEW_TABS = [
  { value: 'lines', label: 'Lines' },
  { value: 'to-fulfill', label: 'To Fulfill' },
] as const

type ViewTab = (typeof VIEW_TABS)[number]['value']

export default function BackordersPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [view, setView] = useState<ViewTab>('lines')
  const [swapRow, setSwapRow] = useState<ToFulfillRow | null>(null)
  const [swapOpen, setSwapOpen] = useState(false)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Backorders"
        description="Manage pre-orders for out-of-stock items."
        actions={
          view === 'lines' ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Backorder
            </Button>
          ) : undefined
        }
      />

      {/* View Tabs — mirrors the Items page tab pattern */}
      <div className="border-b">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {VIEW_TABS.map((tab) => {
            const isActive = view === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setView(tab.value)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {view === 'lines' ? (
        <BackorderList />
      ) : (
        <ToFulfill
          onSwap={(row) => {
            setSwapRow(row)
            setSwapOpen(true)
          }}
        />
      )}

      <AddBackorderDialog open={addOpen} onOpenChange={setAddOpen} />
      <SwapDialog row={swapRow} open={swapOpen} onOpenChange={setSwapOpen} />
    </div>
  )
}
