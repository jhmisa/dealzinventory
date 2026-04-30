import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAvailableItems } from '@/hooks/use-orders'
import { useAvailableAccessories } from '@/hooks/use-accessories'
import { ORDER_SOURCES } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'
import { Search, Plus, Loader2, X, Package } from 'lucide-react'

export interface OrderLineItem {
  id: string
  item_id: string | null
  accessory_id?: string | null
  accessory_code?: string | null
  item_code: string | null
  description: string
  condition_grade: string | null
  quantity: number
  unit_price: number
  discount: number
}

interface OrderLineItemsProps {
  lineItems: OrderLineItem[]
  onLineItemsChange: (items: OrderLineItem[]) => void
  shippingCost: number
  onShippingCostChange: (cost: number) => void
  orderSource: string
  onOrderSourceChange: (source: string) => void
  notes: string
  onNotesChange: (notes: string) => void
  onSubmit: () => void
  isSubmitting: boolean
  canSubmit: boolean
}

export function OrderLineItems({
  lineItems,
  onLineItemsChange,
  shippingCost,
  onShippingCostChange,
  orderSource,
  onOrderSourceChange,
  notes,
  onNotesChange,
  onSubmit,
  isSubmitting,
  canSubmit,
}: OrderLineItemsProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const { data, isLoading } = useAvailableItems({ search: debouncedQuery })
  const searchResults = data?.items ?? []

  const { data: accessoryResults, isLoading: accessoryLoading } = useAvailableAccessories(debouncedQuery)

  const addedItemIds = new Set(
    lineItems.filter((li) => li.item_id).map((li) => li.item_id)
  )

  const handleSelectItem = (item: (typeof searchResults)[number]) => {
    if (addedItemIds.has(item.id)) return

    const pm = item.product_models
    const description = pm ? `${pm.brand} ${pm.model_name}` : item.item_code

    const newLine: OrderLineItem = {
      id: crypto.randomUUID(),
      item_id: item.id,
      item_code: item.item_code,
      description,
      condition_grade: item.condition_grade,
      quantity: 1,
      unit_price: item.selling_price ?? 0,
      discount: item.discount ? Number(item.discount) : 0,
    }

    onLineItemsChange([...lineItems, newLine])
    setSearchQuery('')
    setDebouncedQuery('')
    setShowDropdown(false)
  }

  const handleSelectAccessory = (acc: { id: string; accessory_code: string; name: string; brand: string | null; selling_price: number }) => {
    const description = acc.brand ? `${acc.brand} ${acc.name}` : acc.name
    const newLine: OrderLineItem = {
      id: crypto.randomUUID(),
      item_id: null,
      accessory_id: acc.id,
      accessory_code: acc.accessory_code,
      item_code: null,
      description,
      condition_grade: null,
      quantity: 1,
      unit_price: acc.selling_price ?? 0,
      discount: 0,
    }
    onLineItemsChange([...lineItems, newLine])
    setSearchQuery('')
    setDebouncedQuery('')
    setShowDropdown(false)
  }

  const handleAddCustomItem = () => {
    const newLine: OrderLineItem = {
      id: crypto.randomUUID(),
      item_id: null,
      item_code: null,
      description: '',
      condition_grade: null,
      quantity: 1,
      unit_price: 0,
      discount: 0,
    }
    onLineItemsChange([...lineItems, newLine])
  }

  const updateLine = (id: string, updates: Partial<OrderLineItem>) => {
    onLineItemsChange(
      lineItems.map((li) => (li.id === id ? { ...li, ...updates } : li))
    )
  }

  const removeLine = (id: string) => {
    onLineItemsChange(lineItems.filter((li) => li.id !== id))
  }

  // Calculations
  const orderSubtotal = lineItems.reduce(
    (sum, li) => sum + li.unit_price * li.quantity - li.discount,
    0
  )
  const totalDiscount = lineItems.reduce((sum, li) => sum + li.discount, 0)
  const orderTotal = orderSubtotal + shippingCost

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Order</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Order Source & Notes */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Order Source *</Label>
            <Select value={orderSource} onValueChange={onOrderSourceChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {ORDER_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Staff Notes</Label>
            <Textarea
              placeholder="Optional notes about this order..."
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              rows={1}
              className="min-h-[36px] resize-none"
            />
          </div>
        </div>

        {/* Search + Add Custom */}
        <div className="flex items-center gap-3">
          <div ref={searchRef} className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search P-code, A-code, or product name..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setShowDropdown(true)
              }}
              onFocus={() => {
                if (searchQuery) setShowDropdown(true)
              }}
              className="pl-9"
            />

            {/* Unified Search Dropdown */}
            {showDropdown && debouncedQuery && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto">
                {(isLoading && accessoryLoading) ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="text-sm text-muted-foreground">Searching...</span>
                  </div>
                ) : searchResults.length === 0 && (!accessoryResults || accessoryResults.length === 0) ? (
                  <div className="flex items-center justify-center py-4">
                    <Package className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">No items or accessories found</span>
                  </div>
                ) : (
                  <>
                    {searchResults.map((item) => {
                      const isAdded = addedItemIds.has(item.id)
                      const pm = item.product_models
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={isAdded}
                          onClick={() => handleSelectItem(item)}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ${
                            isAdded
                              ? 'opacity-40 cursor-not-allowed bg-muted'
                              : 'hover:bg-accent cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-xs text-muted-foreground shrink-0">
                              {item.item_code}
                            </span>
                            <span className="truncate">
                              {pm ? `${pm.brand} ${pm.model_name}` : '—'}
                            </span>
                            {item.condition_grade && (
                              <Badge variant="outline" className="text-xs shrink-0">
                                {item.condition_grade}
                              </Badge>
                            )}
                          </div>
                          <span className="text-muted-foreground shrink-0">
                            {formatPrice(item.selling_price ?? 0)}
                          </span>
                        </button>
                      )
                    })}
                    {accessoryResults && accessoryResults.length > 0 && (
                      <>
                        {searchResults.length > 0 && (
                          <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50 border-t">
                            Accessories
                          </div>
                        )}
                        {accessoryResults.map((acc) => (
                          <button
                            key={`acc-${acc.id}`}
                            type="button"
                            onClick={() => handleSelectAccessory(acc)}
                            className="w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-accent cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-xs text-muted-foreground shrink-0">
                                {acc.accessory_code}
                              </span>
                              <span className="truncate">
                                {acc.brand ? `${acc.brand} ${acc.name}` : acc.name}
                              </span>
                              <Badge variant="outline" className="text-xs shrink-0">
                                {acc.stock_quantity} in stock
                              </Badge>
                            </div>
                            <span className="text-muted-foreground shrink-0">
                              {formatPrice(acc.selling_price ?? 0)}
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddCustomItem}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add custom item
          </Button>
        </div>

        {/* Line Items Table */}
        {lineItems.length > 0 ? (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-20 text-center">Qty</TableHead>
                  <TableHead className="w-28 text-right">Unit Price</TableHead>
                  <TableHead className="w-24 text-right">Discount</TableHead>
                  <TableHead className="w-28 text-right">Subtotal</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((li, idx) => {
                  const isInventory = li.item_id !== null
                  const lineSubtotal = li.unit_price * li.quantity - li.discount

                  return (
                    <TableRow key={li.id}>
                      <TableCell className="text-muted-foreground text-xs">
                        {idx + 1}
                      </TableCell>

                      {/* Description */}
                      <TableCell>
                        {isInventory || li.accessory_id ? (
                          <div>
                            <span className="font-mono text-xs text-muted-foreground mr-2">
                              {li.item_code ?? li.accessory_code ?? ''}
                            </span>
                            <span className="text-sm font-medium">{li.description}</span>
                            {li.condition_grade && (
                              <Badge variant="outline" className="text-xs ml-2">
                                {li.condition_grade}
                              </Badge>
                            )}
                            {li.accessory_id && (
                              <Badge variant="outline" className="text-xs ml-2 text-blue-600 border-blue-300">
                                Accessory
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <Input
                            placeholder="Item description..."
                            value={li.description}
                            onChange={(e) =>
                              updateLine(li.id, { description: e.target.value })
                            }
                            className="h-8 text-sm"
                          />
                        )}
                      </TableCell>

                      {/* Qty */}
                      <TableCell className="text-center">
                        {isInventory && !li.accessory_id ? (
                          <span className="text-sm">1</span>
                        ) : (
                          <Input
                            type="number"
                            min={1}
                            value={li.quantity}
                            onChange={(e) =>
                              updateLine(li.id, {
                                quantity: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="h-8 text-sm text-center w-16 mx-auto"
                          />
                        )}
                      </TableCell>

                      {/* Unit Price */}
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={li.unit_price}
                          onChange={(e) =>
                            updateLine(li.id, {
                              unit_price: Number(e.target.value) || 0,
                            })
                          }
                          className="h-8 text-sm text-right w-28 ml-auto"
                        />
                      </TableCell>

                      {/* Discount */}
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={li.discount}
                          onChange={(e) =>
                            updateLine(li.id, {
                              discount: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="h-8 text-sm text-right w-24 ml-auto"
                        />
                      </TableCell>

                      {/* Subtotal */}
                      <TableCell className="text-right text-sm font-medium">
                        {formatPrice(lineSubtotal)}
                      </TableCell>

                      {/* Remove */}
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLine(li.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="border rounded-md py-8 text-center text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No items added yet. Search for inventory items or add a custom item.</p>
          </div>
        )}

        {/* Summary */}
        <div className="flex justify-end">
          <div className="w-72 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatPrice(orderSubtotal)}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground">Delivery Fee</span>
              <Input
                type="number"
                min={0}
                value={shippingCost}
                onChange={(e) =>
                  onShippingCostChange(Math.max(0, Number(e.target.value) || 0))
                }
                className="h-8 text-sm text-right w-28"
              />
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-muted-foreground">({formatPrice(totalDiscount)})</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t">
              <span className="font-semibold">Total</span>
              <span className="font-semibold text-lg">{formatPrice(orderTotal)}</span>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <Button
            type="button"
            size="lg"
            disabled={!canSubmit || isSubmitting}
            onClick={onSubmit}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Create Order
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
