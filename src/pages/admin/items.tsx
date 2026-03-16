import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader, SearchBar, DataTable, StatusBadge, GradeBadge, CodeDisplay, PriceDisplay, TableSkeleton } from '@/components/shared'
import { useItems } from '@/hooks/use-items'
import { useDebounce } from '@/hooks/use-debounce'
import { ITEM_STATUSES, CONDITION_GRADES, SOURCE_TYPES } from '@/lib/constants'
import { formatDate } from '@/lib/utils'

type ItemRow = {
  id: string
  item_code: string
  item_status: string
  condition_grade: string | null
  source_type: string
  purchase_price: number | null
  created_at: string
  brand: string | null
  model_name: string | null
  cpu: string | null
  ram_gb: number | null
  storage_gb: number | null
  suppliers: { supplier_name: string } | null
  product_models: { brand: string; model_name: string; color: string; short_description: string | null } | null
}

const columns: ColumnDef<ItemRow>[] = [
  {
    accessorKey: 'item_code',
    header: 'P-Code',
    cell: ({ row }) => <CodeDisplay code={row.original.item_code} />,
  },
  {
    id: 'model',
    header: 'Model',
    cell: ({ row }) => {
      const pm = row.original.product_models
      if (pm?.short_description) return pm.short_description
      const { brand, model_name } = row.original
      if (brand && model_name) return `${brand} ${model_name}`
      return pm ? `${pm.brand} ${pm.model_name}` : '—'
    },
  },
  {
    id: 'config',
    header: 'Config',
    cell: ({ row }) => {
      const { cpu, ram_gb, storage_gb } = row.original
      if (!cpu && !ram_gb && !storage_gb) return '—'
      return [cpu, ram_gb ? `${ram_gb}GB` : null, storage_gb ? `${storage_gb}GB` : null].filter(Boolean).join(' / ')
    },
  },
  {
    accessorKey: 'condition_grade',
    header: 'Grade',
    cell: ({ row }) => <GradeBadge grade={row.original.condition_grade as never} />,
  },
  {
    accessorKey: 'item_status',
    header: 'Status',
    cell: ({ row }) => {
      const config = ITEM_STATUSES.find((s) => s.value === row.original.item_status)
      return config ? <StatusBadge label={config.label} color={config.color} /> : row.original.item_status
    },
  },
  {
    id: 'supplier',
    header: 'Supplier',
    cell: ({ row }) => row.original.suppliers?.supplier_name ?? '—',
  },
  {
    accessorKey: 'purchase_price',
    header: 'Price',
    cell: ({ row }) => <PriceDisplay amount={row.original.purchase_price} />,
  },
  {
    accessorKey: 'created_at',
    header: 'Intake Date',
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export default function ItemListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 400)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [gradeFilter, setGradeFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')

  const { data: items, isLoading } = useItems({
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    grade: gradeFilter || undefined,
    source: sourceFilter || undefined,
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Items"
        description="All physical inventory items (P-codes)."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/admin/items/scan')}>
              <QrCode className="h-4 w-4 mr-2" />
              Scan QR
            </Button>
            <Button onClick={() => navigate('/admin/items/intake')}>
              <Plus className="h-4 w-4 mr-2" />
              Bulk Intake
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search P-code..."
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ITEM_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Grade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Grades</SelectItem>
            {CONDITION_GRADES.map((g) => (
              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {SOURCE_TYPES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} columns={7} />
      ) : (
        <DataTable
          columns={columns}
          data={(items ?? []) as ItemRow[]}
          onRowClick={(row) => navigate(`/admin/items/${row.id}`)}
        />
      )}
    </div>
  )
}
