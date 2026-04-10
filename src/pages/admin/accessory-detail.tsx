import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Save, Plus, Minus, Package, AlertTriangle, Upload, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageHeader, CodeDisplay, FormSkeleton } from '@/components/shared'
import {
  useAccessory,
  useUpdateAccessory,
  useAddStockEntry,
  useAddStockAdjustment,
  useStockHistory,
  useUploadAccessoryMedia,
  useDeleteAccessoryMedia,
} from '@/hooks/use-accessories'
import { useCategories } from '@/hooks/use-categories'
import { useSuppliers } from '@/hooks/use-suppliers'
import { ACCESSORY_ADJUSTMENT_REASONS } from '@/lib/constants'
import { formatPrice, formatDateTime, cn } from '@/lib/utils'
import type { AccessoryAdjustmentReason } from '@/lib/types'

export default function AccessoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: accessory, isLoading } = useAccessory(id!)
  const updateMutation = useUpdateAccessory()
  const addStockEntry = useAddStockEntry()
  const addStockAdjustment = useAddStockAdjustment()
  const { data: stockHistory } = useStockHistory(id!)
  const { data: categories } = useCategories()
  const { data: suppliers } = useSuppliers()
  const uploadMedia = useUploadAccessoryMedia()
  const deleteMedia = useDeleteAccessoryMedia()

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [brand, setBrand] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [lowStockThreshold, setLowStockThreshold] = useState('')
  const [shopVisible, setShopVisible] = useState(false)
  const [active, setActive] = useState(true)

  // Stock dialog state
  const [addStockOpen, setAddStockOpen] = useState(false)
  const [adjustStockOpen, setAdjustStockOpen] = useState(false)
  const [stockQty, setStockQty] = useState('')
  const [stockUnitCost, setStockUnitCost] = useState('')
  const [stockSupplierId, setStockSupplierId] = useState('')
  const [stockNotes, setStockNotes] = useState('')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState<AccessoryAdjustmentReason>('DEFECTIVE')
  const [adjustNotes, setAdjustNotes] = useState('')

  useEffect(() => {
    if (accessory) {
      setName(accessory.name)
      setDescription(accessory.description ?? '')
      setBrand(accessory.brand ?? '')
      setCategoryId(accessory.category_id ?? '')
      setSellingPrice(String(accessory.selling_price))
      setLowStockThreshold(String(accessory.low_stock_threshold))
      setShopVisible(accessory.shop_visible)
      setActive(accessory.active)
    }
  }, [accessory])

  if (isLoading) return <FormSkeleton />
  if (!accessory) return <div className="p-8 text-center text-muted-foreground">Accessory not found</div>

  const isDirty =
    name !== accessory.name ||
    description !== (accessory.description ?? '') ||
    brand !== (accessory.brand ?? '') ||
    categoryId !== (accessory.category_id ?? '') ||
    sellingPrice !== String(accessory.selling_price) ||
    lowStockThreshold !== String(accessory.low_stock_threshold) ||
    shopVisible !== accessory.shop_visible ||
    active !== accessory.active

  function handleSave() {
    const price = parseInt(sellingPrice, 10)
    if (!name.trim() || isNaN(price)) {
      toast.error('Name and valid price are required')
      return
    }
    updateMutation.mutate(
      {
        id: accessory.id,
        updates: {
          name: name.trim(),
          description: description.trim() || null,
          brand: brand.trim() || null,
          category_id: categoryId || null,
          selling_price: price,
          low_stock_threshold: parseInt(lowStockThreshold, 10) || 5,
          shop_visible: shopVisible,
          active,
        },
      },
      {
        onSuccess: () => toast.success('Accessory updated'),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleAddStock() {
    const qty = parseInt(stockQty, 10)
    const unitCost = parseInt(stockUnitCost, 10)
    if (isNaN(qty) || qty <= 0 || isNaN(unitCost) || unitCost < 0) {
      toast.error('Valid quantity and unit cost are required')
      return
    }
    addStockEntry.mutate(
      {
        accessory_id: accessory.id,
        supplier_id: stockSupplierId || null,
        quantity: qty,
        unit_cost: unitCost,
        notes: stockNotes.trim() || null,
      },
      {
        onSuccess: (result) => {
          toast.success(`Added ${qty} units. New stock: ${result.newQuantity}`)
          setAddStockOpen(false)
          setStockQty('')
          setStockUnitCost('')
          setStockSupplierId('')
          setStockNotes('')
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleAdjustStock() {
    const qty = parseInt(adjustQty, 10)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Valid quantity is required')
      return
    }
    addStockAdjustment.mutate(
      {
        accessory_id: accessory.id,
        quantity: qty,
        reason: adjustReason,
        notes: adjustNotes.trim() || null,
      },
      {
        onSuccess: (result) => {
          toast.success(`Adjusted ${qty} units. New stock: ${result.newQuantity}`)
          setAdjustStockOpen(false)
          setAdjustQty('')
          setAdjustNotes('')
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    uploadMedia.mutate(
      { accessoryId: accessory.id, file },
      {
        onSuccess: () => toast.success('Media uploaded'),
        onError: (err) => toast.error(err.message),
      },
    )
    e.target.value = ''
  }

  const stockQtyNum = accessory.stock_quantity
  const isLowStock = stockQtyNum > 0 && stockQtyNum <= accessory.low_stock_threshold
  const isOutOfStock = stockQtyNum === 0

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <CodeDisplay code={accessory.accessory_code} />
            <span className="text-lg font-semibold">{accessory.name}</span>
            {!active && <Badge variant="secondary">Inactive</Badge>}
          </div>
        }
        actions={
          <Button onClick={handleSave} disabled={!isDirty || updateMutation.isPending}>
            <Save className="h-4 w-4 mr-1" />
            {updateMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        }
      />

      {/* Stock Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 text-center">
            <p className={cn(
              'text-4xl font-bold',
              isOutOfStock && 'text-red-600',
              isLowStock && 'text-yellow-600',
            )}>
              {stockQtyNum}
            </p>
            <p className="text-sm text-muted-foreground">
              Current Stock
              {isLowStock && <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-yellow-500" />}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-center">
            <Button onClick={() => setAddStockOpen(true)} className="w-full">
              <Plus className="h-4 w-4 mr-1" />
              Add Stock
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-center">
            <Button variant="outline" onClick={() => setAdjustStockOpen(true)} className="w-full" disabled={stockQtyNum === 0}>
              <Minus className="h-4 w-4 mr-1" />
              Adjust Stock
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
          <TabsTrigger value="history">Stock History</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label>Brand</Label>
                  <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
                </div>
                <div>
                  <Label>Selling Price (¥) *</Label>
                  <Input type="number" min={0} value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {(categories ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Low Stock Threshold</Label>
                  <Input type="number" min={0} value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={shopVisible} onCheckedChange={setShopVisible} />
                  <Label>Visible on shop</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={active} onCheckedChange={setActive} />
                  <Label>Active</Label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Media Tab */}
        <TabsContent value="media">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Media</CardTitle>
                <label>
                  <input type="file" accept="image/*,video/*" onChange={handleFileUpload} className="hidden" />
                  <Button variant="outline" size="sm" asChild>
                    <span>
                      <Upload className="h-4 w-4 mr-1" />
                      Upload
                    </span>
                  </Button>
                </label>
              </div>
            </CardHeader>
            <CardContent>
              {(accessory.accessory_media ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No media uploaded</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {(accessory.accessory_media ?? [])
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((m) => (
                      <div key={m.id} className="relative group">
                        <img src={m.file_url} alt="" className="w-full aspect-square rounded-lg object-cover" />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteMedia.mutate(m.id, {
                            onSuccess: () => toast.success('Media deleted'),
                            onError: (err) => toast.error(err.message),
                          })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stock History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Stock History</CardTitle>
            </CardHeader>
            <CardContent>
              {!stockHistory || stockHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No stock history</p>
              ) : (
                <div className="space-y-2">
                  {stockHistory.map((item) => (
                    <div
                      key={item.type === 'entry' ? item.data.id : item.data.id}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 rounded border text-sm',
                        item.type === 'entry'
                          ? 'bg-green-50 dark:bg-green-950 border-green-200'
                          : 'bg-red-50 dark:bg-red-950 border-red-200',
                      )}
                    >
                      <div>
                        {item.type === 'entry' ? (
                          <>
                            <span className="text-green-700 font-medium">
                              +{item.data.quantity}
                            </span>
                            <span className="text-muted-foreground ml-2">
                              @ {formatPrice(Number(item.data.unit_cost))}/unit
                            </span>
                            {item.data.suppliers?.supplier_name && (
                              <span className="text-muted-foreground ml-2">
                                from {item.data.suppliers.supplier_name}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-red-700 font-medium">
                              -{item.data.quantity}
                            </span>
                            <span className="text-muted-foreground ml-2">
                              {item.data.reason.replace(/_/g, ' ')}
                            </span>
                          </>
                        )}
                        {(item.type === 'entry' ? item.data.notes : item.data.notes) && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            — {item.type === 'entry' ? item.data.notes : item.data.notes}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(item.date)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Stock Dialog */}
      <Dialog open={addStockOpen} onOpenChange={setAddStockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Quantity *</Label>
              <Input type="number" min={1} value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
            </div>
            <div>
              <Label>Unit Cost (¥) *</Label>
              <Input type="number" min={0} value={stockUnitCost} onChange={(e) => setStockUnitCost(e.target.value)} />
            </div>
            <div>
              <Label>Supplier</Label>
              <Select value={stockSupplierId} onValueChange={setStockSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {(suppliers ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={stockNotes} onChange={(e) => setStockNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStockOpen(false)}>Cancel</Button>
            <Button onClick={handleAddStock} disabled={addStockEntry.isPending}>
              {addStockEntry.isPending ? 'Adding...' : 'Add Stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Stock Dialog */}
      <Dialog open={adjustStockOpen} onOpenChange={setAdjustStockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock (Reduce)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Quantity to Remove *</Label>
              <Input type="number" min={1} max={stockQtyNum} value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} />
            </div>
            <div>
              <Label>Reason *</Label>
              <Select value={adjustReason} onValueChange={(v) => setAdjustReason(v as AccessoryAdjustmentReason)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESSORY_ADJUSTMENT_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={adjustNotes} onChange={(e) => setAdjustNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustStockOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleAdjustStock} disabled={addStockAdjustment.isPending}>
              {addStockAdjustment.isPending ? 'Adjusting...' : 'Adjust Stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
