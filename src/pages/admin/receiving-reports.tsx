import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader, DataTable, CodeDisplay, PriceDisplay } from '@/components/shared'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useIntakeReceipts } from '@/hooks/use-intake-receipts'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { useSuppliers } from '@/hooks/use-suppliers'
import { formatDate, formatPrice } from '@/lib/utils'
import type { IntakeReceipt } from '@/lib/types'

type ReceiptRow = IntakeReceipt & {
  suppliers: { supplier_name: string } | null
}

const columns: ColumnDef<ReceiptRow>[] = [
  {
    accessorKey: 'receipt_code',
    header: 'Receipt',
    cell: ({ row }) => <CodeDisplay code={row.original.receipt_code} />,
  },
  {
    accessorKey: 'suppliers',
    header: 'Supplier',
    cell: ({ row }) => row.original.suppliers?.supplier_name ?? '—',
  },
  {
    accessorKey: 'date_received',
    header: 'Date Received',
    cell: ({ row }) => formatDate(row.original.date_received),
  },
  {
    accessorKey: 'source_type',
    header: 'Source',
  },
  {
    accessorKey: 'total_items',
    header: 'Items',
  },
  {
    accessorKey: 'total_cost',
    header: 'Total Cost',
    cell: ({ row }) => formatPrice(row.original.total_cost),
  },
  {
    id: 'p_code_range',
    header: 'P-Code Range',
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.p_code_range_start} → {row.original.p_code_range_end}
      </span>
    ),
  },
]

export default function ReceivingReportsPage() {
  const navigate = useNavigate()
  const { getParam, setParam } = usePersistedFilters('receiving-reports-filters')
  const supplierId = getParam('supplier')
  const dateFrom = getParam('dateFrom')
  const dateTo = getParam('dateTo')
  const setSupplierId = (v: string) => setParam('supplier', v)
  const setDateFrom = (v: string) => setParam('dateFrom', v)
  const setDateTo = (v: string) => setParam('dateTo', v)

  const { data: suppliers } = useSuppliers()
  const { data: receipts, isLoading } = useIntakeReceipts({
    supplierId: supplierId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receiving Reports"
        description="All intake receipts with supplier and date filters."
      />

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-xs">Supplier</Label>
          <Select value={supplierId} onValueChange={(v) => setSupplierId(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-48 mt-1">
              <SelectValue placeholder="All suppliers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {(suppliers ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40 mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40 mt-1"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={(receipts ?? []) as ReceiptRow[]}
        isLoading={isLoading}
        onRowClick={(row) => navigate(`/admin/receiving-reports/${row.id}`)}
      />
    </div>
  )
}
