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
import { Input } from '@/components/ui/input'
import { PageHeader, SearchBar, DataTable, StatusBadge, GradeBadge, CodeDisplay, PriceDisplay, TableSkeleton } from '@/components/shared'
import { useItems } from '@/hooks/use-items'
import { useDebounce } from '@/hooks/use-debounce'
import { ITEM_STATUSES, CONDITION_GRADES } from '@/lib/constants'
import { formatDate, cn, buildShortDescription } from '@/lib/utils'

type ItemRow = {
  id: string
  item_code: string
  item_status: string
  condition_grade: string | null
  condition_notes: string | null
  source_type: string
  purchase_price: number | null
  selling_price: number | null
  created_at: string
  brand: string | null
  model_name: string | null
  cpu: string | null
  ram_gb: number | null
  storage_gb: number | null
  screen_size: number | null
  suppliers: { supplier_name: string } | null
  product_models: { brand: string; model_name: string; color: string; short_description: string | null; screen_size: number | null; categories: { name: string; description_fields: string[] } | null } | null
}

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  ...ITEM_STATUSES.map((s) => ({ value: s.value, label: s.label })),
]

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
      const { condition_notes } = row.original
      const descFields = pm?.categories?.description_fields
      let modelLine: string
      if (descFields && descFields.length > 0) {
        // Use category template with item-level values
        modelLine = buildShortDescription(row.original, descFields) || '—'
      } else {
        // Fallback: no category template
        const { brand, model_name, cpu, ram_gb, storage_gb, screen_size } = row.original
        const modelName = brand && model_name
          ? `${brand} ${model_name}`
          : pm ? `${pm.brand} ${pm.model_name}` : null
        const screenVal = screen_size ?? pm?.screen_size
        const parts = [
          modelName,
          cpu,
          ram_gb ? `${ram_gb}GB` : null,
          storage_gb ? `${storage_gb}GB` : null,
          screenVal ? `${screenVal}"` : null,
        ].filter(Boolean)
        modelLine = parts.length > 0 ? parts.join(' / ') : '—'
      }
      if (!condition_notes) return modelLine
      return (
        <div>
          <div>{modelLine}</div>
          <div className="text-xs text-muted-foreground">{condition_notes}</div>
        </div>
      )
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
    header: 'Buy / Sell',
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5 text-sm">
        <PriceDisplay amount={row.original.purchase_price} />
        <span className="text-muted-foreground">/</span>
        <PriceDisplay amount={row.original.selling_price} />
      </div>
    ),
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
  const [statusTab, setStatusTab] = useState('all')
  const [gradeFilter, setGradeFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [brandFilter, setBrandFilter] = useState<string>('')
  const [descriptionSearch, setDescriptionSearch] = useState('')
  const debouncedDescSearch = useDebounce(descriptionSearch, 400)
  const [conditionSearch, setConditionSearch] = useState('')
  const debouncedConditionSearch = useDebounce(conditionSearch, 400)
  const [priceFrom, setPriceFrom] = useState<string>('')
  const [priceTo, setPriceTo] = useState<string>('')

  // Fetch all items (no status filter) so we can compute tab counts
  const { data: allItems, isLoading } = useItems({
    search: debouncedSearch || undefined,
    grade: gradeFilter && gradeFilter !== 'all' ? gradeFilter : undefined,
  })

  const items = (allItems ?? []) as ItemRow[]

  // Derive dropdown options from data
  const categoryOptions = [...new Set(items.map(i => i.product_models?.categories?.name).filter(Boolean))].sort() as string[]
  const brandOptions = [...new Set(items.map(i => i.brand ?? i.product_models?.brand).filter(Boolean))].sort() as string[]

  // Client-side filtering
  const filtered = items.filter(item => {
    if (categoryFilter && categoryFilter !== 'all' && item.product_models?.categories?.name !== categoryFilter) return false
    if (brandFilter && brandFilter !== 'all' && (item.brand ?? item.product_models?.brand) !== brandFilter) return false
    if (debouncedDescSearch) {
      const desc = buildShortDescription(item, item.product_models?.categories?.description_fields ?? []) || ''
      if (!desc.toLowerCase().includes(debouncedDescSearch.toLowerCase())) return false
    }
    if (debouncedConditionSearch) {
      if (!item.condition_notes?.toLowerCase().includes(debouncedConditionSearch.toLowerCase())) return false
    }
    const pf = priceFrom ? Number(priceFrom) : null
    const pt = priceTo ? Number(priceTo) : null
    if (pf !== null && (item.selling_price == null || item.selling_price < pf)) return false
    if (pt !== null && (item.selling_price == null || item.selling_price > pt)) return false
    return true
  })

  // Compute counts per status from filtered items
  const statusCounts: Record<string, number> = { all: filtered.length }
  for (const item of filtered) {
    statusCounts[item.item_status] = (statusCounts[item.item_status] ?? 0) + 1
  }

  // Filter by active tab
  const filteredItems = statusTab === 'all'
    ? filtered
    : filtered.filter((i) => i.item_status === statusTab)

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

      {/* Status Tabs */}
      <div className="border-b">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const count = statusCounts[tab.value] ?? 0
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
                <span
                  className={cn(
                    'ml-1.5 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search P-code..."
          className="w-[140px]"
        />
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
      </div>

      {/* Additional Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categoryOptions.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brands</SelectItem>
            {brandOptions.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchBar
          value={descriptionSearch}
          onChange={setDescriptionSearch}
          placeholder="Search description..."
          className="min-w-[180px]"
        />
        <SearchBar
          value={conditionSearch}
          onChange={setConditionSearch}
          placeholder="Search condition..."
          className="min-w-[180px]"
        />
        <Input
          type="number"
          value={priceFrom}
          onChange={(e) => setPriceFrom(e.target.value)}
          placeholder="¥ From"
          className="w-[110px]"
        />
        <Input
          type="number"
          value={priceTo}
          onChange={(e) => setPriceTo(e.target.value)}
          placeholder="¥ To"
          className="w-[110px]"
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} columns={7} />
      ) : (
        <DataTable
          columns={columns}
          data={filteredItems}
          onRowClick={(row) => navigate(`/admin/items/${row.id}`)}
        />
      )}
    </div>
  )
}
