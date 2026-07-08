import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listBackorderLines, type BackorderLineListItem } from '@/services/backorders'
import { GradeBadge, StatusBadge, TableSkeleton, CodeDisplay, EmptyState } from '@/components/shared'
import { cn, formatPrice, getItemDescription, withBackorderIdentifier } from '@/lib/utils'
import type { ConditionGrade } from '@/lib/types'

// Status tabs mirror the Items page pattern: an "all" pseudo-tab plus the three
// real backorder_line_status enum values (ACTIVE | PAUSED | CLOSED).
const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'CLOSED', label: 'Closed' },
] as const

// Tinted status chips for the status column. Same shape StatusBadge expects.
const BACKORDER_STATUSES = [
  { value: 'ACTIVE', label: 'Active', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'PAUSED', label: 'Paused', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'CLOSED', label: 'Closed', color: 'bg-gray-100 text-gray-700 border-gray-300' },
] as const

// Build the spec line exactly the way the Items page does, so a given model
// reads identically across Admin Items and the Backorders list. The backorder
// line carries the same flat spec columns (cpu/ram_gb/storage_gb/screen_size)
// plus its joined product_models + category description_fields.
function getBackorderDescription(line: BackorderLineListItem): string {
  const pm = line.product_models
  const base = getItemDescription(
    line as unknown as Record<string, unknown>,
    pm as unknown as Record<string, unknown> | null,
    pm?.categories?.description_fields,
  )
  // Staff surface → show the model identifier `A3295 (MYWJ3J/A)` after the model name.
  return withBackorderIdentifier(base, pm?.model_number, pm?.part_number)
}

// Lead time as a working-day range: "4–7d" (min..max), collapsing an equal/absent bound.
function formatLeadRange(min: number | null | undefined, max: number | null | undefined): string {
  const lo = typeof min === 'number' && min > 0 ? min : null
  const hi = typeof max === 'number' && max > 0 ? max : null
  if (lo && hi) return lo === hi ? `${hi}d` : `${lo}–${hi}d`
  if (hi) return `${hi}d`
  if (lo) return `${lo}d`
  return '—'
}

export function BackorderList() {
  const [statusTab, setStatusTab] = useState<string>('all')

  const filters = { status: statusTab !== 'all' ? statusTab : undefined }

  const { data, isLoading } = useQuery({
    queryKey: ['backorder-lines', filters],
    queryFn: () => listBackorderLines(filters),
  })

  const lines = (data ?? []) as BackorderLineListItem[]

  return (
    <div className="space-y-4">
      {/* Status Tabs — mirrors the Items page tab pattern */}
      <div className="border-b">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const isActive = statusTab === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusTab(tab.value)}
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

      {isLoading ? (
        <TableSkeleton rows={8} columns={8} />
      ) : lines.length === 0 ? (
        <EmptyState
          title="No backorder lines yet"
          description="Backorder lines let you pre-sell items that are currently out of stock."
        />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-3 py-2 font-medium">B-code</th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Grade</th>
                <th className="px-3 py-2 font-medium">Supplier</th>
                <th className="px-3 py-2 font-medium text-right">Supplier Price</th>
                <th className="px-3 py-2 font-medium text-right">Sell Price</th>
                <th className="px-3 py-2 font-medium text-center">Avail / Res / Recv</th>
                <th className="px-3 py-2 font-medium text-center">Lead</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const desc = getBackorderDescription(line)
                return (
                  <tr key={line.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 align-top">
                      <CodeDisplay code={line.backorder_code} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="text-muted-foreground">{desc || '—'}</span>
                      {line.included_accessories?.trim() && (
                        <span className="block text-xs text-muted-foreground/80">
                          Included: {line.included_accessories.trim()}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <GradeBadge grade={line.condition_grade as ConditionGrade} />
                    </td>
                    <td className="px-3 py-2 align-top text-muted-foreground">
                      {line.suppliers?.supplier_name ?? '—'}
                    </td>
                    <td className="px-3 py-2 align-top text-right tabular-nums">
                      {line.supplier_price != null ? formatPrice(line.supplier_price) : '—'}
                    </td>
                    <td className="px-3 py-2 align-top text-right tabular-nums">
                      {line.selling_price != null ? formatPrice(line.selling_price) : '—'}
                    </td>
                    <td className="px-3 py-2 align-top text-center whitespace-nowrap tabular-nums">
                      <span className="font-semibold">{line.available ?? 0}</span>
                      <span className="text-muted-foreground">
                        {' '}(res {line.quantity_reserved} · recv {line.quantity_received})
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-center whitespace-nowrap text-muted-foreground">
                      {formatLeadRange(line.lead_time_min_days, line.lead_time_days)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <StatusBadge status={line.status} config={BACKORDER_STATUSES} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
