import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriceDisplay } from '@/components/shared'
import { useAddItemCost, useDeleteItemCost } from '@/hooks/use-items'
import { itemCostSchema, type ItemCostFormValues } from '@/validators/item'
import type { ItemCost } from '@/lib/types'

interface AdditionalCostsSectionProps {
  itemId: string
  costs: ItemCost[]
}

export function AdditionalCostsSection({ itemId, costs }: AdditionalCostsSectionProps) {
  const [showAddCost, setShowAddCost] = useState(false)
  const addCost = useAddItemCost()
  const deleteCost = useDeleteItemCost()

  const costForm = useForm<ItemCostFormValues>({
    resolver: zodResolver(itemCostSchema),
    defaultValues: { description: '', amount: 0 },
  })

  function handleAddCost(values: ItemCostFormValues) {
    addCost.mutate(
      { itemId, description: values.description, amount: values.amount },
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
      { costId, itemId },
      {
        onSuccess: () => toast.success('Cost removed'),
        onError: () => toast.error('Failed to remove cost'),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Additional Costs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {costs.length > 0 && (
          <div className="space-y-1">
            {costs.map((cost) => (
              <div key={cost.id} className="flex items-center justify-between text-sm">
                <span className="truncate flex-1">{cost.description}</span>
                <div className="flex items-center gap-2">
                  <PriceDisplay amount={cost.amount} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleDeleteCost(cost.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showAddCost ? (
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
        )}
      </CardContent>
    </Card>
  )
}
