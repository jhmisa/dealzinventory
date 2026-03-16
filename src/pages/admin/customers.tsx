import { useState } from 'react'
import { Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { useCustomers } from '@/hooks/use-customers'
import { DataTable, SearchBar, PageHeader, CodeDisplay, TableSkeleton, EmptyState } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Customer } from '@/lib/types'

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
        {row.original.last_name} {row.original.first_name}
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
  const [search, setSearch] = useState('')
  const { data: customers, isLoading } = useCustomers(search || undefined)

  return (
    <div className="space-y-4">
      <PageHeader title="Customers" />

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
    </div>
  )
}
