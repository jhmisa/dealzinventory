import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useAvailableItems } from '@/hooks/use-orders'
import { CONDITION_GRADES } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'
import { Search, Check, Loader2, Package, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ManualOrderItemValues } from '@/validators/manual-order'

interface ItemBrowserProps {
  selectedItems: ManualOrderItemValues[]
  onToggleItem: (item: ManualOrderItemValues) => void
  onPriceChange: (itemId: string, price: number) => void
  onRemoveItem: (itemId: string) => void
}

export function ItemBrowser({
  selectedItems,
  onToggleItem,
  onPriceChange,
  onRemoveItem,
}: ItemBrowserProps) {
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState<string>('all')
  const [page, setPage] = useState(0)

  const { data, isLoading } = useAvailableItems({
    search: search || undefined,
    grade: gradeFilter === 'all' ? undefined : gradeFilter,
    page,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  const selectedItemIds = new Set(selectedItems.map((i) => i.item_id))

  const handleItemClick = (item: (typeof items)[number]) => {
    const pm = item.product_models
    const productName = pm ? `${pm.brand} ${pm.model_name}` : item.item_code

    if (selectedItemIds.has(item.id)) {
      onRemoveItem(item.id)
    } else {
      onToggleItem({
        item_id: item.id,
        item_code: item.item_code,
        product_name: productName,
        condition_grade: item.condition_grade,
        unit_price: item.selling_price ?? 0,
      })
    }
  }

  // Get hero image URL for an item (first product media with role 'hero' or first by sort_order)
  const getHeroUrl = (item: (typeof items)[number]) => {
    const media = item.product_models?.product_media
    if (!media || media.length === 0) return null
    const hero = media.find((m) => m.role === 'hero') ?? media.sort((a, b) => a.sort_order - b.sort_order)[0]
    return hero?.file_url ?? null
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search P-code or product name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={gradeFilter}
          onValueChange={(v) => {
            setGradeFilter(v)
            setPage(0)
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Grade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Grades</SelectItem>
            {CONDITION_GRADES.filter((g) => g.value !== 'J').map((g) => (
              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Item Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2" />
          <p>No available items found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {items.map((item) => {
              const isSelected = selectedItemIds.has(item.id)
              const heroUrl = getHeroUrl(item)
              const pm = item.product_models

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`relative text-left rounded-lg border-2 p-0 overflow-hidden transition-all hover:shadow-md ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'border-border hover:border-muted-foreground/50'
                  }`}
                >
                  {/* Checkmark overlay */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 z-10 bg-primary text-primary-foreground rounded-full p-1">
                      <Check className="h-3 w-3" />
                    </div>
                  )}

                  {/* Photo */}
                  <div className="aspect-square bg-muted flex items-center justify-center">
                    {heroUrl ? (
                      <img
                        src={heroUrl}
                        alt={item.item_code}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="h-8 w-8 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2 space-y-1">
                    <p className="font-mono text-xs text-muted-foreground">{item.item_code}</p>
                    {pm && (
                      <p className="text-sm font-medium leading-tight truncate">
                        {pm.brand} {pm.model_name}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      {item.condition_grade && (
                        <Badge variant="outline" className="text-xs">
                          {item.condition_grade}
                        </Badge>
                      )}
                      <span className="text-sm font-medium">
                        {formatPrice(item.selling_price ?? 0)}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Selected Items Cart */}
      {selectedItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Selected Items ({selectedItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {selectedItems.map((item) => (
                <div
                  key={item.item_id}
                  className="flex items-center gap-3 p-2 rounded-md border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{item.item_code}</p>
                    <p className="text-sm font-medium truncate">{item.product_name}</p>
                    {item.condition_grade && (
                      <Badge variant="outline" className="text-xs mt-0.5">
                        {item.condition_grade}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-28">
                      <Input
                        type="number"
                        min={0}
                        value={item.unit_price}
                        onChange={(e) =>
                          onPriceChange(item.item_id, Number(e.target.value) || 0)
                        }
                        className="text-right text-sm h-8"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveItem(item.item_id)}
                      className="text-destructive hover:text-destructive"
                    >
                      &times;
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t font-medium">
                <span>Subtotal</span>
                <span>{formatPrice(selectedItems.reduce((sum, i) => sum + i.unit_price, 0))}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
