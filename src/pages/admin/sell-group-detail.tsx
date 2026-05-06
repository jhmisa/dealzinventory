import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Pencil, Trash2, Plus, X, Link, Copy, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
import { sellGroupSchema, type SellGroupFormValues } from '@/validators/sell-group'
import { formatDateTime, formatPrice, getItemDescription } from '@/lib/utils'

export default function SellGroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: sg, isLoading } = useSellGroup(id!)
  const { data: sgItems } = useSellGroupItems(id!)
  const { data: availableItems } = useAvailableItems(id!)

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
      discount_amount: Number(sg.discount_amount ?? 0),
      active: sg.active,
    } : undefined,
  })

  // Representative item from the assigned set, used for Normal/Discount price display
  const repItem = useMemo(() => {
    const items = (sgItems ?? []) as Array<{ items: { selling_price: number | null } | null }>
    return items.map(s => s.items).find(i => i?.selling_price != null) ?? null
  }, [sgItems])

  if (isLoading) return <FormSkeleton fields={6} />
  if (!sg) return <div className="text-center py-12 text-muted-foreground">Sell group not found.</div>

  const pm = sg.product_models as { brand: string; model_name: string; color: string; cpu: string | null; ram_gb: string | null; storage_gb: string | null; os_family: string | null } | null

  const shareUrl = `${window.location.origin}/order/${sg.sell_group_code}`
  const sellingPrice = Number(repItem?.selling_price ?? 0)
  const discountAmount = Number(sg.discount_amount ?? 0)
  const effectivePrice = Math.max(0, sellingPrice - discountAmount)

  function handleEdit(values: SellGroupFormValues) {
    updateMutation.mutate(
      { id: sg!.id, updates: { discount_amount: values.discount_amount, active: values.active } },
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
          setPickerOpen(false)
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
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Normal Price</span>
              {sellingPrice > 0 ? (
                discountAmount > 0 ? (
                  <span className="text-sm text-muted-foreground line-through tabular-nums">{formatPrice(sellingPrice)}</span>
                ) : (
                  <PriceDisplay amount={sellingPrice} />
                )
              ) : <span className="text-muted-foreground">—</span>}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Discount Price</span>
              {discountAmount > 0 && sellingPrice > 0 ? (
                <span className="font-bold text-red-600 dark:text-red-400 tabular-nums">{formatPrice(effectivePrice)} <span className="text-xs font-normal text-muted-foreground">(−{formatPrice(discountAmount)})</span></span>
              ) : <span className="text-muted-foreground">—</span>}
            </div>
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
              <div className="grid grid-cols-6 gap-4 px-3 py-2 text-xs font-medium text-muted-foreground uppercase">
                <span>P-Code</span>
                <span>Model</span>
                <span>Grade</span>
                <span>Price</span>
                <span>Assigned</span>
                <span className="text-right">Action</span>
              </div>
              {sgItems.map((sgi) => {
                const item = sgi.items as { id: string; item_code: string; condition_grade: string; item_status: string; selling_price: number | null; discount: number | null; product_models: { brand: string; model_name: string } | null } | null
                if (!item) return null
                const ipm = item.product_models
                const itemSp = Number(item.selling_price ?? 0)
                const itemDisc = Number(item.discount ?? 0)
                const itemEffective = Math.max(0, itemSp - itemDisc)
                return (
                  <div key={sgi.id} className="grid grid-cols-6 gap-4 items-center px-3 py-2 border-b last:border-0 hover:bg-muted/50 rounded">
                    <CodeDisplay code={item.item_code} />
                    <span className="text-sm truncate">{ipm ? `${ipm.brand} ${ipm.model_name}` : '—'}</span>
                    <GradeBadge grade={item.condition_grade} />
                    {itemDisc > 0 ? (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">{formatPrice(itemEffective)}</span>
                        <span className="text-xs text-muted-foreground line-through tabular-nums">{formatPrice(itemSp)}</span>
                      </div>
                    ) : (
                      <span className="text-sm tabular-nums">{itemSp > 0 ? formatPrice(itemSp) : '—'}</span>
                    )}
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

      {/* Available Items Picker Dialog (with assigned-elsewhere greyed-out) */}
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
                No items match this group&rsquo;s locked criteria (selling price, grade, color, RAM, storage).
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
                  <div className="flex items-center gap-3 px-3 py-2 border-b">
                    <Checkbox
                      checked={(() => {
                        const eligible = filtered.filter(i => !(i as { assigned_sell_group_id?: string | null }).assigned_sell_group_id)
                        return eligible.length > 0 && eligible.every(i => pickerSelectedIds.has(i.id))
                      })()}
                      onCheckedChange={() => {
                        const eligible = filtered.filter(i => !(i as { assigned_sell_group_id?: string | null }).assigned_sell_group_id)
                        const ids = eligible.map(i => i.id)
                        const allSelected = ids.length > 0 && ids.every(id => pickerSelectedIds.has(id))
                        if (allSelected) {
                          setPickerSelectedIds(new Set())
                        } else {
                          setPickerSelectedIds(new Set(ids))
                        }
                      }}
                    />
                    <span className="text-xs font-medium text-muted-foreground uppercase">Select all eligible</span>
                  </div>
                  {filtered.map((item) => {
                    const aiPm = item.product_models as { brand: string; model_name: string; short_description: string | null; categories: { description_fields: string[] | null } | null } | null
                    const inGroupCode = (item as { assigned_sell_group_code?: string | null }).assigned_sell_group_code ?? null
                    const isSelf = (item as { assigned_sell_group_id?: string | null }).assigned_sell_group_id === sg.id
                    const disabled = !!inGroupCode && !isSelf
                    const description = getItemDescription(
                      item as unknown as Record<string, unknown>,
                      aiPm as unknown as Record<string, unknown> | null,
                      aiPm?.categories?.description_fields ?? null,
                    )
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 px-3 py-2 border rounded ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer'} ${pickerSelectedIds.has(item.id) ? 'bg-muted/30' : ''}`}
                        onClick={() => { if (!disabled) togglePickerItem(item.id) }}
                      >
                        <Checkbox
                          checked={pickerSelectedIds.has(item.id)}
                          disabled={disabled}
                          onCheckedChange={() => { if (!disabled) togglePickerItem(item.id) }}
                        />
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <CodeDisplay code={item.item_code} />
                          <GradeBadge grade={item.condition_grade} />
                          <span className="text-sm truncate">
                            {description || (aiPm ? `${aiPm.brand} ${aiPm.model_name}` : '—')}
                          </span>
                          {(item as { selling_price?: number | null }).selling_price != null && (
                            <PriceDisplay amount={(item as { selling_price: number }).selling_price} />
                          )}
                        </div>
                        {inGroupCode && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-800 border-amber-300">
                                  In {inGroupCode}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Already in another sell group; remove from there first.</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
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

      {/* Edit Dialog — only discount_amount + active are editable; other fields are derived from items */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Sell Group</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleEdit)} className="space-y-4">
              <div className="rounded-md bg-muted/40 border p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Product</span><span>{pm ? `${pm.brand} ${pm.model_name}${pm.color ? ` (${pm.color})` : ''}` : '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Grade</span><GradeBadge grade={sg.condition_grade} /></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Normal Price</span><span className="tabular-nums">{sellingPrice > 0 ? formatPrice(sellingPrice) : '—'}</span></div>
                <p className="text-xs text-muted-foreground">These are derived from the assigned items and cannot be edited here. Remove items or change their values to modify.</p>
              </div>
              <FormField
                control={form.control}
                name="discount_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount Amount (¥)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      Will be applied to all {sgItems?.length ?? 0} member item{sgItems?.length === 1 ? '' : 's'} when saved.
                    </p>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel className="text-sm">Active (visible on shop)</FormLabel>
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
        description={`Delete ${sg.sell_group_code}? All ${sgItems?.length ?? 0} item assignment${sgItems?.length === 1 ? '' : 's'} will be removed and member items' discount will be cleared. This cannot be undone.`}
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />
    </div>
  )
}
