import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Merge } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomers, useCreateCustomer } from '@/hooks/use-customers'
import { DataTable, SearchBar, PageHeader, CodeDisplay, TableSkeleton, EmptyState } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ShieldCheck } from 'lucide-react'
import { formatDate, formatCustomerName } from '@/lib/utils'
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog'
import { MergeCustomersDialog } from '@/components/customers/merge-customers-dialog'
import type { Customer } from '@/lib/types'
import type { AdminCreateCustomerFormValues } from '@/validators/customer'
import type { ShippingAddress } from '@/lib/address-types'

const columns: ColumnDef<Customer>[] = [
  {
    accessorKey: 'customer_code',
    header: 'Code',
    cell: ({ row }) => (
      <Link to={`/admin/customers/${row.original.id}`} className="hover:underline">
        <CodeDisplay code={row.original.customer_code} />
      </Link>
    ),
  },
  {
    id: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <span>
        {formatCustomerName(row.original)}
      </span>
    ),
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.email ?? '-'}</span>
    ),
  },
  {
    accessorKey: 'phone',
    header: 'Phone',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.phone ?? '-'}</span>
    ),
  },
  {
    accessorKey: 'is_seller',
    header: 'Seller',
    cell: ({ row }) =>
      row.original.is_seller ? (
        <Badge variant="secondary">Seller</Badge>
      ) : null,
  },
  {
    accessorKey: 'id_verified',
    header: 'Verified',
    cell: ({ row }) =>
      row.original.id_verified ? (
        <ShieldCheck className="h-4 w-4 text-green-600" />
      ) : (
        <span className="text-xs text-muted-foreground">No</span>
      ),
  },
  {
    accessorKey: 'created_at',
    header: 'Registered',
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export default function CustomerListPage() {
  const { getParam, setParam } = usePersistedFilters('customers-filters')
  const search = getParam('q')
  const setSearch = (v: string) => setParam('q', v)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const { data: customers, isLoading } = useCustomers(search || undefined)
  const createMutation = useCreateCustomer()

  function handleCreate(values: AdminCreateCustomerFormValues, address: ShippingAddress | null) {
    createMutation.mutate(
      {
        last_name: values.last_name,
        first_name: values.first_name || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
        pin: values.pin,
        shipping_address: address,
        is_seller: values.is_seller,
        bank_name: values.bank_name || undefined,
        bank_branch: values.bank_branch || undefined,
        bank_account_number: values.bank_account_number || undefined,
        bank_account_holder: values.bank_account_holder || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Customer created')
          setDialogOpen(false)
        },
        onError: (err) => toast.error(`Failed to create customer: ${err.message}`),
      },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Customers" />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMergeDialogOpen(true)}>
            <Merge className="h-4 w-4 mr-1" />
            Merge Customers
          </Button>
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Customer
          </Button>
        </div>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by name, email, code..."
      />

      {isLoading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : !customers?.length ? (
        <EmptyState
          title="No customers found"
          description={search ? 'Try adjusting your search.' : 'No customers registered yet.'}
        />
      ) : (
        <DataTable columns={columns} data={customers} />
      )}

      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        loading={createMutation.isPending}
        onSubmit={handleCreate}
      />

      <MergeCustomersDialog
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
      />
    </div>
  )
}
