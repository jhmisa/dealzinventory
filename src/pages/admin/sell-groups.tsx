import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, AlertTriangle, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PageHeader, SearchBar, DataTable, GradeBadge, StatusBadge, CodeDisplay, PriceDisplay, TableSkeleton } from '@/components/shared'
import { useSellGroups, useUnassignedItems, useCreateSellGroupWithItems } from '@/hooks/use-sell-groups'
import { CONDITION_GRADES } from '@/lib/constants'
import { getItemDescription, formatPrice } from '@/lib/utils'

type SellGroupRow = {
  id: string
  sell_group_code: string
  condition_grade: string
  discount_amount: number
  active: boolean
  created_at: string
  product_models: {
    brand: string; model_name: string; color: string; cpu: string | null; ram_gb: string | null; storage_gb: string | null; os_family: string | null;
    categories: { name: string; description_fields: string[] } | null;
    [key: string]: unknown;
  } | null
  sell_group_items: Array<{
    items: {
      id: string
      item_code: string
      condition_grade: string
      item_status: string
      selling_price: number | null
      discount: number | null
      color: string | null
      ram_gb: string | null
      storage_gb: string | null
      cpu: string | null
      screen_size: number | null
      battery_health_pct: number | null
      condition_notes: string | null
      product_models: {
        brand: string; model_name: string; color: string | null; cpu: string | null; ram_gb: string | null; storage_gb: string | null;
        categories: { name: string; description_fields: string[] | null } | null
        [key: string]: unknown
      } | null
    } | null
  }>
}

function getRepItem(row: SellGroupRow) {
  for (const sgi of row.sell_group_items ?? []) {
    if (sgi?.items) return sgi.items
  }
  return null
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
    id: 'description',
    header: 'Description',
    cell: ({ row }) => {
      const rep = getRepItem(row.original)
      const pm = rep?.product_models ?? row.original.product_models
      const descFields = pm?.categories?.description_fields ?? null
      const desc = getItemDescription(
        (rep ?? {}) as Record<string, unknown>,
        pm as Record<string, unknown> | null,
        descFields,
      )
      return desc || '—'
    },
  },
  {
    accessorKey: 'condition_grade',
    header: 'Grade',
    cell: ({ row }) => <GradeBadge grade={row.original.condition_grade} />,
  },
  {
    id: 'normal_price',
    header: 'Normal Price',
    cell: ({ row }) => {
      const rep = getRepItem(row.original)
      const sp = rep?.selling_price
      if (sp == null) return <span className="text-muted-foreground">—</span>
      const hasDiscount = (row.original.discount_amount ?? 0) > 0
      return hasDiscount ? (
        <span className="text-sm text-muted-foreground line-through tabular-nums">{formatPrice(sp)}</span>
      ) : (
        <PriceDisplay amount={sp} />
      )
    },
  },
  {
    id: 'discount_price',
    header: 'Discount Price',
    cell: ({ row }) => {
      const rep = getRepItem(row.original)
      const sp = rep?.selling_price
      const disc = Number(row.original.discount_amount ?? 0)
      if (sp == null || disc <= 0) return <span className="text-muted-foreground">—</span>
      const effective = Math.max(0, Number(sp) - disc)
      return <span className="font-bold text-red-600 dark:text-red-400 tabular-nums">{formatPrice(effective)}</span>
    },
  },
  {
    id: 'items',
    header: 'Items',
    cell: ({ row }) => {
      const count = (row.original.sell_group_items ?? []).filter(s => s.items).length
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

type PickerItem = {
  id: string
  item_code: string
  condition_grade: string
  item_status: string
  selling_price: number | null
  discount: number | null
  color: string | null
  ram_gb: string | null
  storage_gb: string | null
  cpu: string | null
  screen_size: number | null
  battery_health_pct: number | null
  condition_notes: string | null
  product_id: string | null
  product_models: {
    id: string; brand: string; model_name: string; color: string | null; cpu: string | null; ram_gb: string | null; storage_gb: string | null; screen_size: number | null
    categories: { name: string; description_fields: string[] | null } | null
    [key: string]: unknown
  } | null
  assigned_sell_group_id: string | null
  assigned_sell_group_code: string | null
}

interface LockedCriteria {
  productId: string
  productLabel: string
  grade: string
  color: string | null
  ramGb: string | null
  storageGb: string | null
  sellingPrice: number | null
}

function deriveLockedCriteria(item: PickerItem): LockedCriteria {
  const pm = item.product_models
  return {
    productId: item.product_id ?? '',
    productLabel: pm ? `${pm.brand} ${pm.model_name}${pm.color ? ` (${pm.color})` : ''}` : '—',
    grade: item.condition_grade,
    color: item.color ?? pm?.color ?? null,
    ramGb: item.ram_gb ?? pm?.ram_gb ?? null,
    storageGb: item.storage_gb ?? pm?.storage_gb ?? null,
    sellingPrice: item.selling_price,
  }
}

function checkMatch(item: PickerItem, locked: LockedCriteria): { matches: boolean; reason: string | null } {
  if (item.product_id !== locked.productId) return { matches: false, reason: 'Different product' }
  if (item.condition_grade !== locked.grade) return { matches: false, reason: 'Different grade' }
  const itemColor = item.color ?? item.product_models?.color ?? null
  if (itemColor !== locked.color) return { matches: false, reason: 'Different color' }
  const itemRam = item.ram_gb ?? item.product_models?.ram_gb ?? null
  if (itemRam !== locked.ramGb) return { matches: false, reason: 'Different RAM' }
  const itemStorage = item.storage_gb ?? item.product_models?.storage_gb ?? null
  if (itemStorage !== locked.storageGb) return { matches: false, reason: 'Different storage' }
  if (item.selling_price !== locked.sellingPrice) return { matches: false, reason: 'Different selling price' }
  return { matches: true, reason: null }
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
  const [discountAmount, setDiscountAmount] = useState<string>('')
  const [active, setActive] = useState(true)

  const { data: sellGroups, isLoading } = useSellGroups({ search: search || undefined })
  const { data: unassignedItems, isLoading: itemsLoading } = useUnassignedItems({
    search: pickerSearch || undefined,
    grade: pickerGrade && pickerGrade !== 'all' ? pickerGrade : undefined,
  })
  const createMutation = useCreateSellGroupWithItems()

  // First selected item locks the criteria. Use the first ticked id (in selection order is irrelevant —
  // any selected matching item works as the anchor).
  const lockedCriteria: LockedCriteria | null = useMemo(() => {
    if (!unassignedItems || selectedIds.size === 0) return null
    const firstSelected = (unassignedItems as PickerItem[]).find(i => selectedIds.has(i.id))
    return firstSelected ? deriveLockedCriteria(firstSelected) : null
  }, [unassignedItems, selectedIds])

  function toggleItem(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllMatching() {
    if (!unassignedItems) return
    const items = unassignedItems as PickerItem[]
    const eligible = items.filter(i => {
      if (i.assigned_sell_group_id) return false
      if (lockedCriteria) {
        const m = checkMatch(i, lockedCriteria)
        if (!m.matches) return false
      }
      return true
    })
    const eligibleIds = eligible.map(i => i.id)
    const allSelected = eligibleIds.length > 0 && eligibleIds.every(id => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(eligibleIds))
    }
  }

  function resetCriteria() {
    setSelectedIds(new Set())
  }

  function openDialog() {
    setDialogOpen(true)
    setPickerSearch('')
    setPickerGrade('')
    setSelectedIds(new Set())
    setDiscountAmount('')
    setActive(true)
  }

  const effectiveDiscount = discountAmount === '' ? 0 : Math.max(0, Number(discountAmount) || 0)
  const previewSellingPrice = Number(lockedCriteria?.sellingPrice ?? 0)
  const previewEffective = Math.max(0, previewSellingPrice - effectiveDiscount)

  function handleCreate() {
    if (!lockedCriteria || selectedIds.size === 0) return
    createMutation.mutate(
      {
        sg: {
          discount_amount: effectiveDiscount,
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
        <TableSkeleton rows={8} columns={8} />
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

          {/* Locked Criteria Strip */}
          {lockedCriteria && (
            <div className="flex items-center gap-2 flex-wrap p-2 rounded-md bg-muted/40 border">
              <span className="text-xs font-medium text-muted-foreground uppercase">Locked:</span>
              <Badge variant="secondary">{lockedCriteria.productLabel}</Badge>
              {lockedCriteria.color && <Badge variant="secondary">{lockedCriteria.color}</Badge>}
              <Badge variant="secondary">Grade {lockedCriteria.grade}</Badge>
              {lockedCriteria.ramGb && <Badge variant="secondary">{lockedCriteria.ramGb}</Badge>}
              {lockedCriteria.storageGb && <Badge variant="secondary">{lockedCriteria.storageGb}</Badge>}
              {lockedCriteria.sellingPrice != null && <Badge variant="secondary">{formatPrice(lockedCriteria.sellingPrice)}</Badge>}
              <Button variant="ghost" size="sm" onClick={resetCriteria} className="ml-auto h-7 text-xs">
                <X className="h-3 w-3 mr-1" /> Reset
              </Button>
            </div>
          )}

          {/* Items Table */}
          <div className="overflow-y-auto flex-1 min-h-0 border rounded-md">
            {itemsLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading items...</div>
            ) : !unassignedItems || unassignedItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No available items found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-xs font-medium text-muted-foreground uppercase">
                    <th className="p-3 w-10">
                      <Checkbox
                        checked={(() => {
                          const items = unassignedItems as PickerItem[]
                          const eligible = items.filter(i => !i.assigned_sell_group_id && (!lockedCriteria || checkMatch(i, lockedCriteria).matches))
                          return eligible.length > 0 && eligible.every(i => selectedIds.has(i.id))
                        })()}
                        onCheckedChange={toggleAllMatching}
                      />
                    </th>
                    <th className="p-3 text-left">P-Code</th>
                    <th className="p-3 text-left">Brand + Model</th>
                    <th className="p-3 text-left">Description</th>
                    <th className="p-3 text-left">Grade</th>
                    <th className="p-3 text-right">Price</th>
                    <th className="p-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(unassignedItems as PickerItem[]).map((item) => {
                    const pm = item.product_models
                    const inGroup = item.assigned_sell_group_code
                    const matchResult = lockedCriteria ? checkMatch(item, lockedCriteria) : { matches: true, reason: null }
                    const disabled = !!inGroup || !matchResult.matches
                    const isSelected = selectedIds.has(item.id)
                    const description = getItemDescription(
                      item as unknown as Record<string, unknown>,
                      pm as unknown as Record<string, unknown> | null,
                      pm?.categories?.description_fields ?? null,
                    )
                    return (
                      <tr
                        key={item.id}
                        className={`border-b last:border-0 ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer'} ${isSelected ? 'bg-muted/30' : ''}`}
                        onClick={() => { if (!disabled) toggleItem(item.id) }}
                      >
                        <td className="p-3">
                          <Checkbox
                            checked={isSelected}
                            disabled={disabled}
                            onCheckedChange={() => { if (!disabled) toggleItem(item.id) }}
                          />
                        </td>
                        <td className="p-3"><CodeDisplay code={item.item_code} /></td>
                        <td className="p-3">{pm ? `${pm.brand} ${pm.model_name}${pm.color ? ` (${pm.color})` : ''}` : '—'}</td>
                        <td className="p-3 text-muted-foreground">{description || '—'}</td>
                        <td className="p-3"><GradeBadge grade={item.condition_grade} /></td>
                        <td className="p-3 text-right">
                          {item.selling_price != null ? <PriceDisplay amount={item.selling_price} /> : '—'}
                        </td>
                        <td className="p-3">
                          {inGroup ? (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-800 border-amber-300">
                              In {inGroup}
                            </Badge>
                          ) : !matchResult.matches ? (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-xs">Doesn&rsquo;t match</Badge>
                                </TooltipTrigger>
                                <TooltipContent>{matchResult.reason}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Selection Info & Create Panel */}
          {lockedCriteria && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected</span>
                {selectedIds.size === 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    Select at least one item
                  </div>
                )}
              </div>

              <div className="grid grid-cols-4 gap-4 items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Normal Price</Label>
                  <div className="text-sm font-medium tabular-nums">{lockedCriteria.sellingPrice != null ? formatPrice(lockedCriteria.sellingPrice) : '—'}</div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="discount-amount" className="text-xs text-muted-foreground">Discount Amount (¥)</Label>
                  <Input
                    id="discount-amount"
                    type="number"
                    placeholder="0"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    min={0}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Discount Price</Label>
                  {effectiveDiscount > 0 ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">{formatPrice(previewEffective)}</span>
                      <span className="text-xs text-muted-foreground line-through tabular-nums">{formatPrice(previewSellingPrice)}</span>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No discount</div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={active} onCheckedChange={setActive} />
                    <Label className="text-sm">Active</Label>
                  </div>
                  <Button
                    onClick={handleCreate}
                    disabled={createMutation.isPending || selectedIds.size === 0}
                    className="ml-auto"
                  >
                    {createMutation.isPending ? 'Creating...' : `Create (${selectedIds.size})`}
                  </Button>
                </div>
              </div>

              {effectiveDiscount === 0 && (
                <p className="text-xs text-muted-foreground">
                  With discount = ¥0, items will display at their normal price (no strikethrough).
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
