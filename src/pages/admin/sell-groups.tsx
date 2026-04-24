import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, AlertTriangle, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader, SearchBar, DataTable, GradeBadge, StatusBadge, CodeDisplay, PriceDisplay, TableSkeleton } from '@/components/shared'
import { useSellGroups, useUnassignedItems, useCreateSellGroupWithItems } from '@/hooks/use-sell-groups'
import { CONDITION_GRADES } from '@/lib/constants'

type SellGroupRow = {
  id: string
  sell_group_code: string
  condition_grade: string
  base_price: number
  active: boolean
  created_at: string
  product_models: { brand: string; model_name: string; color: string; cpu: string | null; ram_gb: string | null; storage_gb: string | null; os_family: string | null } | null
  sell_group_items: { count: number }[]
}

const columns: ColumnDef<SellGroupRow>[] = [
  {
    accessorKey: 'sell_group_code',
    header: 'G-Code',
    cell: ({ row }) => <CodeDisplay code={row.original.sell_group_code} />,
  },
  {
    id: 'product',
    header: 'Product',
    cell: ({ row }) => {
      const pm = row.original.product_models
      return pm ? `${pm.brand} ${pm.model_name} (${pm.color})` : '—'
    },
  },
  {
    id: 'config',
    header: 'Config',
    cell: ({ row }) => {
      const pm = row.original.product_models
      return pm && (pm.cpu || pm.ram_gb || pm.storage_gb) ? `${pm.cpu ?? '?'} / ${pm.ram_gb ?? '?'} / ${pm.storage_gb ?? '?'}` : '—'
    },
  },
  {
    accessorKey: 'condition_grade',
    header: 'Grade',
    cell: ({ row }) => <GradeBadge grade={row.original.condition_grade} />,
  },
  {
    accessorKey: 'base_price',
    header: 'Price',
    cell: ({ row }) => <PriceDisplay amount={row.original.base_price} />,
  },
  {
    id: 'items',
    header: 'Items',
    cell: ({ row }) => {
      const count = row.original.sell_group_items?.[0]?.count ?? 0
      return <span className="text-sm">{count}</span>
    },
  },
  {
    accessorKey: 'active',
    header: 'Status',
    cell: ({ row }) =>
      row.original.active
        ? <StatusBadge label="Active" color="bg-green-100 text-green-800 border-green-300" />
        : <StatusBadge label="Inactive" color="bg-gray-100 text-gray-800 border-gray-300" />,
  },
]

const SELLABLE_GRADES = CONDITION_GRADES.filter(g => g.value !== 'J')

type UnassignedItem = {
  id: string
  item_code: string
  condition_grade: string
  item_status: string
  selling_price: number | null
  product_id: string | null
  product_models: { id: string; brand: string; model_name: string; color: string; cpu: string | null; ram_gb: string | null; storage_gb: string | null } | null
}

export default function SellGroupListPage() {
  const navigate = useNavigate()
  const { getParam, setParam } = usePersistedFilters('sell-groups-filters')
  const search = getParam('q')
  const setSearch = (v: string) => setParam('q', v)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Dialog state
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerGrade, setPickerGrade] = useState<string>('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [basePrice, setBasePrice] = useState<string>('')
  const [active, setActive] = useState(true)

  const { data: sellGroups, isLoading } = useSellGroups({ search: search || undefined })
  const { data: unassignedItems, isLoading: itemsLoading } = useUnassignedItems({
    search: pickerSearch || undefined,
    grade: pickerGrade && pickerGrade !== 'all' ? pickerGrade : undefined,
  })
  const createMutation = useCreateSellGroupWithItems()

  // Derive selection validity
  const selectedItems = useMemo(() => {
    if (!unassignedItems) return []
    return unassignedItems.filter((item: UnassignedItem) => selectedIds.has(item.id))
  }, [unassignedItems, selectedIds])

  const selectionInfo = useMemo(() => {
    if (selectedItems.length === 0) return { valid: false, productId: null, grade: null, productLabel: '', warning: '' }

    const productIds = new Set(selectedItems.map((i: UnassignedItem) => i.product_id))
    const grades = new Set(selectedItems.map((i: UnassignedItem) => i.condition_grade))

    if (productIds.size > 1 || grades.size > 1) {
      return { valid: false, productId: null, grade: null, productLabel: '', warning: 'Selected items must have the same model and grade' }
    }

    const first = selectedItems[0] as UnassignedItem
    const pm = first.product_models
    const productLabel = pm ? `${pm.brand} ${pm.model_name} (${pm.color})` : '—'

    // Default price: most common selling_price
    const prices = selectedItems
      .map((i: UnassignedItem) => i.selling_price)
      .filter((p): p is number => p != null)
    const priceFreq = new Map<number, number>()
    prices.forEach(p => priceFreq.set(p, (priceFreq.get(p) ?? 0) + 1))
    let defaultPrice = 0
    let maxFreq = 0
    priceFreq.forEach((freq, price) => {
      if (freq > maxFreq) { maxFreq = freq; defaultPrice = price }
    })

    return {
      valid: true,
      productId: first.product_id,
      grade: first.condition_grade,
      productLabel,
      warning: '',
      defaultPrice,
    }
  }, [selectedItems])

  function toggleItem(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (!unassignedItems) return
    const allIds = unassignedItems.map((i: UnassignedItem) => i.id)
    const allSelected = allIds.every(id => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allIds))
    }
  }

  function openDialog() {
    setDialogOpen(true)
    setPickerSearch('')
    setPickerGrade('')
    setSelectedIds(new Set())
    setBasePrice('')
    setActive(true)
  }

  function handleCreate() {
    if (!selectionInfo.valid || !selectionInfo.productId || !selectionInfo.grade) return

    const price = basePrice !== '' ? Number(basePrice) : (selectionInfo as { defaultPrice?: number }).defaultPrice ?? 0

    createMutation.mutate(
      {
        sg: {
          product_id: selectionInfo.productId,
          condition_grade: selectionInfo.grade,
          base_price: price,
          active,
        },
        itemIds: Array.from(selectedIds),
      },
      {
        onSuccess: (sg) => {
          toast.success(`Sell group ${sg.sell_group_code} created with ${selectedIds.size} items`)
          setDialogOpen(false)
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  const effectivePrice = basePrice !== '' ? Number(basePrice) : (selectionInfo as { defaultPrice?: number }).defaultPrice ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sell Groups"
        description="Group items by config, grade, and price for selling."
        actions={
          <Button onClick={openDialog}>
            <Plus className="h-4 w-4 mr-2" />
            New Sell Group
          </Button>
        }
      />

      <SearchBar value={search} onChange={setSearch} placeholder="Search G-code..." />

      {isLoading ? (
        <TableSkeleton rows={8} columns={7} />
      ) : (
        <DataTable
          columns={columns}
          data={(sellGroups ?? []) as SellGroupRow[]}
          onRowClick={(row) => navigate(`/admin/sell-groups/${row.id}`)}
        />
      )}

      {/* New Sell Group — Inventory-First Creation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[85vw] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>New Sell Group — Select Items</DialogTitle>
          </DialogHeader>

          {/* Filters */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by P-code, brand, or model..."
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={pickerGrade} onValueChange={setPickerGrade}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All grades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All grades</SelectItem>
                {SELLABLE_GRADES.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Items Table */}
          <div className="overflow-y-auto flex-1 min-h-0 border rounded-md">
            {itemsLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading items...</div>
            ) : !unassignedItems || unassignedItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No available unassigned items found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-xs font-medium text-muted-foreground uppercase">
                    <th className="p-3 w-10">
                      <Checkbox
                        checked={unassignedItems.length > 0 && unassignedItems.every((i: UnassignedItem) => selectedIds.has(i.id))}
                        onCheckedChange={toggleAll}
                      />
                    </th>
                    <th className="p-3 text-left">P-Code</th>
                    <th className="p-3 text-left">Brand + Model</th>
                    <th className="p-3 text-left">Config</th>
                    <th className="p-3 text-left">Grade</th>
                    <th className="p-3 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {(unassignedItems as UnassignedItem[]).map((item) => {
                    const pm = item.product_models
                    return (
                      <tr
                        key={item.id}
                        className={`border-b last:border-0 hover:bg-muted/50 cursor-pointer ${selectedIds.has(item.id) ? 'bg-muted/30' : ''}`}
                        onClick={() => toggleItem(item.id)}
                      >
                        <td className="p-3">
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={() => toggleItem(item.id)}
                          />
                        </td>
                        <td className="p-3"><CodeDisplay code={item.item_code} /></td>
                        <td className="p-3">{pm ? `${pm.brand} ${pm.model_name} (${pm.color})` : '—'}</td>
                        <td className="p-3 text-muted-foreground">
                          {pm && (pm.cpu || pm.ram_gb || pm.storage_gb)
                            ? `${pm.cpu ?? '?'} / ${pm.ram_gb ?? '?'}GB / ${pm.storage_gb ?? '?'}GB`
                            : '—'}
                        </td>
                        <td className="p-3"><GradeBadge grade={item.condition_grade} /></td>
                        <td className="p-3 text-right">
                          {item.selling_price != null ? <PriceDisplay amount={item.selling_price} /> : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Selection Info & Create Panel */}
          {selectedIds.size > 0 && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected</span>
                {selectionInfo.warning && (
                  <div className="flex items-center gap-1.5 text-sm text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    {selectionInfo.warning}
                  </div>
                )}
              </div>

              {selectionInfo.valid && (
                <div className="grid grid-cols-4 gap-4 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Product</Label>
                    <div className="text-sm font-medium truncate">{selectionInfo.productLabel}</div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Grade</Label>
                    <div><GradeBadge grade={selectionInfo.grade!} /></div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="base-price" className="text-xs text-muted-foreground">Base Price (¥)</Label>
                    <Input
                      id="base-price"
                      type="number"
                      placeholder={String(effectivePrice)}
                      value={basePrice}
                      onChange={(e) => setBasePrice(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch checked={active} onCheckedChange={setActive} />
                      <Label className="text-sm">Active</Label>
                    </div>
                    <Button
                      onClick={handleCreate}
                      disabled={createMutation.isPending}
                      className="ml-auto"
                    >
                      {createMutation.isPending ? 'Creating...' : `Create Sell Group (${selectedIds.size})`}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
