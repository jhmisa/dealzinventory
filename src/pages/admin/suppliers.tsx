import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader, SearchBar, DataTable, ConfirmDialog, TableSkeleton } from '@/components/shared'
import { SupplierFormDialog } from '@/components/items/supplier-form-dialog'
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier } from '@/hooks/use-suppliers'
import { useDebounce } from '@/hooks/use-debounce'
import { SUPPLIER_TYPES } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import type { Supplier, SupplierWithItemCount } from '@/lib/types'
import type { SupplierFormValues } from '@/validators/supplier'

const columns: ColumnDef<SupplierWithItemCount>[] = [
  {
    accessorKey: 'supplier_name',
    header: 'Name',
    cell: ({ row }) => <span className="font-medium">{row.original.supplier_name}</span>,
  },
  {
    accessorKey: 'supplier_type',
    header: 'Type',
    cell: ({ row }) => {
      const type = SUPPLIER_TYPES.find((t) => t.value === row.original.supplier_type)
      return type?.label ?? row.original.supplier_type
    },
  },
  {
    accessorKey: 'contact_info',
    header: 'Contact',
    cell: ({ row }) => row.original.contact_info || '—',
  },
  {
    accessorKey: 'item_count',
    header: 'Items',
    cell: ({ row }) => row.original.item_count,
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export default function SupplierListPage() {
  const { getParam, setParam } = usePersistedFilters('suppliers-filters')
  const search = getParam('q')
  const debouncedSearch = useDebounce(search, 400)
  const setSearch = (v: string) => setParam('q', v)
  const [formOpen, setFormOpen] = useState(false)
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: suppliers, isLoading } = useSuppliers(debouncedSearch)
  const createMutation = useCreateSupplier()
  const updateMutation = useUpdateSupplier()
  const deleteMutation = useDeleteSupplier()

  function handleCreate(values: SupplierFormValues) {
    createMutation.mutate(values, {
      onSuccess: () => {
        toast.success('Supplier created')
        setFormOpen(false)
      },
      onError: (err) => toast.error(`Failed to create supplier: ${err.message}`),
    })
  }

  function handleUpdate(values: SupplierFormValues) {
    if (!editSupplier) return
    updateMutation.mutate(
      { id: editSupplier.id, updates: values },
      {
        onSuccess: () => {
          toast.success('Supplier updated')
          setEditSupplier(null)
        },
        onError: (err) => toast.error(`Failed to update supplier: ${err.message}`),
      },
    )
  }

  function handleDelete() {
    if (!deleteId) return
    deleteMutation.mutate(deleteId, {
      onSuccess: () => {
        toast.success('Supplier deleted')
        setDeleteId(null)
      },
      onError: (err) => toast.error(`Failed to delete: ${err.message}`),
    })
  }

  const columnsWithActions: ColumnDef<SupplierWithItemCount>[] = [
    ...columns,
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              setEditSupplier(row.original)
            }}
            aria-label="Edit supplier"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              setDeleteId(row.original.id)
            }}
            disabled={row.original.item_count > 0}
            aria-label="Delete supplier"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Suppliers"
        description="Manage auction houses, wholesalers, and individual kaitori sources."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Supplier
          </Button>
        }
      />

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search suppliers..."
        className="max-w-sm"
      />

      {isLoading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : (
        <DataTable columns={columnsWithActions} data={suppliers ?? []} />
      )}

      <SupplierFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        loading={createMutation.isPending}
        onSubmit={handleCreate}
      />

      {editSupplier && (
        <SupplierFormDialog
          open={!!editSupplier}
          onOpenChange={(open) => { if (!open) setEditSupplier(null) }}
          supplier={editSupplier}
          loading={updateMutation.isPending}
          onSubmit={handleUpdate}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null) }}
        title="Delete Supplier"
        description="Are you sure? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
