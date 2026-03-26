import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader, SearchBar, DataTable, GradeBadge, StatusBadge, CodeDisplay, PriceDisplay, TableSkeleton } from '@/components/shared'
import { useSellGroups, useCreateSellGroup } from '@/hooks/use-sell-groups'
import { useProductModels } from '@/hooks/use-product-models'
import { sellGroupSchema, type SellGroupFormValues } from '@/validators/sell-group'
import { CONDITION_GRADES } from '@/lib/constants'

type SellGroupRow = {
  id: string
  sell_group_code: string
  condition_grade: string
  base_price: number
  active: boolean
  created_at: string
  product_models: { brand: string; model_name: string; color: string; cpu: string | null; ram_gb: number | null; storage_gb: number | null; os_family: string | null } | null
  sell_group_items: { count: number }[]
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
    id: 'config',
    header: 'Config',
    cell: ({ row }) => {
      const pm = row.original.product_models
      return pm && (pm.cpu || pm.ram_gb || pm.storage_gb) ? `${pm.cpu ?? '?'} / ${pm.ram_gb ?? '?'}GB / ${pm.storage_gb ?? '?'}GB` : '—'
    },
  },
  {
    accessorKey: 'condition_grade',
    header: 'Grade',
    cell: ({ row }) => <GradeBadge grade={row.original.condition_grade} />,
  },
  {
    accessorKey: 'base_price',
    header: 'Price',
    cell: ({ row }) => <PriceDisplay amount={row.original.base_price} />,
  },
  {
    id: 'items',
    header: 'Items',
    cell: ({ row }) => {
      const count = row.original.sell_group_items?.[0]?.count ?? 0
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

export default function SellGroupListPage() {
  const navigate = useNavigate()
  const { getParam, setParam } = usePersistedFilters('sell-groups-filters')
  const search = getParam('q')
  const setSearch = (v: string) => setParam('q', v)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: sellGroups, isLoading } = useSellGroups({ search: search || undefined })
  const { data: products } = useProductModels()
  const createMutation = useCreateSellGroup()

  const form = useForm<SellGroupFormValues>({
    resolver: zodResolver(sellGroupSchema),
    defaultValues: {
      product_id: '',
      condition_grade: undefined,
      base_price: undefined,
      active: true,
    },
  })

  function handleCreate(values: SellGroupFormValues) {
    createMutation.mutate(values, {
      onSuccess: (sg) => {
        toast.success(`Sell group ${sg.sell_group_code} created`)
        setDialogOpen(false)
        form.reset()
      },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sell Groups"
        description="Group items by config, grade, and price for selling."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Sell Group
          </Button>
        }
      />

      <SearchBar value={search} onChange={setSearch} placeholder="Search G-code..." />

      {isLoading ? (
        <TableSkeleton rows={8} columns={7} />
      ) : (
        <DataTable
          columns={columns}
          data={(sellGroups ?? []) as SellGroupRow[]}
          onRowClick={(row) => navigate(`/admin/sell-groups/${row.id}`)}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Sell Group</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
              <FormField
                control={form.control}
                name="product_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(products ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.brand} {p.model_name} ({p.color})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="condition_grade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Condition Grade</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select grade" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SELLABLE_GRADES.map((g) => (
                            <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="base_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Price (¥)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel className="text-sm">Active (visible in shop)</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Sell Group'}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
