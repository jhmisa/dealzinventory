import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Printer, QrCode, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageHeader, SearchBar, DataTable, StatusBadge, GradeBadge, CodeDisplay, PriceDisplay, TableSkeleton } from '@/components/shared'
import { useItems, useUpdateItem, useItemStatusCounts } from '@/hooks/use-items'
import { useItemListColumnSettings } from '@/hooks/use-settings'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { useDebounce } from '@/hooks/use-debounce'
import { ITEM_STATUSES, CONDITION_GRADES } from '@/lib/constants'
import { formatDate, cn, buildShortDescription } from '@/lib/utils'
import { printItemLabel } from '@/components/items/label-print'

type ItemRow = {
  id: string
  item_code: string
  item_status: string
  condition_grade: string | null
  condition_notes: string | null
  source_type: string
  purchase_price: number | null
  selling_price: number | null
  discount: number | null
  created_at: string
  brand: string | null
  model_name: string | null
  cpu: string | null
  ram_gb: string | null
  storage_gb: string | null
  screen_size: number | null
  suppliers: { supplier_name: string } | null
  product_models: { brand: string; model_name: string; color: string; short_description: string | null; screen_size: number | null; categories: { name: string; description_fields: string[] } | null } | null
}

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  ...ITEM_STATUSES.map((s) => ({ value: s.value, label: s.label })),
]

function EditPriceCell({
  itemId,
  itemCode,
  field,
  value,
  updateItem,
}: {
  itemId: string
  itemCode: string
  field: 'selling_price' | 'discount'
  value: number | null
  updateItem: ReturnType<typeof useUpdateItem>
}) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const label = field === 'selling_price' ? 'Selling Price' : 'Discount'

  const handleOpen = () => {
    setInputValue(value != null ? String(value) : '')
    setOpen(true)
  }

  const handleSave = () => {
    const parsed = inputValue === '' ? null : Number(inputValue)
    if (parsed === value) { setOpen(false); return }
    if (parsed !== null && isNaN(parsed)) return
    updateItem.mutate({ id: itemId, updates: { [field]: parsed } })
    setOpen(false)
  }

  return (
    <>
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <PriceDisplay amount={value} />
        <button
          onClick={handleOpen}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[360px]" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Edit {label}</DialogTitle>
            <p className="text-sm text-muted-foreground">{itemCode}</p>
          </DialogHeader>
          <Input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={`Enter ${label.toLowerCase()}`}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function ItemListPage() {
  const navigate = useNavigate()
  const updateItem = useUpdateItem()
  const { getParam, setParam } = usePersistedFilters('items-filters')

  // Read filter state from URL search params
  const search = getParam('q')
  const statusTab = getParam('status', 'all')
  const gradeFilter = getParam('grade')
  const categoryFilter = getParam('category')
  const brandFilter = getParam('brand')
  const descriptionSearch = getParam('desc')
  const conditionSearch = getParam('condition')
  const priceFrom = getParam('priceFrom')
  const priceTo = getParam('priceTo')
  const noSellFilter = getParam('noSell')

  const setSearch = useCallback((v: string) => setParam('q', v), [setParam])
  const setStatusTab = useCallback((v: string) => setParam('status', v, 'all'), [setParam])
  const setGradeFilter = useCallback((v: string) => setParam('grade', v), [setParam])
  const setCategoryFilter = useCallback((v: string) => setParam('category', v), [setParam])
  const setBrandFilter = useCallback((v: string) => setParam('brand', v), [setParam])
  const setDescriptionSearch = useCallback((v: string) => setParam('desc', v), [setParam])
  const setConditionSearch = useCallback((v: string) => setParam('condition', v), [setParam])
  const setPriceFrom = useCallback((v: string) => setParam('priceFrom', v), [setParam])
  const setPriceTo = useCallback((v: string) => setParam('priceTo', v), [setParam])
  const setNoSellFilter = useCallback((v: string) => setParam('noSell', v), [setParam])

  const debouncedSearch = useDebounce(search, 400)
  const debouncedDescSearch = useDebounce(descriptionSearch, 400)
  const debouncedConditionSearch = useDebounce(conditionSearch, 400)

  const { data: columnSettings } = useItemListColumnSettings()

  // Build VisibilityState from settings for the active tab
  const ALL_COLUMN_IDS = ['item_code', 'model', 'condition_grade', 'item_status', 'supplier', 'purchase_price', 'selling_price', 'discount', 'created_at', 'actions']
  const columnVisibility = useMemo(() => {
    if (!columnSettings) return {}
    const setting = columnSettings.find((s) => s.status_tab === statusTab)
    if (!setting) return {}
    const vis: Record<string, boolean> = {}
    for (const id of ALL_COLUMN_IDS) {
      vis[id] = setting.visible_columns.includes(id)
    }
    return vis
  }, [columnSettings, statusTab])

  const baseFilters = {
    search: debouncedSearch || undefined,
    grade: gradeFilter && gradeFilter !== 'all' ? gradeFilter : undefined,
  }

  // Server-side counts for tab badges (no status filter)
  const { data: statusCounts = {} as Record<string, number> } = useItemStatusCounts(baseFilters)

  // Fetch items filtered by active status tab
  const { data: allItems, isLoading } = useItems({
    ...baseFilters,
    status: statusTab !== 'all' ? statusTab : undefined,
  })

  const items = (allItems ?? []) as ItemRow[]

  // Derive dropdown options from data
  const categoryOptions = [...new Set(items.map(i => i.product_models?.categories?.name).filter(Boolean))].sort() as string[]
  const brandOptions = [...new Set(items.map(i => i.brand ?? i.product_models?.brand).filter(Boolean))].sort() as string[]

  // Client-side filtering for filters not passed to the server
  const filteredItems = items.filter(item => {
    if (noSellFilter === 'yes' && item.selling_price != null) return false
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
          const resolvedValues: Record<string, unknown> = {}
          for (const key of descFields) {
            resolvedValues[key] = (row.original as Record<string, unknown>)[key] ?? (pm as Record<string, unknown> | null)?.[key]
          }
          modelLine = buildShortDescription(resolvedValues, descFields) || row.original.supplier_description || '—'
        } else {
          const { brand, model_name, cpu, ram_gb, storage_gb, screen_size } = row.original
          const modelName = brand && model_name
            ? `${brand} ${model_name}`
            : pm ? `${pm.brand} ${pm.model_name}` : null
          const screenVal = screen_size ?? pm?.screen_size
          const parts = [
            modelName,
            cpu,
            ram_gb,
            storage_gb,
            screenVal ? `${screenVal}"` : null,
          ].filter(Boolean)
          modelLine = parts.length > 0 ? parts.join(' / ') : (row.original.supplier_description || '—')
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
      header: 'Buy',
      cell: ({ row }) => <PriceDisplay amount={row.original.purchase_price} />,
    },
    {
      id: 'selling_price',
      accessorFn: (row) => row.selling_price,
      header: 'Sell',
      cell: ({ row }) => (
        <EditPriceCell
          itemId={row.original.id}
          itemCode={row.original.item_code}
          field="selling_price"
          value={row.original.selling_price}
          updateItem={updateItem}
        />
      ),
    },
    {
      id: 'discount',
      accessorFn: (row) => row.discount,
      header: 'Discount',
      cell: ({ row }) => (
        <EditPriceCell
          itemId={row.original.id}
          itemCode={row.original.item_code}
          field="discount"
          value={row.original.discount}
          updateItem={updateItem}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Intake Date',
      cell: ({ row }) => formatDate(row.original.created_at),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const pm = row.original.product_models
        const descFields = pm?.categories?.description_fields ?? []
        const desc = buildShortDescription(row.original, descFields) || undefined
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Print label"
            onClick={(e) => {
              e.stopPropagation()
              printItemLabel({ item_code: row.original.item_code, description: desc })
            }}
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
        )
      },
    },
  ]

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
            <SelectItem value="UNGRADED">Ungraded</SelectItem>
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
        <div className="flex items-center gap-2">
          <Checkbox
            id="no-sell-price"
            checked={noSellFilter === 'yes'}
            onCheckedChange={(checked) => setNoSellFilter(checked ? 'yes' : '')}
          />
          <Label htmlFor="no-sell-price" className="text-sm font-normal cursor-pointer">No Sell Price</Label>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} columns={Object.values(columnVisibility).filter(Boolean).length || 9} />
      ) : (
        <DataTable
          columns={columns}
          data={filteredItems}
          columnVisibility={columnVisibility}
          onRowClick={(row) => navigate(`/admin/items/${row.id}`)}
        />
      )}
    </div>
  )
}
