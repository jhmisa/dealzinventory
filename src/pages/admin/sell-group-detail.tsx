import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Pencil, Trash2, Plus, X, Link, Copy, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  PageHeader,
  StatusBadge,
  GradeBadge,
  CodeDisplay,
  PriceDisplay,
  ConfirmDialog,
  FormSkeleton,
} from '@/components/shared'
import {
  useSellGroup,
  useSellGroupItems,
  useAvailableItems,
  useUpdateSellGroup,
  useDeleteSellGroup,
  useBulkAssignItems,
  useRemoveItem,
} from '@/hooks/use-sell-groups'
import { useProductModels } from '@/hooks/use-product-models'
import { sellGroupSchema, type SellGroupFormValues } from '@/validators/sell-group'
import { CONDITION_GRADES } from '@/lib/constants'
import { formatDateTime } from '@/lib/utils'

const SELLABLE_GRADES = CONDITION_GRADES.filter(g => g.value !== 'J')

export default function SellGroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: sg, isLoading } = useSellGroup(id!)
  const { data: sgItems } = useSellGroupItems(id!)
  const { data: availableItems } = useAvailableItems(id!)
  const { data: products } = useProductModels()

  const updateMutation = useUpdateSellGroup()
  const deleteMutation = useDeleteSellGroup()
  const bulkAssignMutation = useBulkAssignItems()
  const removeMutation = useRemoveItem()

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set())

  const form = useForm<SellGroupFormValues>({
    resolver: zodResolver(sellGroupSchema),
    values: sg ? {
      product_id: sg.product_id ?? '',
      condition_grade: sg.condition_grade as 'S' | 'A' | 'B' | 'C' | 'D',
      base_price: Number(sg.base_price),
      active: sg.active,
    } : undefined,
  })

  if (isLoading) return <FormSkeleton fields={6} />
  if (!sg) return <div className="text-center py-12 text-muted-foreground">Sell group not found.</div>

  const pm = sg.product_models as { brand: string; model_name: string; color: string; cpu: string | null; ram_gb: string | null; storage_gb: string | null; os_family: string | null } | null

  const shareUrl = `${window.location.origin}/order/${sg.sell_group_code}`

  function handleEdit(values: SellGroupFormValues) {
    updateMutation.mutate(
      { id: sg!.id, updates: values },
      {
        onSuccess: () => { toast.success('Sell group updated'); setEditOpen(false) },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function handleDelete() {
    deleteMutation.mutate(sg!.id, {
      onSuccess: () => { toast.success('Sell group deleted'); navigate('/admin/sell-groups') },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  function handleBulkAssign() {
    if (pickerSelectedIds.size === 0) return
    bulkAssignMutation.mutate(
      { sellGroupId: sg!.id, itemIds: Array.from(pickerSelectedIds) },
      {
        onSuccess: () => {
          toast.success(`${pickerSelectedIds.size} item${pickerSelectedIds.size !== 1 ? 's' : ''} assigned`)
          setPickerSelectedIds(new Set())
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function togglePickerItem(id: string) {
    setPickerSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleRemove(sellGroupItemId: string) {
    removeMutation.mutate(
      { sellGroupItemId, sellGroupId: sg!.id },
      {
        onSuccess: () => toast.success('Item removed'),
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function copyShareLink() {
    navigator.clipboard.writeText(shareUrl)
    toast.success('Link copied to clipboard')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/sell-groups')} aria-label="Back to sell groups">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={sg.sell_group_code}
          description={pm ? `${pm.brand} ${pm.model_name}${pm.color ? ` (${pm.color})` : ''}` : undefined}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Details Card */}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Code</span><CodeDisplay code={sg.sell_group_code} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span>{pm ? `${pm.brand} ${pm.model_name}` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Config</span><span>{pm ? `${pm.cpu ?? '?'} / ${pm.ram_gb ?? '?'} / ${pm.storage_gb ?? '?'}` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Grade</span><GradeBadge grade={sg.condition_grade} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Price</span><PriceDisplay amount={sg.base_price} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Product</span><span>{pm ? `${pm.brand} ${pm.model_name}${pm.color ? ` (${pm.color})` : ''}` : '—'}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              {sg.active
                ? <StatusBadge label="Active" color="bg-green-100 text-green-800 border-green-300" />
                : <StatusBadge label="Inactive" color="bg-gray-100 text-gray-800 border-gray-300" />}
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{formatDateTime(sg.created_at)}</span></div>
          </CardContent>
        </Card>

        {/* Share Link Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              Live Selling Link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Share this link for live selling. Customers can order directly from this link.</p>
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={copyShareLink} aria-label="Copy share link">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assigned Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Assigned Items ({sgItems?.length ?? 0})</CardTitle>
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Items
          </Button>
        </CardHeader>
        <CardContent>
          {!sgItems || sgItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No items assigned yet.</p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-5 gap-4 px-3 py-2 text-xs font-medium text-muted-foreground uppercase">
                <span>P-Code</span>
                <span>Model</span>
                <span>Grade</span>
                <span>Assigned</span>
                <span className="text-right">Action</span>
              </div>
              {sgItems.map((sgi) => {
                const item = sgi.items as { id: string; item_code: string; condition_grade: string; item_status: string; product_models: { brand: string; model_name: string } | null } | null
                if (!item) return null
                const ipm = item.product_models
                return (
                  <div key={sgi.id} className="grid grid-cols-5 gap-4 items-center px-3 py-2 border-b last:border-0 hover:bg-muted/50 rounded">
                    <CodeDisplay code={item.item_code} />
                    <span className="text-sm truncate">{ipm ? `${ipm.brand} ${ipm.model_name}` : '—'}</span>
                    <GradeBadge grade={item.condition_grade} />
                    <span className="text-xs text-muted-foreground">{formatDateTime(sgi.assigned_at)}</span>
                    <div className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(sgi.id)}
                        disabled={removeMutation.isPending}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Items Picker Dialog */}
      <Dialog open={pickerOpen} onOpenChange={(open) => { setPickerOpen(open); if (!open) { setPickerSearch(''); setPickerSelectedIds(new Set()) } }}>
        <DialogContent className="sm:max-w-[80vw] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Add Items — {pm ? `${pm.brand} ${pm.model_name}` : ''} Grade {sg.condition_grade}
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by P-code or description..."
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="overflow-y-auto flex-1 min-h-0">
            {!availableItems || availableItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No matching available items found.
              </p>
            ) : (() => {
              const q = pickerSearch.toLowerCase().trim()
              const filtered = q
                ? availableItems.filter((item) => {
                    const aiPm = item.product_models as { brand: string; model_name: string; short_description: string | null } | null
                    return item.item_code.toLowerCase().includes(q) ||
                      (aiPm?.short_description ?? '').toLowerCase().includes(q) ||
                      (`${aiPm?.brand ?? ''} ${aiPm?.model_name ?? ''}`).toLowerCase().includes(q)
                  })
                : availableItems
              return filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No items match &ldquo;{pickerSearch}&rdquo;.
                </p>
              ) : (
                <div className="space-y-1">
                  {/* Select All Header */}
                  <div className="flex items-center gap-3 px-3 py-2 border-b">
                    <Checkbox
                      checked={filtered.length > 0 && filtered.every((item) => pickerSelectedIds.has(item.id))}
                      onCheckedChange={() => {
                        const allSelected = filtered.every((item) => pickerSelectedIds.has(item.id))
                        if (allSelected) {
                          setPickerSelectedIds(new Set())
                        } else {
                          setPickerSelectedIds(new Set(filtered.map((item) => item.id)))
                        }
                      }}
                    />
                    <span className="text-xs font-medium text-muted-foreground uppercase">Select all</span>
                  </div>
                  {filtered.map((item) => {
                    const aiPm = item.product_models as { brand: string; model_name: string; short_description: string | null } | null
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 px-3 py-2 border rounded hover:bg-muted/50 cursor-pointer ${pickerSelectedIds.has(item.id) ? 'bg-muted/30' : ''}`}
                        onClick={() => togglePickerItem(item.id)}
                      >
                        <Checkbox
                          checked={pickerSelectedIds.has(item.id)}
                          onCheckedChange={() => togglePickerItem(item.id)}
                        />
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <CodeDisplay code={item.item_code} />
                          <GradeBadge grade={item.condition_grade} />
                          <span className="text-sm truncate">
                            {aiPm?.short_description || (aiPm ? `${aiPm.brand} ${aiPm.model_name}` : '—')}
                          </span>
                          {(item as { selling_price?: number | null }).selling_price != null && (
                            <PriceDisplay amount={(item as { selling_price: number }).selling_price} />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
          {/* Bulk Assign Footer */}
          {pickerSelectedIds.size > 0 && (
            <div className="border-t pt-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{pickerSelectedIds.size} item{pickerSelectedIds.size !== 1 ? 's' : ''} selected</span>
              <Button
                onClick={handleBulkAssign}
                disabled={bulkAssignMutation.isPending}
              >
                {bulkAssignMutation.isPending ? 'Assigning...' : `Assign Selected (${pickerSelectedIds.size})`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Sell Group</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleEdit)} className="space-y-4">
              <FormField
                control={form.control}
                name="product_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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
                      <FormLabel>Grade</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
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
                      <FormLabel>Price (¥)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
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
                    <FormLabel className="text-sm">Active</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Sell Group"
        description={`Delete ${sg.sell_group_code}? All item assignments will be removed. This cannot be undone.`}
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />
    </div>
  )
}
