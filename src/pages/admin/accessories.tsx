import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { type ColumnDef } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader, SearchBar, DataTable, TableSkeleton } from '@/components/shared'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { useDebounce } from '@/hooks/use-debounce'
import { useAccessories, useCreateAccessory } from '@/hooks/use-accessories'
import { useCategories } from '@/hooks/use-categories'
import { formatPrice, formatDate } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { Accessory, AccessoryMedia } from '@/lib/types'

type AccessoryRow = Accessory & {
  categories: { name: string } | null
  accessory_media: AccessoryMedia[]
}

const columns: ColumnDef<AccessoryRow>[] = [
  {
    accessorKey: 'accessory_code',
    header: 'A-Code',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.accessory_code}</span>
    ),
  },
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        {row.original.accessory_media?.[0] ? (
          <img
            src={row.original.accessory_media[0].file_url}
            alt={row.original.name}
            className="w-8 h-8 rounded object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded bg-muted" />
        )}
        <span className="font-medium">{row.original.name}</span>
      </div>
    ),
  },
  {
    accessorKey: 'brand',
    header: 'Brand',
    cell: ({ row }) => row.original.brand ?? '—',
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

export default function AccessoryListPage() {
  const navigate = useNavigate()
  const { getParam, setParam } = usePersistedFilters('accessories-filters')
  const search = getParam('q')
  const categoryFilter = getParam('category') || 'all'
  const debouncedSearch = useDebounce(search, 400)
  const setSearch = (v: string) => setParam('q', v)

  const { data: accessories, isLoading } = useAccessories({
    search: debouncedSearch || undefined,
    categoryId: categoryFilter !== 'all' ? categoryFilter : undefined,
  })
  const { data: categories } = useCategories()
  const createMutation = useCreateAccessory()

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBrand, setNewBrand] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newShopVisible, setNewShopVisible] = useState(false)

  function handleCreate() {
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accessories"
        description="Manage quantity-based inventory items."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Accessory
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search A-code, name, or brand..."
          className="flex-1 max-w-md"
        />
        <Select value={categoryFilter} onValueChange={(v) => setParam('category', v)}>
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

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <DataTable
          columns={columns}
          data={accessories ?? []}
          onRowClick={(row) => navigate(`/admin/accessories/${row.id}`)}
        />
      )}

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
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
