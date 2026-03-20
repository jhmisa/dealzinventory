import { useState } from 'react'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useCategories } from '@/hooks/use-categories'
import { useProductModels } from '@/hooks/use-product-models'
import { useUpdateItem } from '@/hooks/use-items'
import { supabase } from '@/lib/supabase'
import { CONDITION_GRADES } from '@/lib/constants'
import { ProductTemplateDiffDialog } from './product-template-diff-dialog'
import type { Item, ItemUpdate } from '@/lib/types'

interface ItemAssignmentBarProps {
  item: Item
  locked?: boolean
}

const NO_VALUE = '__none__'

export function ItemAssignmentBar({ item, locked }: ItemAssignmentBarProps) {
  const { data: categories } = useCategories()
  const { data: products } = useProductModels()
  const updateItem = useUpdateItem()
  const [pendingProductId, setPendingProductId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const filteredProducts = item.category_id
    ? products?.filter((p) => p.category_id === item.category_id)
    : products

  function handleCategoryChange(value: string) {
    const categoryId = value === NO_VALUE ? null : value
    if (categoryId === item.category_id) return

    updateItem.mutate(
      { id: item.id, updates: { category_id: categoryId } },
      {
        onSuccess: () => toast.success('Category updated'),
        onError: (err) => toast.error(`Failed to update category: ${err.message}`),
      },
    )
  }

  function handleProductChange(value: string) {
    const productId = value === NO_VALUE ? null : value
    if (productId === item.product_id) return

    if (!productId) {
      // Clearing product — no confirmation needed
      updateItem.mutate(
        { id: item.id, updates: { product_id: null } },
        {
          onSuccess: () => toast.success('Product cleared'),
          onError: (err) => toast.error(`Failed to update product: ${err.message}`),
        },
      )
      return
    }

    // Setting a product — show confirmation dialog
    setPendingProductId(productId)
    setConfirmOpen(true)
  }

  async function handleConfirmProductChange(fieldsToApply: string[]) {
    if (!pendingProductId) return

    try {
      const { data: pm } = await supabase
        .from('product_models')
        .select('*')
        .eq('id', pendingProductId)
        .single()

      const updates: ItemUpdate = { product_id: pendingProductId }

      if (pm) {
        // Always set category and device_category from the product (not user-selectable —
        // these are inherent to the product template, not debatable specs)
        if (pm.category_id) updates.category_id = pm.category_id
        if (pm.device_category) updates.device_category = pm.device_category

        // Only apply fields the user checked in the diff dialog
        for (const key of fieldsToApply) {
          const pmVal = pm[key as keyof typeof pm]
          if (pmVal != null) {
            ;(updates as Record<string, unknown>)[key] =
              typeof pmVal === 'string' ? pmVal.trim() : pmVal
          }
        }
      }

      updateItem.mutate(
        { id: item.id, updates },
        {
          onSuccess: () => {
            toast.success('Product updated')
            setPendingProductId(null)
            setConfirmOpen(false)
          },
          onError: (err) => {
            toast.error(`Failed to update product: ${err.message}`)
            setPendingProductId(null)
            setConfirmOpen(false)
          },
        },
      )
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setPendingProductId(null)
      setConfirmOpen(false)
    }
  }

  function handleCancelProductChange() {
    setPendingProductId(null)
    setConfirmOpen(false)
  }

  function handleGradeChange(value: string) {
    if (value === item.condition_grade) return

    updateItem.mutate(
      { id: item.id, updates: { condition_grade: value } },
      {
        onSuccess: () => toast.success(`Grade updated to ${value}`),
        onError: (err) => toast.error(`Failed to update grade: ${err.message}`),
      },
    )
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Category */}
      <div className="flex items-center gap-2 min-w-0">
        <Label className="text-sm font-medium shrink-0">Category</Label>
        <Select
          value={item.category_id ?? NO_VALUE}
          onValueChange={handleCategoryChange}
          disabled={locked || updateItem.isPending}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_VALUE}>No category</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Product */}
      <div className="flex items-center gap-2 min-w-0">
        <Label className="text-sm font-medium shrink-0">Product</Label>
        <Select
          value={item.product_id ?? NO_VALUE}
          onValueChange={handleProductChange}
          disabled={locked || updateItem.isPending}
        >
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Select product" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_VALUE}>No product</SelectItem>
            {filteredProducts?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.brand} {p.model_name} ({p.color})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grade */}
      <div className="flex items-center gap-2 min-w-0">
        <Label className="text-sm font-medium shrink-0">Grade</Label>
        <Select
          value={item.condition_grade ?? ''}
          onValueChange={handleGradeChange}
          disabled={locked || updateItem.isPending}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select grade" />
          </SelectTrigger>
          <SelectContent>
            {CONDITION_GRADES.map((g) => (
              <SelectItem key={g.value} value={g.value}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ProductTemplateDiffDialog
        open={confirmOpen}
        onOpenChange={(open) => { if (!open) handleCancelProductChange() }}
        item={item}
        pendingProductId={pendingProductId}
        loading={updateItem.isPending}
        onConfirm={handleConfirmProductChange}
      />
    </div>
  )
}
