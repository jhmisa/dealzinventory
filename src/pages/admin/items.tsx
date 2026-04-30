import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Printer, QrCode, Pencil, Copy, AlertTriangle, Image, Play, Star, X, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageHeader, SearchBar, DataTable, StatusBadge, GradeBadge, CodeDisplay, PriceDisplay, TableSkeleton } from '@/components/shared'
import { useItems, useUpdateItem, useItemStatusCounts, useToggleLiveSelling, useItemsRealtimeSync } from '@/hooks/use-items'
import { useSellGroupByCode, useToggleSellGroupLiveSelling, useLiveSellingSellGroups, useSellGroupLiveSellingCount, useSellGroupsForList, useSellGroupStatusCounts } from '@/hooks/use-sell-groups'
import { SellGroupResultBlock } from '@/components/sell-groups/sell-group-result-block'
import { useAccessories, useCreateAccessory, useAccessoryTabCounts, useToggleAccessoryLiveSelling, useAccessoryLiveSellingCount } from '@/hooks/use-accessories'
import { useCategories } from '@/hooks/use-categories'
import { useItemListColumnSettings } from '@/hooks/use-settings'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { useDebounce } from '@/hooks/use-debounce'
import { ITEM_STATUSES, CONDITION_GRADES } from '@/lib/constants'
import { formatDate, formatPrice, cn, buildShortDescription, formatCustomerName, getItemDescription } from '@/lib/utils'
import { toast } from 'sonner'
import { printItemLabel } from '@/components/items/label-print'
import { resolveSoldTo } from '@/lib/item-sale'
import type { Accessory, AccessoryMedia, ConditionGrade } from '@/lib/types'
import type { LiveSellingSellGroup } from '@/services/sell-groups'

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
  supplier_description: string | null
  is_live_selling?: boolean
  product_id: string | null
  product_models: { brand: string; model_name: string; color: string; short_description: string | null; screen_size: number | null; categories: { name: string; description_fields: string[] } | null; product_media?: { file_url: string; role: string; sort_order: number }[] } | null
  order_items?: Array<{
    orders: {
      id: string
      order_code: string
      order_status: string
      customers: { id: string; customer_code: string; first_name: string | null; last_name: string; email: string | null; phone: string | null } | null
    } | null
  }>
}

type AccessoryRow = Accessory & {
  categories: { name: string } | null
  accessory_media: AccessoryMedia[]
}

type SellGroupRow = LiveSellingSellGroup & {
  _sg_description: string
  _sg_thumbnail: string | undefined
  _sg_item_count: number
}

type InventoryRow =
  | (ItemRow & { _kind: 'item' })
  | (AccessoryRow & { _kind: 'accessory' })
  | (SellGroupRow & { _kind: 'sell-group' })

type InventoryTypeFilter = 'all' | 'products' | 'accessories' | 'sell-groups'

const INVENTORY_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'products', label: 'Products' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'sell-groups', label: 'Group Codes' },
] as const

const INVENTORY_TABS = [
  { value: 'items', label: 'Items' },
  { value: 'accessories', label: 'Accessories' },
] as const

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  ...ITEM_STATUSES.map((s) => ({ value: s.value, label: s.label })),
  { value: 'LIVE_SELLING', label: 'LiveSelling' },
]

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Date (Newest)' },
  { value: 'date-asc', label: 'Date (Oldest)' },
  { value: 'code-asc', label: 'Code (Low → High)' },
  { value: 'code-desc', label: 'Code (High → Low)' },
  { value: 'description-asc', label: 'Description (A → Z)' },
  { value: 'description-desc', label: 'Description (Z → A)' },
  { value: 'buy_price-asc', label: 'Buy Price (Low → High)' },
  { value: 'buy_price-desc', label: 'Buy Price (High → Low)' },
  { value: 'sell_price-asc', label: 'Sell Price (Low → High)' },
  { value: 'sell_price-desc', label: 'Sell Price (High → Low)' },
] as const

function getItemDesc(item: ItemRow): string {
  const pm = item.product_models
  return getItemDescription(
    item as unknown as Record<string, unknown>,
    pm as unknown as Record<string, unknown> | null,
    pm?.categories?.description_fields,
  )
}

const accessoryColumns: ColumnDef<AccessoryRow>[] = [
  {
    id: 'accessory_summary',
    header: 'Accessory',
    cell: ({ row }) => {
      const r = row.original
      const brandName = [r.brand, r.name].filter(Boolean).join(' ')
      return (
        <div className="flex items-center gap-3">
          {r.accessory_media?.[0] ? (
            <img
              src={r.accessory_media[0].file_url}
              alt={r.name}
              className="h-10 w-10 rounded border bg-muted flex-shrink-0 object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded border bg-muted flex-shrink-0 flex items-center justify-center text-muted-foreground text-xs">—</div>
          )}
          <div className="min-w-0">
            <CodeDisplay code={r.accessory_code} />
            <div className="text-sm text-muted-foreground">{brandName || '—'}</div>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: 'categories',
    header: 'Category',
    cell: ({ row }) => row.original.categories?.name ?? '—',
  },
  {
    accessorKey: 'selling_price',
    header: 'Price',
    cell: ({ row }) => formatPrice(Number(row.original.selling_price)),
  },
  {
    accessorKey: 'stock_quantity',
    header: 'Stock',
    cell: ({ row }) => {
      const qty = row.original.stock_quantity
      const threshold = row.original.low_stock_threshold
      if (qty === 0) {
        return <Badge variant="destructive">0</Badge>
      }
      if (qty <= threshold) {
        return (
          <Badge variant="outline" className="text-yellow-700 border-yellow-400 bg-yellow-50">
            <AlertTriangle className="h-3 w-3 mr-1" />{qty}
          </Badge>
        )
      }
      return <span>{qty}</span>
    },
  },
  {
    accessorKey: 'shop_visible',
    header: 'Shop',
    cell: ({ row }) => row.original.shop_visible ? (
      <Badge variant="outline" className="text-green-700 border-green-400">Visible</Badge>
    ) : (
      <span className="text-muted-foreground text-xs">Hidden</span>
    ),
  },
  {
    accessorKey: 'active',
    header: 'Status',
    cell: ({ row }) => row.original.active ? (
      <Badge variant="outline" className="text-green-700 border-green-400">Active</Badge>
    ) : (
      <Badge variant="secondary">Inactive</Badge>
    ),
  },
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
      <button
        onClick={(e) => { e.stopPropagation(); handleOpen() }}
        className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
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
  useItemsRealtimeSync()
  const updateItem = useUpdateItem()
  const toggleLiveSelling = useToggleLiveSelling()
  const toggleAccessoryLiveSelling = useToggleAccessoryLiveSelling()
  const toggleSellGroupLiveSelling = useToggleSellGroupLiveSelling()
  const { getParam, setParam, setParams } = usePersistedFilters('items-filters')

  // Inventory type tab (items vs accessories)
  const inventoryTab = getParam('inventoryTab', 'items') as 'items' | 'accessories'
  const setInventoryTab = useCallback((v: string) => setParam('inventoryTab', v, 'items'), [setParam])

  // Inventory type filter (within Items tab, for All & Available sub-tabs)
  const inventoryType = (getParam('invType', 'all') || 'all') as InventoryTypeFilter
  const setInventoryType = useCallback((v: string) => setParam('invType', v, 'all'), [setParam])

  // Accessory tab counts for badges
  const { data: accTabCounts } = useAccessoryTabCounts()
  const { data: accLiveSellingCount = 0 } = useAccessoryLiveSellingCount()
  const { data: sgLiveSellingCount = 0 } = useSellGroupLiveSellingCount()

  // Accessories state
  const accSearch = getParam('accQ')
  const setAccSearch = useCallback((v: string) => setParam('accQ', v), [setParam])
  const accCategoryFilter = getParam('accCategory') || 'all'
  const debouncedAccSearch = useDebounce(accSearch, 400)
  const { data: accessories, isLoading: accLoading } = useAccessories({
    search: debouncedAccSearch || undefined,
    categoryId: accCategoryFilter !== 'all' ? accCategoryFilter : undefined,
  })
  const { data: categories } = useCategories()
  const createMutation = useCreateAccessory()
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBrand, setNewBrand] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newShopVisible, setNewShopVisible] = useState(false)

  function handleCreateAccessory() {
    const price = parseInt(newPrice, 10)
    if (!newName.trim() || isNaN(price) || price < 0) {
      toast.error('Name and valid price are required')
      return
    }
    createMutation.mutate(
      {
        name: newName.trim(),
        brand: newBrand.trim() || null,
        selling_price: price,
        category_id: newCategory || null,
        shop_visible: newShopVisible,
      },
      {
        onSuccess: (accessory) => {
          toast.success(`Created ${accessory.accessory_code}`)
          setCreateOpen(false)
          setNewName('')
          setNewBrand('')
          setNewPrice('')
          setNewCategory('')
          setNewShopVisible(false)
          navigate(`/admin/accessories/${accessory.id}`)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

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
  const sortBy = getParam('sortBy') || 'date'
  const sortDir = getParam('sortDir', 'desc') || 'desc'

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

  const setSortValue = useCallback((combined: string) => {
    const [field, dir] = combined.split('-')
    setParams({
      sortBy: { value: field, defaultValue: 'date' },
      sortDir: { value: dir, defaultValue: 'desc' },
    })
  }, [setParams])

  const hasActiveFilters = !!(search || gradeFilter || categoryFilter || brandFilter || descriptionSearch || conditionSearch || priceFrom || priceTo || noSellFilter || (sortBy && sortBy !== 'date') || (sortDir && sortDir !== 'desc'))

  const clearAllFilters = useCallback(() => {
    setParam('q', '')
    setParam('grade', '')
    setParam('category', '')
    setParam('brand', '')
    setParam('desc', '')
    setParam('condition', '')
    setParam('priceFrom', '')
    setParam('priceTo', '')
    setParam('noSell', '')
    setParam('sortBy', '', 'date')
    setParam('sortDir', '', 'desc')
  }, [setParam])

  const debouncedSearch = useDebounce(search, 400)
  const debouncedDescSearch = useDebounce(descriptionSearch, 400)
  const debouncedConditionSearch = useDebounce(conditionSearch, 400)

  const isGCodeSearch = /^G\d{3,}$/i.test(debouncedSearch?.trim() ?? '')
  const { data: sellGroupResult, isLoading: sgLoading } = useSellGroupByCode(isGCodeSearch ? debouncedSearch?.trim() : undefined)

  const { data: columnSettings } = useItemListColumnSettings()

  // Build VisibilityState from settings for the active tab
  const ALL_COLUMN_IDS = ['item_summary', 'item_status', 'supplier', 'amount', 'sold_to', 'created_at', 'actions']
  const columnVisibility = useMemo(() => {
    if (!columnSettings) return {}
    const setting = columnSettings.find((s) => s.status_tab === statusTab)
    if (!setting) return {}
    const saved = setting.visible_columns
    const vis: Record<string, boolean> = {}
    for (const id of ALL_COLUMN_IDS) {
      if (id === 'item_summary') {
        // Migrate from old separate columns: show if any of the old ones were visible, or if not yet saved
        vis[id] = saved.includes('item_summary') || saved.includes('item_code') || saved.includes('model') || saved.includes('condition_grade')
      } else if (id === 'amount') {
        // Migrate from old separate price columns
        vis[id] = saved.includes('amount') || saved.includes('purchase_price') || saved.includes('selling_price') || saved.includes('discount')
      } else if (id === 'sold_to') {
        // Show sold_to by default on order-related tabs even if not yet in saved settings
        const orderTabs = new Set(['RESERVED', 'SOLD'])
        vis[id] = saved.includes(id) || orderTabs.has(statusTab)
      } else {
        vis[id] = saved.includes(id)
      }
    }
    return vis
  }, [columnSettings, statusTab])

  const baseFilters = {
    search: debouncedSearch || undefined,
    grade: gradeFilter && gradeFilter !== 'all' ? gradeFilter : undefined,
  }

  // Server-side counts for tab badges (no status filter)
  const { data: statusCounts = {} as Record<string, number> } = useItemStatusCounts(baseFilters)

  // Should we show unified view? On All/AVAILABLE/LIVE_SELLING tabs within Items tab
  const showUnified = inventoryTab === 'items' && (statusTab === 'all' || statusTab === 'AVAILABLE' || statusTab === 'LIVE_SELLING')
  const skipItemsFetch = showUnified && (inventoryType === 'accessories' || inventoryType === 'sell-groups')
  const skipAccFetch = !showUnified || inventoryType === 'products' || inventoryType === 'sell-groups'

  // Fetch items filtered by active status tab
  const { data: allItems, isLoading } = useItems({
    ...baseFilters,
    status: statusTab !== 'all' && statusTab !== 'LIVE_SELLING' ? statusTab : undefined,
    isLiveSelling: statusTab === 'LIVE_SELLING' ? true : undefined,
  }, { enabled: !skipItemsFetch })

  // Fetch live selling sell groups (only on LIVE_SELLING tab when not filtering to sell-groups-only)
  const { data: liveSellingSellGroups } = useLiveSellingSellGroups(statusTab === 'LIVE_SELLING' && inventoryType !== 'sell-groups')

  // Fetch sell groups for the Group Codes filter or LIVE_SELLING tab sell-groups-only view
  const { data: sellGroupsList, isLoading: sgListLoading } = useSellGroupsForList({
    search: debouncedSearch || undefined,
    grade: gradeFilter && gradeFilter !== 'all' ? gradeFilter : undefined,
    ...(statusTab === 'LIVE_SELLING' ? { isLiveSelling: true } : {}),
  }, { enabled: showUnified && inventoryType === 'sell-groups' })

  // Sell group counts for tab badges
  const { data: sgStatusCounts } = useSellGroupStatusCounts(baseFilters)

  // Fetch accessories for unified view
  const { data: unifiedAccessories, isLoading: unifiedAccLoading } = useAccessories({
    search: debouncedSearch || undefined,
    ...(statusTab === 'AVAILABLE' ? { active: true, inStock: true } : {}),
    ...(statusTab === 'LIVE_SELLING' ? { isLiveSelling: true } : {}),
  }, { enabled: !skipAccFetch })

  const items = (allItems ?? []) as ItemRow[]

  // Derive dropdown options from data
  const categoryOptions = [...new Set(items.map(i => i.product_models?.categories?.name).filter(Boolean))].sort() as string[]
  const brandOptions = [...new Set(items.map(i => i.brand ?? i.product_models?.brand).filter(Boolean))].sort() as string[]

  // Reset category filter if value not in current options
  useEffect(() => {
    if (categoryFilter && categoryFilter !== 'all' && !categoryOptions.includes(categoryFilter)) {
      setCategoryFilter('')
    }
  }, [categoryOptions, categoryFilter, setCategoryFilter])

  // Reset brand filter if value not in current options
  useEffect(() => {
    if (brandFilter && brandFilter !== 'all' && !brandOptions.includes(brandFilter)) {
      setBrandFilter('')
    }
  }, [brandOptions, brandFilter, setBrandFilter])

  // Client-side filtering for filters not passed to the server
  const filteredItems = items.filter(item => {
    if (noSellFilter === 'yes' && item.selling_price != null) return false
    if (categoryFilter && categoryFilter !== 'all' && item.product_models?.categories?.name !== categoryFilter) return false
    if (brandFilter && brandFilter !== 'all' && (item.brand ?? item.product_models?.brand) !== brandFilter) return false
    if (debouncedDescSearch) {
      const descFields = item.product_models?.categories?.description_fields ?? []
      let desc = ''
      if (descFields.length > 0) {
        const resolvedValues: Record<string, unknown> = {}
        for (const key of descFields) {
          resolvedValues[key] = (item as Record<string, unknown>)[key] ?? (item.product_models as Record<string, unknown> | null)?.[key]
        }
        desc = buildShortDescription(resolvedValues, descFields)
      }
      if (!desc) desc = item.supplier_description || ''
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

  // Sort helper for InventoryRow (works for both items and accessories)
  const sortInventoryRows = useCallback((arr: InventoryRow[]): InventoryRow[] => {
    const sorted = [...arr]
    const dir = sortDir === 'asc' ? 1 : -1
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'code': {
          const codeA = a._kind === 'item' ? a.item_code : a._kind === 'accessory' ? a.accessory_code : a.sell_group_code
          const codeB = b._kind === 'item' ? b.item_code : b._kind === 'accessory' ? b.accessory_code : b.sell_group_code
          return dir * codeA.localeCompare(codeB)
        }
        case 'description': {
          const descA = a._kind === 'item' ? getItemDesc(a) : a._kind === 'accessory' ? [a.brand, a.name].filter(Boolean).join(' ') : a._sg_description
          const descB = b._kind === 'item' ? getItemDesc(b) : b._kind === 'accessory' ? [b.brand, b.name].filter(Boolean).join(' ') : b._sg_description
          return dir * descA.localeCompare(descB)
        }
        case 'buy_price': {
          const priceA = a._kind === 'item' ? (a.purchase_price ?? 0) : 0
          const priceB = b._kind === 'item' ? (b.purchase_price ?? 0) : 0
          return dir * (priceA - priceB)
        }
        case 'sell_price': {
          const priceA = a._kind === 'sell-group' ? (a.base_price ?? 0) : (Number(a.selling_price) || 0)
          const priceB = b._kind === 'sell-group' ? (b.base_price ?? 0) : (Number(b.selling_price) || 0)
          return dir * (priceA - priceB)
        }
        case 'date':
        default: return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      }
    })
    return sorted
  }, [sortBy, sortDir])

  // Apply client-side sorting
  const sortedItems = useMemo(() => {
    const sorted = [...filteredItems]
    const dir = sortDir === 'asc' ? 1 : -1
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'code': return dir * a.item_code.localeCompare(b.item_code)
        case 'description': return dir * getItemDesc(a).localeCompare(getItemDesc(b))
        case 'buy_price': return dir * ((a.purchase_price ?? 0) - (b.purchase_price ?? 0))
        case 'sell_price': return dir * ((a.selling_price ?? 0) - (b.selling_price ?? 0))
        case 'date':
        default: return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      }
    })
    return sorted
  }, [filteredItems, sortBy, sortDir])

  // Helper: convert sell group data to tagged InventoryRow[]
  const tagSellGroups = useCallback((sgs: typeof liveSellingSellGroups | typeof sellGroupsList): InventoryRow[] => {
    return (sgs ?? []).map((sg) => {
      const pm = sg.product_models as Record<string, unknown> | null
      const productMedia = ((pm?.product_media ?? []) as Array<{ file_url: string; sort_order: number }>).sort((a, b) => a.sort_order - b.sort_order)
      const thumbnail = productMedia[0]?.file_url
      let description = (pm?.short_description as string) || ''
      if (!description && pm) {
        const parts = [pm.brand, pm.model_name, pm.cpu, pm.ram_gb, pm.storage_gb, pm.screen_size ? `${pm.screen_size}"` : null, pm.color].filter(Boolean)
        description = parts.join(' / ')
      }
      const itemCount = ((sg.sell_group_items as Array<{ count: number }> | null)?.[0] as { count: number } | undefined)?.count ?? 0
      return { ...sg, _kind: 'sell-group' as const, _sg_description: description, _sg_thumbnail: thumbnail, _sg_item_count: itemCount }
    })
  }, [])

  // Build merged unified data when in unified mode
  const unifiedData: InventoryRow[] = useMemo(() => {
    if (!showUnified || inventoryType === 'products') return []
    if (inventoryType === 'sell-groups') {
      return sortInventoryRows(tagSellGroups(sellGroupsList))
    }
    if (inventoryType === 'accessories') {
      const filtered = ((unifiedAccessories ?? []) as AccessoryRow[])
        .filter((acc) => {
          if (debouncedDescSearch) {
            const accDesc = [acc.brand, acc.name, acc.description].filter(Boolean).join(' ')
            if (!accDesc.toLowerCase().includes(debouncedDescSearch.toLowerCase())) return false
          }
          if (debouncedConditionSearch) {
            if (!acc.condition_notes?.toLowerCase().includes(debouncedConditionSearch.toLowerCase())) return false
          }
          if (categoryFilter && categoryFilter !== 'all' && acc.categories?.name !== categoryFilter) return false
          if (brandFilter && brandFilter !== 'all' && acc.brand !== brandFilter) return false
          const pf = priceFrom ? Number(priceFrom) : null
          const pt = priceTo ? Number(priceTo) : null
          if (pf !== null && (acc.selling_price == null || Number(acc.selling_price) < pf)) return false
          if (pt !== null && (acc.selling_price == null || Number(acc.selling_price) > pt)) return false
          return true
        })
        .map((a) => ({ ...a, _kind: 'accessory' as const }))
      return sortInventoryRows(filtered)
    }
    // inventoryType === 'all': merge all three
    const taggedItems: InventoryRow[] = sortedItems.map((i) => ({ ...i, _kind: 'item' as const }))
    const taggedAcc: InventoryRow[] = ((unifiedAccessories ?? []) as AccessoryRow[])
      .filter((acc) => {
        if (debouncedDescSearch) {
          const accDesc = [acc.brand, acc.name, acc.description].filter(Boolean).join(' ')
          if (!accDesc.toLowerCase().includes(debouncedDescSearch.toLowerCase())) return false
        }
        if (debouncedConditionSearch) {
          if (!acc.condition_notes?.toLowerCase().includes(debouncedConditionSearch.toLowerCase())) return false
        }
        if (categoryFilter && categoryFilter !== 'all' && acc.categories?.name !== categoryFilter) return false
        if (brandFilter && brandFilter !== 'all' && acc.brand !== brandFilter) return false
        const pf = priceFrom ? Number(priceFrom) : null
        const pt = priceTo ? Number(priceTo) : null
        if (pf !== null && (acc.selling_price == null || Number(acc.selling_price) < pf)) return false
        if (pt !== null && (acc.selling_price == null || Number(acc.selling_price) > pt)) return false
        return true
      })
      .map((a) => ({ ...a, _kind: 'accessory' as const }))
    // Add sell groups on LIVE_SELLING tab (from live-selling query)
    const taggedSellGroups = statusTab === 'LIVE_SELLING' ? tagSellGroups(liveSellingSellGroups) : []

    return sortInventoryRows([...taggedItems, ...taggedAcc, ...taggedSellGroups])
  }, [showUnified, inventoryType, sortedItems, unifiedAccessories, sellGroupsList, liveSellingSellGroups, statusTab, categoryFilter, brandFilter, priceFrom, priceTo, debouncedDescSearch, debouncedConditionSearch, sortInventoryRows, tagSellGroups])

  // Unified loading state
  const unifiedIsLoading = showUnified
    ? (inventoryType === 'sell-groups' ? sgListLoading : inventoryType === 'accessories' ? unifiedAccLoading : inventoryType === 'products' ? isLoading : isLoading || unifiedAccLoading)
    : isLoading

  // Helper to open showcase window for a code
  const openShowcase = useCallback((code: string, mode: 'photos' | 'videos') => {
    const ch = new BroadcastChannel('showcase')
    ch.postMessage({ itemCode: code, mediaMode: mode })
    ch.close()
    const w = 720
    const h = 1280
    const left = window.screenX + window.outerWidth
    const top = window.screenY
    const win = window.open('', 'item-showcase', `width=${w},height=${h},left=${left},top=${top}`)
    if (!win || !win.location.pathname?.startsWith('/admin/showcase')) {
      win?.location.assign(`/admin/showcase?item=${code}&mode=${mode}`)
    }
  }, [])

  const showLiveSellingCheckbox = statusTab === 'AVAILABLE' || statusTab === 'LIVE_SELLING'

  // Unified columns for when inventoryType === 'all'
  const unifiedColumns: ColumnDef<InventoryRow>[] = useMemo(() => [
    ...(showLiveSellingCheckbox ? [{
      id: 'live_selling',
      header: () => <Star className="h-4 w-4 text-muted-foreground" />,
      size: 40,
      cell: ({ row }: { row: { original: InventoryRow } }) => {
        const r = row.original
        if (r._kind === 'accessory') {
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={!!r.is_live_selling}
                onCheckedChange={(checked) => {
                  toggleAccessoryLiveSelling.mutate({
                    accessoryIds: [r.id],
                    value: !!checked,
                  })
                }}
              />
            </div>
          )
        }
        if (r._kind === 'sell-group') {
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={!!r.is_live_selling}
                onCheckedChange={(checked) => {
                  toggleSellGroupLiveSelling.mutate({
                    sellGroupId: r.id,
                    value: !!checked,
                  })
                }}
              />
            </div>
          )
        }
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={!!r.is_live_selling}
              onCheckedChange={(checked) => {
                toggleLiveSelling.mutate({
                  itemIds: [r.id],
                  value: !!checked,
                })
              }}
            />
          </div>
        )
      },
    } as ColumnDef<InventoryRow>] : []),
    {
      id: 'unified_summary',
      header: 'Item',
      size: 480,
      minSize: 200,
      maxSize: 900,
      cell: ({ row }) => {
        const r = row.original
        if (r._kind === 'accessory') {
          const brandName = [r.brand, r.name].filter(Boolean).join(' ')
          return (
            <div className="flex items-center gap-3">
              {r.accessory_media?.[0] ? (
                <img
                  src={r.accessory_media[0].file_url}
                  alt={r.name}
                  className="h-10 w-10 rounded border bg-muted flex-shrink-0 object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded border bg-muted flex-shrink-0 flex items-center justify-center text-muted-foreground text-xs">—</div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CodeDisplay code={r.accessory_code} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Copy Mine link"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(`${window.location.origin}/mine/${r.accessory_code}`)
                      toast.success('Mine link copied')
                    }}
                  >
                    <Link2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Showcase Photos"
                    onClick={(e) => { e.stopPropagation(); openShowcase(r.accessory_code, 'photos') }}
                  >
                    <Image className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Showcase Videos"
                    onClick={(e) => { e.stopPropagation(); openShowcase(r.accessory_code, 'videos') }}
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">{brandName || '—'}</div>
              </div>
            </div>
          )
        }
        if (r._kind === 'sell-group') {
          return (
            <div className="flex items-center gap-3">
              {r._sg_thumbnail ? (
                <img
                  src={r._sg_thumbnail}
                  alt={r.sell_group_code}
                  className="h-10 w-10 rounded border bg-muted flex-shrink-0 object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded border bg-muted flex-shrink-0 flex items-center justify-center text-muted-foreground text-xs">—</div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CodeDisplay code={r.sell_group_code} />
                  <GradeBadge grade={r.condition_grade as ConditionGrade} />
                  <Badge variant="secondary" className="text-xs">{r._sg_item_count} item{r._sg_item_count !== 1 ? 's' : ''}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Copy Mine link"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(`${window.location.origin}/mine/${r.sell_group_code}`)
                      toast.success('Mine link copied')
                    }}
                  >
                    <Link2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Showcase Photos"
                    onClick={(e) => { e.stopPropagation(); openShowcase(r.sell_group_code, 'photos') }}
                  >
                    <Image className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Showcase Videos"
                    onClick={(e) => { e.stopPropagation(); openShowcase(r.sell_group_code, 'videos') }}
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground truncate">{r._sg_description || '—'}</div>
              </div>
            </div>
          )
        }
        // Item rendering (same as existing columns)
        const pm = r.product_models
        const descFields = pm?.categories?.description_fields
        let modelLine: string
        if (descFields && descFields.length > 0) {
          const resolvedValues: Record<string, unknown> = {}
          for (const key of descFields) {
            resolvedValues[key] = (r as Record<string, unknown>)[key] ?? (pm as Record<string, unknown> | null)?.[key]
          }
          modelLine = buildShortDescription(resolvedValues, descFields) || r.supplier_description || '—'
        } else {
          const { brand, model_name, cpu, ram_gb, storage_gb, screen_size } = r
          const modelName = brand && model_name
            ? `${brand} ${model_name}`
            : pm ? `${pm.brand} ${pm.model_name}` : null
          const screenVal = screen_size ?? pm?.screen_size
          const parts = [modelName, cpu, ram_gb, storage_gb, screenVal ? `${screenVal}"` : null].filter(Boolean)
          modelLine = parts.length > 0 ? parts.join(' / ') : (r.supplier_description || '—')
        }
        const media = (pm?.product_media ?? []).sort((a, b) => a.sort_order - b.sort_order)
        const thumbUrl = (media.find(m => m.role === 'hero') ?? media[0])?.file_url
        const productLink = r.product_id ? `/admin/products/${r.product_id}` : null

        return (
          <div className="flex items-center gap-3">
            {productLink ? (
              <Link
                to={productLink}
                onClick={(e) => e.stopPropagation()}
                className="h-10 w-10 rounded border bg-muted flex-shrink-0 overflow-hidden hover:ring-2 hover:ring-primary/50 transition-shadow"
                title="Go to product model"
              >
                {thumbUrl ? (
                  <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">—</div>
                )}
              </Link>
            ) : (
              <div className="h-10 w-10 rounded border bg-muted flex-shrink-0 overflow-hidden">
                <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">—</div>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CodeDisplay code={r.item_code} />
                <GradeBadge grade={r.condition_grade as never} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Copy item info"
                  onClick={(e) => {
                    e.stopPropagation()
                    const text = [
                      r.item_code,
                      modelLine !== '—' ? modelLine : '',
                      r.condition_grade ? `Rank ${r.condition_grade}` : '',
                      r.selling_price != null ? formatPrice(r.selling_price) : '',
                    ].filter(Boolean).join(' | ')
                    navigator.clipboard.writeText(text)
                    toast.success('Copied to clipboard')
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Copy Mine link"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigator.clipboard.writeText(`${window.location.origin}/mine/${r.item_code}`)
                    toast.success('Mine link copied')
                  }}
                >
                  <Link2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Showcase Photos"
                  onClick={(e) => { e.stopPropagation(); openShowcase(r.item_code, 'photos') }}
                >
                  <Image className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Showcase Videos"
                  onClick={(e) => { e.stopPropagation(); openShowcase(r.item_code, 'videos') }}
                >
                  <Play className="h-3 w-3" />
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">{modelLine}</div>
              {r.condition_notes && (
                <div className="text-xs text-muted-foreground">{r.condition_notes}</div>
              )}
            </div>
          </div>
        )
      },
    },
    {
      id: 'unified_status',
      header: 'Status',
      size: 90,
      cell: ({ row }) => {
        const r = row.original
        if (r._kind === 'accessory') {
          const qty = r.stock_quantity
          const threshold = r.low_stock_threshold
          if (qty === 0) return <Badge variant="destructive">Out of Stock</Badge>
          if (qty <= threshold) return <Badge variant="outline" className="text-yellow-700 border-yellow-400 bg-yellow-50">Low Stock ({qty})</Badge>
          return <Badge variant="outline" className="text-green-700 border-green-400">In Stock ({qty})</Badge>
        }
        if (r._kind === 'sell-group') {
          return r.active ? <Badge variant="outline" className="text-green-700 border-green-400">Active</Badge> : <Badge variant="outline">Inactive</Badge>
        }
        const config = ITEM_STATUSES.find((s) => s.value === r.item_status)
        return config ? <StatusBadge label={config.label} color={config.color} /> : r.item_status
      },
    },
    {
      id: 'unified_supplier',
      header: 'Supplier',
      size: 90,
      cell: ({ row }) => {
        const r = row.original
        if (r._kind !== 'item') return <span className="text-muted-foreground">—</span>
        return r.suppliers?.supplier_name ?? '—'
      },
    },
    {
      id: 'unified_amount',
      header: 'Amount',
      size: 110,
      cell: ({ row }) => {
        const r = row.original
        if (r._kind !== 'item') {
          if (r._kind === 'accessory') return <PriceDisplay amount={Number(r.selling_price)} />
          if (r._kind === 'sell-group') return <PriceDisplay amount={r.base_price} />
          return <span className="text-muted-foreground">—</span>
        }
        const buy = r.purchase_price ?? 0
        const sell = r.selling_price ?? 0
        const disc = r.discount ?? 0
        const profit = sell - disc - buy
        return (
          <div className="flex flex-col gap-0 text-xs leading-tight" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-1">
              <span className="text-muted-foreground">Buy</span>
              <PriceDisplay amount={r.purchase_price} className="text-xs" />
            </div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-muted-foreground flex items-center gap-0.5">Sell <EditPriceCell itemId={r.id} itemCode={r.item_code} field="selling_price" value={r.selling_price} updateItem={updateItem} /></span>
              <PriceDisplay amount={r.selling_price} className="text-xs" />
            </div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-muted-foreground flex items-center gap-0.5">Disc <EditPriceCell itemId={r.id} itemCode={r.item_code} field="discount" value={r.discount} updateItem={updateItem} /></span>
              <PriceDisplay amount={r.discount} className="text-xs" />
            </div>
            <div className={cn('flex items-center justify-between gap-1 font-medium', profit >= 0 ? 'text-green-600' : 'text-red-500')}>
              <span>Profit</span>
              <PriceDisplay amount={profit} className="text-xs" />
            </div>
          </div>
        )
      },
    },
    {
      id: 'unified_sold_to',
      header: 'Sold To',
      size: 180,
      cell: ({ row }) => {
        const r = row.original
        if (r._kind !== 'item') return <span className="text-xs text-muted-foreground">—</span>
        const soldTo = resolveSoldTo(r.order_items)
        if (!soldTo) return <span className="text-xs text-muted-foreground">—</span>
        return (
          <div onClick={(e) => e.stopPropagation()} className="text-sm leading-tight">
            <Link to={`/admin/customers/${soldTo.customer.id}`} className="font-medium text-primary hover:underline">{formatCustomerName(soldTo.customer)}</Link>
            <div className="text-xs text-muted-foreground">
              {soldTo.customer.customer_code} ·{' '}
              <Link to={`/admin/orders/${soldTo.orderId}`} className="hover:underline">{soldTo.orderCode}</Link>
            </div>
          </div>
        )
      },
    },
    {
      id: 'unified_date',
      header: 'Date',
      size: 75,
      cell: ({ row }) => formatDate(row.original.created_at),
    },
    {
      id: 'unified_actions',
      header: 'Actions',
      size: 40,
      cell: ({ row }) => {
        const r = row.original
        if (r._kind !== 'item') return null
        const pm = r.product_models
        const descFields = pm?.categories?.description_fields ?? []
        const resolvedValues: Record<string, unknown> = {}
        for (const key of descFields) {
          resolvedValues[key] = (r as Record<string, unknown>)[key] ?? (pm as Record<string, unknown> | null)?.[key]
        }
        const desc = buildShortDescription(resolvedValues, descFields) || r.supplier_description || undefined
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Print label"
            onClick={(e) => {
              e.stopPropagation()
              printItemLabel({ item_code: r.item_code, description: desc })
            }}
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
        )
      },
    },
  ], [updateItem, openShowcase, showLiveSellingCheckbox, toggleLiveSelling, toggleAccessoryLiveSelling, toggleSellGroupLiveSelling])


  const columns: ColumnDef<ItemRow>[] = [
    ...(showLiveSellingCheckbox ? [{
      id: 'live_selling',
      header: () => <Star className="h-4 w-4 text-muted-foreground" />,
      size: 40,
      cell: ({ row }: { row: { original: ItemRow } }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={!!row.original.is_live_selling}
            onCheckedChange={(checked) => {
              toggleLiveSelling.mutate({
                itemIds: [row.original.id],
                value: !!checked,
              })
            }}
          />
        </div>
      ),
    } as ColumnDef<ItemRow>] : []),
    {
      id: 'item_summary',
      header: 'Item',
      size: 480,
      minSize: 200,
      maxSize: 900,
      cell: ({ row }) => {
        const r = row.original
        const pm = r.product_models
        const descFields = pm?.categories?.description_fields
        let modelLine: string
        if (descFields && descFields.length > 0) {
          const resolvedValues: Record<string, unknown> = {}
          for (const key of descFields) {
            resolvedValues[key] = (r as Record<string, unknown>)[key] ?? (pm as Record<string, unknown> | null)?.[key]
          }
          modelLine = buildShortDescription(resolvedValues, descFields) || r.supplier_description || '—'
        } else {
          const { brand, model_name, cpu, ram_gb, storage_gb, screen_size } = r
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
          modelLine = parts.length > 0 ? parts.join(' / ') : (r.supplier_description || '—')
        }

        // Get thumbnail from product_media only (hero first, then any by sort_order)
        const media = (pm?.product_media ?? []).sort((a, b) => a.sort_order - b.sort_order)
        const thumbUrl = (media.find(m => m.role === 'hero') ?? media[0])?.file_url

        const productLink = r.product_id ? `/admin/products/${r.product_id}` : null

        return (
          <div className="flex items-center gap-3">
            {productLink ? (
              <Link
                to={productLink}
                onClick={(e) => e.stopPropagation()}
                className="h-10 w-10 rounded border bg-muted flex-shrink-0 overflow-hidden hover:ring-2 hover:ring-primary/50 transition-shadow"
                title="Go to product model"
              >
                {thumbUrl ? (
                  <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">—</div>
                )}
              </Link>
            ) : (
              <div className="h-10 w-10 rounded border bg-muted flex-shrink-0 overflow-hidden">
                <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">—</div>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CodeDisplay code={r.item_code} />
                <GradeBadge grade={r.condition_grade as never} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Copy item info"
                  onClick={(e) => {
                    e.stopPropagation()
                    const text = [
                      r.item_code,
                      modelLine !== '—' ? modelLine : '',
                      r.condition_grade ? `Rank ${r.condition_grade}` : '',
                      r.selling_price != null ? formatPrice(r.selling_price) : '',
                    ].filter(Boolean).join(' | ')
                    navigator.clipboard.writeText(text)
                    toast.success('Copied to clipboard')
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Copy Mine link"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigator.clipboard.writeText(`${window.location.origin}/mine/${r.item_code}`)
                    toast.success('Mine link copied')
                  }}
                >
                  <Link2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Showcase Photos"
                  onClick={(e) => {
                    e.stopPropagation()
                    const ch = new BroadcastChannel('showcase')
                    ch.postMessage({ itemCode: r.item_code, mediaMode: 'photos' })
                    ch.close()
                    const w = 720
                    const h = 1280
                    const left = window.screenX + window.outerWidth
                    const top = window.screenY
                    const win = window.open('', 'item-showcase', `width=${w},height=${h},left=${left},top=${top}`)
                    if (!win || !win.location.pathname?.startsWith('/admin/showcase')) {
                      win?.location.assign(`/admin/showcase?item=${r.item_code}&mode=photos`)
                    }
                  }}
                >
                  <Image className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Showcase Videos"
                  onClick={(e) => {
                    e.stopPropagation()
                    const ch = new BroadcastChannel('showcase')
                    ch.postMessage({ itemCode: r.item_code, mediaMode: 'videos' })
                    ch.close()
                    const w = 720
                    const h = 1280
                    const left = window.screenX + window.outerWidth
                    const top = window.screenY
                    const win = window.open('', 'item-showcase', `width=${w},height=${h},left=${left},top=${top}`)
                    if (!win || !win.location.pathname?.startsWith('/admin/showcase')) {
                      win?.location.assign(`/admin/showcase?item=${r.item_code}&mode=videos`)
                    }
                  }}
                >
                  <Play className="h-3 w-3" />
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">{modelLine}</div>
              {r.condition_notes && (
                <div className="text-xs text-muted-foreground">{r.condition_notes}</div>
              )}
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'item_status',
      header: 'Status',
      size: 70,
      cell: ({ row }) => {
        const config = ITEM_STATUSES.find((s) => s.value === row.original.item_status)
        return config ? <StatusBadge label={config.label} color={config.color} /> : row.original.item_status
      },
    },
    {
      id: 'supplier',
      header: 'Supplier',
      size: 90,
      cell: ({ row }) => row.original.suppliers?.supplier_name ?? '—',
    },
    {
      id: 'amount',
      header: 'Amount',
      size: 110,
      cell: ({ row }) => {
        const r = row.original
        const buy = r.purchase_price ?? 0
        const sell = r.selling_price ?? 0
        const disc = r.discount ?? 0
        const profit = sell - disc - buy
        return (
          <div className="flex flex-col gap-0 text-xs leading-tight" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-1">
              <span className="text-muted-foreground">Buy</span>
              <PriceDisplay amount={r.purchase_price} className="text-xs" />
            </div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-muted-foreground flex items-center gap-0.5">Sell <EditPriceCell itemId={r.id} itemCode={r.item_code} field="selling_price" value={r.selling_price} updateItem={updateItem} /></span>
              <PriceDisplay amount={r.selling_price} className="text-xs" />
            </div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-muted-foreground flex items-center gap-0.5">Disc <EditPriceCell itemId={r.id} itemCode={r.item_code} field="discount" value={r.discount} updateItem={updateItem} /></span>
              <PriceDisplay amount={r.discount} className="text-xs" />
            </div>
            <div className={cn('flex items-center justify-between gap-1 font-medium', profit >= 0 ? 'text-green-600' : 'text-red-500')}>
              <span>Profit</span>
              <PriceDisplay amount={profit} className="text-xs" />
            </div>
          </div>
        )
      },
    },
    {
      id: 'sold_to',
      header: 'Customer Details',
      size: 220,
      cell: ({ row }) => {
        const soldTo = resolveSoldTo(row.original.order_items)
        if (!soldTo) return <span className="text-xs text-muted-foreground">—</span>
        return (
          <div onClick={(e) => e.stopPropagation()} className="text-sm leading-tight">
            <Link
              to={`/admin/customers/${soldTo.customer.id}`}
              className="font-medium text-primary hover:underline"
            >
              {formatCustomerName(soldTo.customer)}
            </Link>
            <div className="text-xs text-muted-foreground">
              <Link to={`/admin/orders/${soldTo.orderId}`} className="hover:underline">
                {soldTo.orderCode}
              </Link>
              {' · '}
              <span className={soldTo.orderStatus === 'CONFIRMED' ? 'text-green-600' : ''}>
                {soldTo.orderStatus}
              </span>
            </div>
            {(soldTo.customer.email || soldTo.customer.phone) && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {soldTo.customer.email && <div>{soldTo.customer.email}</div>}
                {soldTo.customer.phone && <div>{soldTo.customer.phone}</div>}
              </div>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Intake Date',
      size: 75,
      cell: ({ row }) => formatDate(row.original.created_at),
    },
    {
      id: 'actions',
      header: 'Actions',
      size: 40,
      cell: ({ row }) => {
        const r = row.original
        const pm = r.product_models
        const descFields = pm?.categories?.description_fields ?? []
        const resolvedValues: Record<string, unknown> = {}
        for (const key of descFields) {
          resolvedValues[key] = (r as Record<string, unknown>)[key] ?? (pm as Record<string, unknown> | null)?.[key]
        }
        const desc = buildShortDescription(resolvedValues, descFields) || r.supplier_description || undefined
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Print label"
            onClick={(e) => {
              e.stopPropagation()
              printItemLabel({ item_code: r.item_code, description: desc })
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
        title="Inventory"
        description={inventoryTab === 'accessories' ? 'Manage quantity-based inventory items.' : 'All inventory — products (P-codes) and accessories (A-codes).'}
        actions={
          inventoryTab === 'accessories' ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Accessory
            </Button>
          ) : (
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
          )
        }
      />

      {/* Inventory Type Tabs */}
      <div className="border-b">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {INVENTORY_TABS.map((tab) => {
            const isActive = inventoryTab === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setInventoryTab(tab.value)}
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

      {inventoryTab === 'accessories' ? (
        <>
          {/* Accessories Search & Filters */}
          <div className="flex items-center gap-3">
            <SearchBar
              value={accSearch}
              onChange={setAccSearch}
              placeholder="Search A-code, name, or brand..."
              className="flex-1 max-w-md"
            />
            <Select value={accCategoryFilter} onValueChange={(v) => setParam('accCategory', v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {accLoading ? (
            <TableSkeleton />
          ) : (
            <DataTable
              columns={accessoryColumns}
              data={(accessories ?? []) as AccessoryRow[]}
              onRowClick={(row) => navigate(`/admin/accessories/${row.id}`)}
            />
          )}

          {/* Create Accessory Dialog */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Accessory</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Name *</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="USB-C Cable" />
                </div>
                <div>
                  <Label>Brand</Label>
                  <Input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="Anker" />
                </div>
                <div>
                  <Label>Selling Price (¥) *</Label>
                  <Input type="number" min={0} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {(categories ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={newShopVisible} onCheckedChange={setNewShopVisible} />
                  <Label>Visible on shop</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateAccessory} disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <>
          {/* Status Tabs */}
          <div className="border-b">
            <nav className="flex gap-0 -mb-px overflow-x-auto">
              {STATUS_TABS.map((tab) => {
                let count = statusCounts[tab.value] ?? 0
                // Add accessory counts to All, Available, and LiveSelling tabs when not filtering to products-only
                if (inventoryType !== 'products' && inventoryType !== 'sell-groups' && accTabCounts) {
                  if (tab.value === 'all') count += accTabCounts.all
                  else if (tab.value === 'AVAILABLE') count += accTabCounts.available
                }
                // Add sell group counts
                if (inventoryType !== 'products' && inventoryType !== 'accessories' && sgStatusCounts) {
                  if (tab.value === 'all') count += sgStatusCounts.all
                  else if (tab.value === 'AVAILABLE') count += sgStatusCounts.available
                }
                if (tab.value === 'LIVE_SELLING') {
                  if (inventoryType !== 'products' && inventoryType !== 'sell-groups') count += accLiveSellingCount
                  if (inventoryType !== 'products' && inventoryType !== 'accessories') count += sgLiveSellingCount
                }
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

          {/* Inventory Type Filter — only on All & Available tabs */}
          {showUnified && (
            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
              {INVENTORY_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setInventoryType(opt.value)}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                    inventoryType === opt.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder={inventoryType === 'sell-groups' ? 'Search G-code...' : showUnified && inventoryType !== 'products' ? 'Search P-code, A-code, name...' : 'Search P-code...'}
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
            <Select value={`${sortBy}-${sortDir}`} onValueChange={setSortValue}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
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
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {isGCodeSearch && sgLoading ? (
            <TableSkeleton rows={4} columns={9} />
          ) : isGCodeSearch && sellGroupResult ? (
            <SellGroupResultBlock
              sellGroup={sellGroupResult}
              onShowcase={openShowcase}
              showLiveSellingToggle={showLiveSellingCheckbox}
              onToggleLiveSelling={(id, val) => toggleSellGroupLiveSelling.mutate({ sellGroupId: id, value: val })}
            />
          ) : isGCodeSearch && !sgLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              No sell group found for "{debouncedSearch?.trim()}"
            </div>
          ) : unifiedIsLoading ? (
            <TableSkeleton rows={8} columns={Object.values(columnVisibility).filter(Boolean).length || 9} />
          ) : showUnified && inventoryType === 'all' ? (
            <DataTable
              columns={unifiedColumns}
              data={unifiedData}
              enableColumnResizing
              onRowClick={(row) => {
                if (row._kind === 'accessory') navigate(`/admin/accessories/${row.id}`)
                else if (row._kind === 'sell-group') { /* no-op for sell groups */ }
                else navigate(`/admin/items/${row.id}`)
              }}
            />
          ) : showUnified && inventoryType === 'sell-groups' ? (
            <DataTable
              columns={unifiedColumns}
              data={unifiedData}
              enableColumnResizing
              onRowClick={() => { /* no-op for sell groups */ }}
            />
          ) : showUnified && inventoryType === 'accessories' ? (
            <DataTable
              columns={[
                ...(showLiveSellingCheckbox ? [{
                  id: 'live_selling',
                  header: () => <Star className="h-4 w-4 text-muted-foreground" />,
                  size: 40,
                  cell: ({ row }: { row: { original: AccessoryRow } }) => (
                    <div onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <Checkbox
                        checked={!!row.original.is_live_selling}
                        onCheckedChange={(checked: boolean) => {
                          toggleAccessoryLiveSelling.mutate({
                            accessoryIds: [row.original.id],
                            value: !!checked,
                          })
                        }}
                      />
                    </div>
                  ),
                } as ColumnDef<AccessoryRow>] : []),
                ...accessoryColumns,
              ]}
              data={(unifiedAccessories ?? []) as AccessoryRow[]}
              onRowClick={(row) => navigate(`/admin/accessories/${row.id}`)}
            />
          ) : (
            <DataTable
              columns={columns}
              data={sortedItems}
              columnVisibility={columnVisibility}
              enableColumnResizing
              onRowClick={(row) => navigate(`/admin/items/${row.id}`)}
            />
          )}
        </>
      )}
    </div>
  )
}
