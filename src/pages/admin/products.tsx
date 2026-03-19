import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, ImageOff, VideoOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { PageHeader, SearchBar, DataTable, TableSkeleton } from '@/components/shared'
import { ProductForm } from '@/components/items/product-form'
import { useProductModels, useCreateProductModel } from '@/hooks/use-product-models'
import { useCategories } from '@/hooks/use-categories'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'
import type { ProductModelWithCounts } from '@/lib/types'
import type { ProductModelFormValues } from '@/validators/product-model'

type ProductRow = ProductModelWithCounts & {
  photo_count: number
  video_count: number
  categories?: { name: string } | null
}

const columns: ColumnDef<ProductRow>[] = [
  {
    id: 'category',
    header: 'Category',
    cell: ({ row }) => {
      const cat = row.original.categories
      return cat?.name ? (
        <span className="text-xs bg-muted px-2 py-0.5 rounded">{cat.name}</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )
    },
  },
  {
    accessorKey: 'brand',
    header: 'Brand',
    cell: ({ row }) => <span className="font-medium">{row.original.brand}</span>,
  },
  {
    accessorKey: 'model_name',
    header: 'Model',
  },
  {
    id: 'short_description',
    header: 'Description',
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs line-clamp-1">
        {row.original.short_description || '—'}
      </span>
    ),
  },
  {
    id: 'photos',
    header: 'Photos',
    cell: ({ row }) => {
      const count = row.original.photo_count
      return (
        <span className={cn('text-sm', count === 0 && 'text-red-500 font-medium')}>
          {count}
        </span>
      )
    },
  },
  {
    id: 'videos',
    header: 'Videos',
    cell: ({ row }) => {
      const count = row.original.video_count
      return (
        <span className={cn('text-sm', count === 0 && 'text-red-500 font-medium')}>
          {count}
        </span>
      )
    },
  },
]

export default function ProductListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 400)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [mediaFilter, setMediaFilter] = useState<string>('all')
  const [formOpen, setFormOpen] = useState(false)

  const { data: categories } = useCategories()
  const { data: products, isLoading } = useProductModels({
    search: debouncedSearch || undefined,
    categoryId: categoryFilter !== 'all' ? categoryFilter : undefined,
  })
  const createMutation = useCreateProductModel()

  // Client-side media filter
  const filteredProducts = (products ?? []).filter((pm) => {
    const row = pm as ProductRow
    if (mediaFilter === 'no-photo' && row.photo_count > 0) return false
    if (mediaFilter === 'no-video' && row.video_count > 0) return false
    return true
  }) as ProductRow[]

  function handleCreate(values: ProductModelFormValues) {
    createMutation.mutate(values, {
      onSuccess: (data) => {
        toast.success('Product model created')
        setFormOpen(false)
        navigate(`/admin/products/${data.id}`)
      },
      onError: (err) => toast.error(`Failed to create: ${err.message}`),
    })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Product Models"
        description="Device models with specs, color variants, and media."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        }
      />

      {/* Filters Row */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by brand, model, or description..."
          className="flex-1 min-w-[280px]"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
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
        <Select value={mediaFilter} onValueChange={setMediaFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Media" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Media</SelectItem>
            <SelectItem value="no-photo">
              <span className="flex items-center gap-1.5"><ImageOff className="h-3.5 w-3.5" /> No Photos</span>
            </SelectItem>
            <SelectItem value="no-video">
              <span className="flex items-center gap-1.5"><VideoOff className="h-3.5 w-3.5" /> No Videos</span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={6} />
      ) : (
        <DataTable
          columns={columns}
          data={filteredProducts}
          onRowClick={(row) => navigate(`/admin/products/${row.id}`)}
        />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add Product Model</DialogTitle>
          </DialogHeader>
          <ProductForm
            loading={createMutation.isPending}
            onSubmit={handleCreate}
            onCancel={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
