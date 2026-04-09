import { toast } from 'sonner'
import { PageHeader, TableSkeleton } from '@/components/shared'
import { Checkbox } from '@/components/ui/checkbox'
import { useItemListColumnSettings, useUpdateItemListColumnSettings } from '@/hooks/use-settings'

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'INTAKE', label: 'Intake' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'REPAIR', label: 'Repair' },
  { value: 'MISSING', label: 'Missing' },
  { value: 'SOLD', label: 'Sold' },
] as const

const COLUMN_OPTIONS = [
  { id: 'model', label: 'Model' },
  { id: 'condition_grade', label: 'Grade' },
  { id: 'item_status', label: 'Status' },
  { id: 'supplier', label: 'Supplier' },
  { id: 'purchase_price', label: 'Buy Price' },
  { id: 'selling_price', label: 'Sell Price' },
  { id: 'discount', label: 'Discount' },
  { id: 'sold_to', label: 'Sold To' },
  { id: 'created_at', label: 'Intake Date' },
] as const

export default function ItemsColumnSettingsPage() {
  const { data: settings, isLoading } = useItemListColumnSettings()
  const updateMutation = useUpdateItemListColumnSettings()

  const getVisibleColumns = (statusTab: string): string[] => {
    const setting = settings?.find((s) => s.status_tab === statusTab)
    return setting?.visible_columns ?? []
  }

  const handleToggle = (statusTab: string, columnId: string, checked: boolean) => {
    const current = getVisibleColumns(statusTab)
    const updated = checked
      ? [...current, columnId]
      : current.filter((c) => c !== columnId)

    updateMutation.mutate(
      { statusTab, visibleColumns: updated },
      {
        onError: (err) => {
          toast.error(`Failed to update: ${err.message}`)
        },
      }
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Items List Columns"
        description="Configure which columns are visible for each status tab on the Items page."
      />

      {isLoading ? (
        <TableSkeleton rows={8} columns={8} />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Column</th>
                {STATUS_TABS.map((tab) => (
                  <th key={tab.value} className="px-4 py-3 font-medium text-muted-foreground text-center">
                    {tab.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COLUMN_OPTIONS.map((col) => (
                <tr key={col.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{col.label}</td>
                  {STATUS_TABS.map((tab) => {
                    const visible = getVisibleColumns(tab.value)
                    const isChecked = visible.includes(col.id)
                    return (
                      <td key={tab.value} className="px-4 py-3 text-center">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) =>
                            handleToggle(tab.value, col.id, checked === true)
                          }
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        P-Code is always visible and cannot be toggled. Changes are saved automatically.
      </p>
    </div>
  )
}
