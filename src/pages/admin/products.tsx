import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageHeader, SearchBar, DataTable, TableSkeleton } from '@/components/shared'
import { ProductForm } from '@/components/items/product-form'
import { useProductModels, useCreateProductModel } from '@/hooks/use-product-models'
import { useDebounce } from '@/hooks/use-debounce'
import type { ProductModelWithCounts } from '@/lib/types'
import type { ProductModelFormValues } from '@/validators/product-model'

const columns: ColumnDef<ProductModelWithCounts>[] = [
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
    id: 'category',
    header: 'Category',
    cell: ({ row }) => {
      const cat = (row.original as ProductModelWithCounts & { categories?: { name: string } | null }).categories
      return cat?.name ?? '—'
    },
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
    accessorKey: 'media_count',
    header: 'Media',
  },
]

export default function ProductListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 400)
  const [formOpen, setFormOpen] = useState(false)

  const { data: products, isLoading } = useProductModels(debouncedSearch)
  const createMutation = useCreateProductModel()

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

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by brand or model..."
        className="max-w-sm"
      />

      {isLoading ? (
        <TableSkeleton rows={5} columns={6} />
      ) : (
        <DataTable
          columns={columns}
          data={products ?? []}
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
