import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, X, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { PriceDisplay } from '@/components/shared'
import { useAddItemCost, useDeleteItemCost, useUpdateItem } from '@/hooks/use-items'
import { itemCostSchema, itemFinancialsSchema, type ItemCostFormValues, type ItemFinancialsFormValues } from '@/validators/item'
import type { Item, ItemCost } from '@/lib/types'
import { formatPrice } from '@/lib/utils'

interface FinancialsCardProps {
  item: Item
  costs: ItemCost[]
  locked?: boolean
}

export function FinancialsCard({ item, costs, locked }: FinancialsCardProps) {
  const [showAddCost, setShowAddCost] = useState(false)
  const [showSellingPrice, setShowSellingPrice] = useState(false)
  const addCost = useAddItemCost()
  const deleteCost = useDeleteItemCost()
  const updateItem = useUpdateItem()

  const totalAddedCosts = costs.reduce((sum, c) => sum + Number(c.amount), 0)
  const totalCost = (item.purchase_price ?? 0) + totalAddedCosts
  const sellingPrice = item.selling_price ?? 0
  const margin = sellingPrice - totalCost
  const marginPct = sellingPrice > 0 ? Math.round((margin / sellingPrice) * 100) : 0

  const costForm = useForm<ItemCostFormValues>({
    resolver: zodResolver(itemCostSchema),
    defaultValues: { description: '', amount: 0 },
  })

  const sellingForm = useForm<ItemFinancialsFormValues>({
    resolver: zodResolver(itemFinancialsSchema),
    defaultValues: { selling_price: item.selling_price ?? 0 },
  })

  function handleAddCost(values: ItemCostFormValues) {
    addCost.mutate(
      { itemId: item.id, description: values.description, amount: values.amount },
      {
        onSuccess: () => {
          toast.success('Cost added')
          costForm.reset()
          setShowAddCost(false)
        },
        onError: () => toast.error('Failed to add cost'),
      },
    )
  }

  function handleDeleteCost(costId: string) {
    deleteCost.mutate(
      { costId, itemId: item.id },
      {
        onSuccess: () => toast.success('Cost removed'),
        onError: () => toast.error('Failed to remove cost'),
      },
    )
  }

  function handleSellingPrice(values: ItemFinancialsFormValues) {
    updateItem.mutate(
      { id: item.id, updates: { selling_price: values.selling_price } },
      {
        onSuccess: () => {
          toast.success('Selling price updated')
          setShowSellingPrice(false)
        },
        onError: () => toast.error('Failed to update selling price'),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financials</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Purchase Price</span>
          <PriceDisplay amount={item.purchase_price} />
        </div>

        {costs.length > 0 && (
          <div className="space-y-1">
            <span className="text-muted-foreground font-medium">Added Costs</span>
            {costs.map((cost) => (
              <div key={cost.id} className="flex items-center justify-between pl-2">
                <span className="truncate flex-1">{cost.description}</span>
                <div className="flex items-center gap-2">
                  <PriceDisplay amount={cost.amount} />
                  {!locked && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleDeleteCost(cost.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!locked && (showAddCost ? (
          <form onSubmit={costForm.handleSubmit(handleAddCost)} className="flex gap-2 items-start">
            <Input
              placeholder="Description"
              className="flex-1"
              {...costForm.register('description')}
            />
            <Input
              type="number"
              placeholder="¥"
              className="w-24"
              {...costForm.register('amount')}
            />
            <Button type="submit" size="sm" disabled={addCost.isPending}>
              Add
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddCost(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowAddCost(true)}>
            <Plus className="h-3 w-3 mr-1" />
            Add Cost
          </Button>
        ))}

        <div className="border-t pt-3 space-y-2">
          <div className="flex justify-between font-medium">
            <span>Total Cost</span>
            <PriceDisplay amount={totalCost} />
          </div>

          <div className="flex justify-between items-center">
            <span className="font-medium">Selling Price</span>
            <div className="flex items-center gap-2">
              <PriceDisplay amount={item.selling_price} className="font-medium" />
              <Dialog open={showSellingPrice} onOpenChange={setShowSellingPrice}>
                {!locked && (
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </DialogTrigger>
                )}
                <DialogContent className="sm:max-w-[320px]">
                  <DialogHeader>
                    <DialogTitle>Set Selling Price</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={sellingForm.handleSubmit(handleSellingPrice)} className="space-y-4">
                    <Input
                      type="number"
                      placeholder="¥0"
                      {...sellingForm.register('selling_price')}
                    />
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setShowSellingPrice(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={updateItem.isPending}>
                        Save
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {item.selling_price != null && (
            <div className="flex justify-between">
              <span className="font-medium">Margin</span>
              <span className={margin >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                {formatPrice(margin)} ({marginPct}%)
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
