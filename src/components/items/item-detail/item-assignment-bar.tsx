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
import { CONDITION_GRADES } from '@/lib/constants'
import { ConfirmDialog } from '@/components/shared'
import type { Item, ItemUpdate } from '@/lib/types'

interface ItemAssignmentBarProps {
  item: Item
}

const NO_VALUE = '__none__'

export function ItemAssignmentBar({ item }: ItemAssignmentBarProps) {
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

  function handleConfirmProductChange() {
    if (!pendingProductId) return

    const selectedProduct = products?.find((p) => p.id === pendingProductId)
    const updates: ItemUpdate = { product_id: pendingProductId }

    if (selectedProduct?.category_id) {
      updates.category_id = selectedProduct.category_id
    }

    // Let the DB trigger handle auto-populating specs from the product.
    // We only set product_id and category_id here — the trigger fills blank fields.

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
          disabled={updateItem.isPending}
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
          disabled={updateItem.isPending}
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
          disabled={updateItem.isPending}
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

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => { if (!open) handleCancelProductChange() }}
        title="Change Product Assignment"
        description={
          item.supplier_description
            ? `You are changing a critical part of the item. Please double-check the information from the Supplier and the Product template you want to use. — Supplier Description: "${item.supplier_description}"`
            : 'You are changing a critical part of the item. Please double-check the information from the Supplier and the Product template you want to use.'
        }
        confirmLabel="Change"
        loading={updateItem.isPending}
        onConfirm={handleConfirmProductChange}
      />
    </div>
  )
}
