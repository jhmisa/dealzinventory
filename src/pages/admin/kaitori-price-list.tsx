import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { type ColumnDef } from '@tanstack/react-table'
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
import { PageHeader, DataTable, ConfirmDialog } from '@/components/shared'
import { useKaitoriPriceList, useCreatePriceEntry, useUpdatePriceEntry, useDeletePriceEntry } from '@/hooks/use-kaitori'
import { useProductModels } from '@/hooks/use-product-models'
import { priceListEntrySchema, type PriceListEntryFormValues } from '@/validators/kaitori'
import { BATTERY_CONDITIONS, SCREEN_CONDITIONS, BODY_CONDITIONS } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'

type PriceRow = {
  id: string
  product_model_id: string
  battery_condition: string
  screen_condition: string
  body_condition: string
  purchase_price: number
  active: boolean
  product_models: { brand: string; model_name: string; cpu: string | null; ram_gb: string | null; storage_gb: string | null } | null
}

export default function KaitoriPriceListPage() {
  const { data: priceList, isLoading } = useKaitoriPriceList()
  const { data: productModels } = useProductModels()
  const createMutation = useCreatePriceEntry()
  const updateMutation = useUpdatePriceEntry()
  const deleteMutation = useDeletePriceEntry()

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const form = useForm<PriceListEntryFormValues>({
    resolver: zodResolver(priceListEntrySchema),
    defaultValues: {
      product_model_id: '',
      purchase_price: 0,
      active: true,
    },
  })

  function handleCreate(values: PriceListEntryFormValues) {
    createMutation.mutate({
      product_model_id: values.product_model_id,
      battery_condition: values.battery_condition,
      screen_condition: values.screen_condition,
      body_condition: values.body_condition,
      purchase_price: values.purchase_price,
      active: values.active,
    }, {
      onSuccess: () => { toast.success('Price entry created'); setCreateOpen(false); form.reset() },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  function handleToggleActive(id: string, active: boolean) {
    updateMutation.mutate({ id, updates: { active } }, {
      onSuccess: () => toast.success(active ? 'Activated' : 'Deactivated'),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  function handleDelete() {
    if (!deleteId) return
    deleteMutation.mutate(deleteId, {
      onSuccess: () => { toast.success('Entry deleted'); setDeleteId(null) },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  const columns: ColumnDef<PriceRow>[] = [
    {
      id: 'model',
      header: 'Model',
      cell: ({ row }) => {
        const pm = row.original.product_models
        return pm ? `${pm.brand} ${pm.model_name}` : '—'
      },
    },
    {
      id: 'config',
      header: 'Config',
      cell: ({ row }) => {
        const pm = row.original.product_models
        if (!pm || (!pm.cpu && !pm.ram_gb && !pm.storage_gb)) return 'Any'
        return `${pm.cpu ?? ''} / ${pm.ram_gb ?? '?'} / ${pm.storage_gb ?? '?'}`
      },
    },
    {
      accessorKey: 'battery_condition',
      header: 'Battery',
      cell: ({ row }) => BATTERY_CONDITIONS.find(b => b.value === row.original.battery_condition)?.label ?? row.original.battery_condition,
    },
    {
      accessorKey: 'screen_condition',
      header: 'Screen',
      cell: ({ row }) => SCREEN_CONDITIONS.find(s => s.value === row.original.screen_condition)?.label ?? row.original.screen_condition,
    },
    {
      accessorKey: 'body_condition',
      header: 'Body',
      cell: ({ row }) => BODY_CONDITIONS.find(b => b.value === row.original.body_condition)?.label ?? row.original.body_condition,
    },
    {
      accessorKey: 'purchase_price',
      header: 'Price',
      cell: ({ row }) => <span className="font-bold">{formatPrice(row.original.purchase_price)}</span>,
    },
    {
      accessorKey: 'active',
      header: 'Active',
      cell: ({ row }) => (
        <Switch
          checked={row.original.active}
          onCheckedChange={(checked) => handleToggleActive(row.original.id, checked)}
        />
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(row.original.id) }} aria-label="Delete price entry">
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kaitori Price List"
        description="Manage the pricing matrix for auto-quotes."
        actions={
          <Button onClick={() => { form.reset(); setCreateOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={(priceList ?? []) as PriceRow[]}
        isLoading={isLoading}
      />

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Price Entry</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
              <FormField
                control={form.control}
                name="product_model_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Model *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(productModels ?? []).map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.brand} {m.model_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name="battery_condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Battery</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BATTERY_CONDITIONS.map((b) => (
                            <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="screen_condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Screen</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SCREEN_CONDITIONS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="body_condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Body</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BODY_CONDITIONS.map((b) => (
                            <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="purchase_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purchase Price (¥) *</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Entry'}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null) }}
        title="Delete Price Entry"
        description="Are you sure? This will remove this pricing rule."
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />
    </div>
  )
}
