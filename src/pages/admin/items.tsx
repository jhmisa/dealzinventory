import { useState, useMemo, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Printer, QrCode, Pencil, Copy, AlertTriangle, Image, Play, Star } from 'lucide-react'
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
import { useItems, useUpdateItem, useItemStatusCounts, useToggleLiveSelling } from '@/hooks/use-items'
import { useAccessories, useCreateAccessory, useAccessoryTabCounts, useToggleAccessoryLiveSelling, useAccessoryLiveSellingCount } from '@/hooks/use-accessories'
import { useCategories } from '@/hooks/use-categories'
import { useItemListColumnSettings } from '@/hooks/use-settings'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { useDebounce } from '@/hooks/use-debounce'
import { ITEM_STATUSES, CONDITION_GRADES } from '@/lib/constants'
import { formatDate, formatPrice, cn, buildShortDescription } from '@/lib/utils'
import { toast } from 'sonner'
import { printItemLabel } from '@/components/items/label-print'
import { resolveSoldTo } from '@/lib/item-sale'
import type { Accessory, AccessoryMedia } from '@/lib/types'

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

type InventoryRow =
  | (ItemRow & { _kind: 'item' })
  | (AccessoryRow & { _kind: 'accessory' })

type InventoryTypeFilter = 'all' | 'products' | 'accessories'

const INVENTORY_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'products', label: 'Products' },
  { value: 'accessories', label: 'Accessories' },
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
  const toggleLiveSelling = useToggleLiveSelling()
  const toggleAccessoryLiveSelling = useToggleAccessoryLiveSelling()
  const { getParam, setParam } = usePersistedFilters('items-filters')

  // Inventory type tab (items vs accessories)
  const inventoryTab = getParam('inventoryTab', 'items') as 'items' | 'accessories'
  const setInventoryTab = useCallback((v: string) => setParam('inventoryTab', v, 'items'), [setParam])

  // Inventory type filter (within Items tab, for All & Available sub-tabs)
  const inventoryType = (getParam('invType', 'all') || 'all') as InventoryTypeFilter
  const setInventoryType = useCallback((v: string) => setParam('invType', v, 'all'), [setParam])

  // Accessory tab counts for badges
  const { data: accTabCounts } = useAccessoryTabCounts()
  const { data: accLiveSellingCount = 0 } = useAccessoryLiveSellingCount()

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
  const ALL_COLUMN_IDS = ['item_summary', 'item_status', 'supplier', 'purchase_price', 'selling_price', 'discount', 'sold_to', 'created_at', 'actions']
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
  const skipItemsFetch = showUnified && inventoryType === 'accessories'
  const skipAccFetch = !showUnified || inventoryType === 'products'

  // Fetch items filtered by active status tab
  const { data: allItems, isLoading } = useItems({
    ...baseFilters,
    status: statusTab !== 'all' && statusTab !== 'LIVE_SELLING' ? statusTab : undefined,
    isLiveSelling: statusTab === 'LIVE_SELLING' ? true : undefined,
  }, { enabled: !skipItemsFetch })

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

  // Build merged unified data when in unified mode
  const unifiedData: InventoryRow[] = useMemo(() => {
    if (!showUnified || inventoryType === 'products') return []
    if (inventoryType === 'accessories') {
      return ((unifiedAccessories ?? []) as AccessoryRow[])
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
    }
    // inventoryType === 'all': merge both
    const taggedItems: InventoryRow[] = filteredItems.map((i) => ({ ...i, _kind: 'item' as const }))
    const taggedAcc: InventoryRow[] = ((unifiedAccessories ?? []) as AccessoryRow[])
      .filter((acc) => {
        // Apply client-side filters that also apply to accessories
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
    return [...taggedItems, ...taggedAcc].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [showUnified, inventoryType, filteredItems, unifiedAccessories, categoryFilter, brandFilter, priceFrom, priceTo, debouncedDescSearch, debouncedConditionSearch])

  // Unified loading state
  const unifiedIsLoading = showUnified
    ? (inventoryType === 'accessories' ? unifiedAccLoading : inventoryType === 'products' ? isLoading : isLoading || unifiedAccLoading)
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
        return r._kind === 'item' ? (r.suppliers?.supplier_name ?? '—') : '—'
      },
    },
    {
      id: 'unified_buy_price',
      header: 'Buy',
      size: 65,
      cell: ({ row }) => {
        const r = row.original
        return r._kind === 'item' ? <PriceDisplay amount={r.purchase_price} /> : <span className="text-muted-foreground">—</span>
      },
    },
    {
      id: 'unified_sell_price',
      header: 'Sell',
      size: 65,
      cell: ({ row }) => {
        const r = row.original
        if (r._kind === 'accessory') return <PriceDisplay amount={Number(r.selling_price)} />
        return (
          <EditPriceCell
            itemId={r.id}
            itemCode={r.item_code}
            field="selling_price"
            value={r.selling_price}
            updateItem={updateItem}
          />
        )
      },
    },
    {
      id: 'unified_discount',
      header: 'Discount',
      size: 65,
      cell: ({ row }) => {
        const r = row.original
        if (r._kind === 'accessory') return <span className="text-muted-foreground">—</span>
        return (
          <EditPriceCell
            itemId={r.id}
            itemCode={r.item_code}
            field="discount"
            value={r.discount}
            updateItem={updateItem}
          />
        )
      },
    },
    {
      id: 'unified_sold_to',
      header: 'Sold To',
      size: 180,
      cell: ({ row }) => {
        const r = row.original
        if (r._kind === 'accessory') return <span className="text-xs text-muted-foreground">—</span>
        const soldTo = resolveSoldTo(r.order_items)
        if (!soldTo) return <span className="text-xs text-muted-foreground">—</span>
        const fullName = `${soldTo.customer.last_name} ${soldTo.customer.first_name ?? ''}`.trim()
        return (
          <div onClick={(e) => e.stopPropagation()} className="text-sm leading-tight">
            <Link to={`/admin/customers/${soldTo.customer.id}`} className="font-medium text-primary hover:underline">{fullName}</Link>
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
        if (r._kind === 'accessory') return null
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
  ], [updateItem, openShowcase, showLiveSellingCheckbox, toggleLiveSelling, toggleAccessoryLiveSelling])


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
      accessorKey: 'purchase_price',
      header: 'Buy',
      size: 65,
      cell: ({ row }) => <PriceDisplay amount={row.original.purchase_price} />,
    },
    {
      id: 'selling_price',
      accessorFn: (row) => row.selling_price,
      header: 'Sell',
      size: 65,
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
      size: 65,
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
      id: 'sold_to',
      header: 'Sold To',
      size: 180,
      cell: ({ row }) => {
        const soldTo = resolveSoldTo(row.original.order_items)
        if (!soldTo) return <span className="text-xs text-muted-foreground">—</span>
        const fullName = `${soldTo.customer.last_name} ${soldTo.customer.first_name ?? ''}`.trim()
        return (
          <div onClick={(e) => e.stopPropagation()} className="text-sm leading-tight">
            <Link
              to={`/admin/customers/${soldTo.customer.id}`}
              className="font-medium text-primary hover:underline"
            >
              {fullName}
            </Link>
            <div className="text-xs text-muted-foreground">
              {soldTo.customer.customer_code} ·{' '}
              <Link to={`/admin/orders/${soldTo.orderId}`} className="hover:underline">
                {soldTo.orderCode}
              </Link>
            </div>
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
                if (inventoryType !== 'products' && accTabCounts) {
                  if (tab.value === 'all') count += accTabCounts.all
                  else if (tab.value === 'AVAILABLE') count += accTabCounts.available
                }
                if (inventoryType !== 'products' && tab.value === 'LIVE_SELLING') {
                  count += accLiveSellingCount
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
              placeholder={showUnified && inventoryType !== 'products' ? 'Search P-code, A-code, name...' : 'Search P-code...'}
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

          {unifiedIsLoading ? (
            <TableSkeleton rows={8} columns={Object.values(columnVisibility).filter(Boolean).length || 9} />
          ) : showUnified && inventoryType === 'all' ? (
            <DataTable
              columns={unifiedColumns}
              data={unifiedData}
              enableColumnResizing
              onRowClick={(row) => {
                if (row._kind === 'accessory') navigate(`/admin/accessories/${row.id}`)
                else navigate(`/admin/items/${row.id}`)
              }}
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
              data={filteredItems}
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
