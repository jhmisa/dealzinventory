import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import {
  listToFulfill,
  markBackorderOrdered,
  type ToFulfillRow,
} from '@/services/backorders'
import { StatusBadge, TableSkeleton, CodeDisplay, EmptyState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { formatPrice, getItemDescription } from '@/lib/utils'

// The three live fulfillment states (FULFILLED is excluded by the service).
const FULFILL_STATUSES = [
  { value: 'AWAITING_ORDER', label: 'Awaiting order', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'ORDERED', label: 'Ordered', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'READY', label: 'Ready', color: 'bg-green-100 text-green-800 border-green-300' },
] as const

type FulfillStatus = 'AWAITING_ORDER' | 'ORDERED' | 'READY'

const GROUPS: { status: FulfillStatus; title: string }[] = [
  { status: 'AWAITING_ORDER', title: 'To order' },
  { status: 'ORDERED', title: 'Ordered' },
  { status: 'READY', title: 'Ready to swap' },
]

// Build the spec line for a backorder line the same way the Items / Backorders
// list does, so a given model reads identically across the app.
function getLineDescription(line: ToFulfillRow['backorder_lines']): string {
  if (!line) return ''
  const pm = line.product_models
  return getItemDescription(
    line as unknown as Record<string, unknown>,
    pm as unknown as Record<string, unknown> | null,
    pm?.categories?.description_fields,
  )
}

function customerName(row: ToFulfillRow): string {
  const c = row.orders?.customers
  if (!c) return '—'
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
}

interface ProcurementGroup {
  backorderLineId: string
  count: number
  code: string
  spec: string
  supplierName: string | null
  supplierUrl: string | null
}

export function ToFulfill({ onSwap }: { onSwap?: (row: ToFulfillRow) => void }) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['backorder-to-fulfill'],
    queryFn: listToFulfill,
  })

  const rows = useMemo(() => (data ?? []) as ToFulfillRow[], [data])

  const grouped = useMemo(() => {
    const map: Record<FulfillStatus, ToFulfillRow[]> = {
      AWAITING_ORDER: [],
      ORDERED: [],
      READY: [],
    }
    for (const row of rows) {
      const status = row.backorder_status as FulfillStatus
      if (status in map) map[status].push(row)
    }
    return map
  }, [rows])

  // Aggregate AWAITING_ORDER rows by backorder line for the procurement summary.
  const procurement = useMemo<ProcurementGroup[]>(() => {
    const map = new Map<string, ProcurementGroup>()
    for (const row of grouped.AWAITING_ORDER) {
      const line = row.backorder_lines
      if (!line) continue
      const existing = map.get(line.id)
      if (existing) {
        existing.count += 1
      } else {
        map.set(line.id, {
          backorderLineId: line.id,
          count: 1,
          code: line.backorder_code,
          spec: getLineDescription(line),
          supplierName: line.suppliers?.supplier_name ?? null,
          supplierUrl: line.supplier_url ?? null,
        })
      }
    }
    return Array.from(map.values())
  }, [grouped.AWAITING_ORDER])

  const markOrdered = useMutation({
    mutationFn: (orderItemId: string) => markBackorderOrdered(orderItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backorder-to-fulfill'] })
      toast.success('Marked as ordered')
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to mark as ordered')
    },
  })

  if (isLoading) {
    return <TableSkeleton rows={6} columns={6} />
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing to fulfill"
        description="Open pre-orders awaiting procurement will appear here."
      />
    )
  }

  return (
    <div className="space-y-8">
      {/* Procurement summary — what to buy, aggregated by B-line. */}
      {procurement.length > 0 && (
        <div className="rounded-md border bg-muted/30 p-4 space-y-2">
          <h3 className="text-sm font-semibold">Procurement summary</h3>
          <ul className="space-y-1.5 text-sm">
            {procurement.map((p) => (
              <li key={p.backorderLineId} className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="font-semibold tabular-nums">order {p.count}×</span>
                <CodeDisplay code={p.code} />
                {p.spec && <span className="text-muted-foreground">— {p.spec}</span>}
                {p.supplierName && (
                  <span className="text-muted-foreground">from {p.supplierName}</span>
                )}
                {p.supplierUrl && (
                  <a
                    href={p.supplierUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    open
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {GROUPS.map((group) => {
        const groupRows = grouped[group.status]
        if (groupRows.length === 0) return null
        return (
          <section key={group.status} className="space-y-2">
            <h3 className="text-sm font-semibold">
              {group.title}{' '}
              <span className="text-muted-foreground font-normal">({groupRows.length})</span>
            </h3>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-3 py-2 font-medium">Order</th>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">B-code</th>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium text-center">Lead</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Unit Price</th>
                    <th className="px-3 py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((row) => {
                    const line = row.backorder_lines
                    const spec = getLineDescription(line)
                    return (
                      <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2 align-top">
                          <CodeDisplay code={row.orders?.order_code ?? '—'} />
                        </td>
                        <td className="px-3 py-2 align-top text-muted-foreground">
                          {customerName(row)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {line ? <CodeDisplay code={line.backorder_code} /> : '—'}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span className="text-muted-foreground">{spec || '—'}</span>
                        </td>
                        <td className="px-3 py-2 align-top text-center whitespace-nowrap text-muted-foreground">
                          {line ? `~${line.lead_time_days}d` : '—'}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <StatusBadge status={row.backorder_status ?? ''} config={FULFILL_STATUSES} />
                        </td>
                        <td className="px-3 py-2 align-top text-right tabular-nums">
                          {row.unit_price != null ? formatPrice(row.unit_price) : '—'}
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          {group.status === 'AWAITING_ORDER' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={markOrdered.isPending}
                              onClick={() => markOrdered.mutate(row.id)}
                            >
                              Mark ordered
                            </Button>
                          )}
                          {group.status === 'READY' && (
                            // Task 15 will wire the scan/verify swap dialog here.
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!onSwap}
                              title={onSwap ? 'Swap to P-code' : 'swap dialog (Task 15)'}
                              onClick={() => onSwap?.(row)}
                            >
                              Swap to P-code
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}
