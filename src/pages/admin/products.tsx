import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
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
import { useProductColorGroups, useCreateProductModel } from '@/hooks/use-product-models'
import { useCategories } from '@/hooks/use-categories'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'
import { normalizeSearchText, searchQueryTokens } from '@/lib/search'
import type { ProductColorGroup } from '@/services/product-models'
import type { ProductModelFormValues } from '@/validators/product-model'

function formatStorage(storage: string | null): string {
  const n = parseInt((storage ?? '').replace(/[^0-9]/g, ''), 10) || 0
  if (!n) return '—'
  return n >= 1024 ? `${n / 1024}TB` : `${n}GB`
}

function buildColumns(search: string): ColumnDef<ProductColorGroup>[] {
  // Separator-insensitive tokens (matches the server fuzzy RPC via @/lib/search).
  const tokens = searchQueryTokens(search)
  return [
    {
      id: 'category',
      header: 'Category',
      cell: ({ row }) =>
        row.original.category_name ? (
          <span className="text-xs bg-muted px-2 py-0.5 rounded">{row.original.category_name}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: 'product_model',
      header: 'Product Model',
      cell: ({ row }) => {
        const g = row.original
        // Does a SKU line match the search? (storage or part# contains a token.)
        const lineMatches = (sku: { storage_gb: string | null; part_number: string | null }) => {
          if (tokens.length === 0) return false
          const hay = normalizeSearchText(`${formatStorage(sku.storage_gb)} ${sku.part_number ?? ''}`)
          return tokens.some((t) => hay.includes(t))
        }
        const anyLineMatches = g.skus.some(lineMatches)
        return (
          <div className="space-y-0.5">
            <div className="font-medium">
              {g.brand} {g.model_name}
              {g.model_number && (
                <span className="text-muted-foreground font-normal"> · {g.model_number}</span>
              )}
              {' · '}
              <span>{g.color}</span>
            </div>
            {g.skus.length > 0 ? (
              g.skus.map((sku, i) => {
                // Dim non-matching lines only when the search points at a specific SKU line.
                const dim = anyLineMatches && !lineMatches(sku)
                const hit = anyLineMatches && lineMatches(sku)
                return (
                  <div
                    key={`${sku.storage_gb}-${sku.part_number}-${i}`}
                    className={cn(
                      'flex items-center gap-2 text-xs pl-3 tabular-nums',
                      dim && 'opacity-40',
                      hit && 'font-medium',
                    )}
                  >
                    <span className="w-12 text-muted-foreground">{formatStorage(sku.storage_gb)}</span>
                    <span className="font-mono text-muted-foreground">{sku.part_number || '—'}</span>
                  </div>
                )
              })
            ) : (
              <div className="text-xs text-muted-foreground pl-3">—</div>
            )}
          </div>
        )
      },
    },
    {
      id: 'short_description',
      header: 'Description',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs line-clamp-2 max-w-[16rem] inline-block align-top">
          {row.original.short_description || '—'}
        </span>
      ),
    },
    {
      id: 'photos',
      header: 'Photos',
      cell: ({ row }) => {
        const count = row.original.photo_count
        return <span className={cn('text-sm align-top', count === 0 && 'text-red-500 font-medium')}>{count}</span>
      },
    },
    {
      id: 'videos',
      header: 'Videos',
      cell: ({ row }) => {
        const count = row.original.video_count
        return <span className={cn('text-sm align-top', count === 0 && 'text-red-500 font-medium')}>{count}</span>
      },
    },
  ]
}

export default function ProductListPage() {
  const navigate = useNavigate()
  const { getParam, setParam } = usePersistedFilters('products-filters')
  const search = getParam('q')
  const debouncedSearch = useDebounce(search, 400)
  const categoryFilter = getParam('category', 'all')
  const mediaFilter = getParam('media', 'all')
  const setSearch = (v: string) => setParam('q', v)
  const setCategoryFilter = (v: string) => setParam('category', v, 'all')
  const setMediaFilter = (v: string) => setParam('media', v, 'all')
  const [formOpen, setFormOpen] = useState(false)

  const { data: categories } = useCategories()
  const { data: groups, isLoading } = useProductColorGroups({
    search: debouncedSearch || undefined,
    categoryId: categoryFilter !== 'all' ? categoryFilter : undefined,
    media: mediaFilter !== 'all' ? (mediaFilter as 'no-photo' | 'no-video') : undefined,
  })
  const createMutation = useCreateProductModel()
  const columns = useMemo(() => buildColumns(debouncedSearch || ''), [debouncedSearch])

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
          placeholder="Search model, A-number, part#, storage… (e.g. iPhone 15 256, A3089, MTMN3J/A)"
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
        <TableSkeleton rows={5} columns={5} />
      ) : (
        <DataTable
          columns={columns}
          data={groups ?? []}
          onRowClick={(row) => navigate(`/admin/products/${row.representative_id}`)}
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
