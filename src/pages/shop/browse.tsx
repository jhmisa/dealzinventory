import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal, Image } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { useShopItems, useShopSellGroups, useShopBrands, useShopCategories, useShopEnabled, useShopAccessories } from '@/hooks/use-shop'
import { CONDITION_GRADES } from '@/lib/constants'
import { formatPrice, cn } from '@/lib/utils'
import type { Accessory, AccessoryMedia } from '@/lib/types'

type SortOption = 'newest' | 'price_asc' | 'price_desc'

const SELLABLE_GRADES = CONDITION_GRADES.filter(g => g.value !== 'J')

export default function ShopBrowsePage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState<string>('all')
  const [grade, setGrade] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')
  const [sort, setSort] = useState<SortOption>('newest')

  const { data: shopEnabled } = useShopEnabled()

  const filters = {
    search: search || undefined,
    brand: brand === 'all' ? undefined : brand,
    grade: grade === 'all' ? undefined : grade,
    category: category === 'all' ? undefined : category,
    sort,
  }

  const { data: items, isLoading: itemsLoading } = useShopItems(filters)
  const { data: sellGroups, isLoading: sgLoading } = useShopSellGroups(filters)
  const { data: shopAccessories, isLoading: accLoading } = useShopAccessories({
    search: search || undefined,
    sort,
  })
  const { data: brands } = useShopBrands()
  const { data: categories } = useShopCategories()

  const isLoading = itemsLoading || sgLoading || accLoading
  const totalCount = (items?.length ?? 0) + (sellGroups?.length ?? 0) + (shopAccessories?.length ?? 0)

  if (shopEnabled === false) {
    return (
      <div className="text-center py-24">
        <h1 className="text-3xl font-bold">Shop</h1>
        <p className="text-muted-foreground mt-2">Shop is currently unavailable. Please check back later.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Shop</h1>
        <p className="text-muted-foreground mt-1">Quality refurbished laptops, phones, and tablets.</p>
      </div>

      {/* Search + Sort + Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by code, brand, model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="price_asc">Price: Low to High</SelectItem>
            <SelectItem value="price_desc">Price: High to Low</SelectItem>
          </SelectContent>
        </Select>

        {/* Mobile Filter Sheet */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="md:hidden" aria-label="Open filters">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Brand</Label>
                <Select value={brand} onValueChange={setBrand}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Brands</SelectItem>
                    {(brands ?? []).map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {(categories ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Condition</Label>
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Grades</SelectItem>
                    {SELLABLE_GRADES.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Desktop Filters */}
        <div className="hidden md:flex items-center gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {(categories ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {(brands ?? []).map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={grade} onValueChange={setGrade}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              {SELLABLE_GRADES.map((g) => (
                <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : totalCount === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No products found.</p>
          <p className="text-sm mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {/* Individual Items (P-codes) */}
          {(items ?? []).map((item) => {
            const pm = item.product_models as {
              id: string; brand: string; model_name: string; color: string | null
              short_description: string | null
              product_media?: { id: string; file_url: string; role: string; sort_order: number }[]
            } | null
            const itemMedia = (item.item_media ?? []) as { file_url: string; sort_order: number; visible: boolean; thumbnail_url: string | null }[]
            const visibleItemMedia = itemMedia.filter(m => m.visible !== false).sort((a, b) => a.sort_order - b.sort_order)
            const productMedia = pm?.product_media ?? []
            const heroProductImg = productMedia.find(m => m.role === 'hero') ?? productMedia[0]
            const heroImg = visibleItemMedia[0]?.thumbnail_url ?? visibleItemMedia[0]?.file_url ?? heroProductImg?.file_url
            const gradeInfo = CONDITION_GRADES.find(g => g.value === item.condition_grade)
            const description = pm?.short_description ?? item.specs_notes ?? ''

            return (
              <Card
                key={`item-${item.id}`}
                className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5"
                onClick={() => navigate(`/shop/item/${item.id}`)}
              >
                <div className="aspect-square bg-muted relative overflow-hidden">
                  {heroImg ? (
                    <img
                      src={heroImg}
                      alt={pm ? `${pm.brand} ${pm.model_name}` : item.item_code}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image className="h-16 w-16 text-muted-foreground/30" />
                    </div>
                  )}
                  {gradeInfo && (
                    <Badge variant="outline" className={cn('absolute top-2 right-2 text-xs', gradeInfo.color)}>
                      Grade {gradeInfo.value}
                    </Badge>
                  )}
                </div>
                <CardContent className="p-4 space-y-1">
                  <p className="font-mono text-xs text-muted-foreground">{item.item_code}</p>
                  <h3 className="font-semibold text-sm line-clamp-1">
                    {pm ? `${pm.brand} ${pm.model_name}` : item.item_code}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-lg font-bold">
                      {item.selling_price ? formatPrice(Number(item.selling_price)) : '—'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {/* Sell Groups (G-codes) */}
          {(sellGroups ?? []).map((sg) => {
            const pm = sg.product_models as {
              id: string; brand: string; model_name: string; color: string | null
              short_description: string | null
              product_media?: { id: string; file_url: string; role: string; sort_order: number }[]
            } | null
            const media = pm?.product_media ?? []
            const heroImg = media.find(m => m.role === 'hero') ?? media[0]
            const stockCount = (sg.sell_group_items as { count: number }[])?.[0]?.count ?? 0
            const gradeInfo = CONDITION_GRADES.find(g => g.value === sg.condition_grade)

            return (
              <Card
                key={`sg-${sg.id}`}
                className={cn(
                  'group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5',
                  stockCount === 0 && 'opacity-75',
                )}
                onClick={() => navigate(`/shop/product/${pm?.id}`)}
              >
                <div className="aspect-square bg-muted relative overflow-hidden">
                  {heroImg ? (
                    <img
                      src={heroImg.file_url}
                      alt={pm ? `${pm.brand} ${pm.model_name}` : sg.sell_group_code}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image className="h-16 w-16 text-muted-foreground/30" />
                    </div>
                  )}
                  {stockCount === 0 && (
                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                      <Badge variant="secondary" className="text-sm">Sold Out</Badge>
                    </div>
                  )}
                  {gradeInfo && (
                    <Badge variant="outline" className={cn('absolute top-2 right-2 text-xs', gradeInfo.color)}>
                      Grade {gradeInfo.value}
                    </Badge>
                  )}
                </div>
                <CardContent className="p-4 space-y-1">
                  <p className="font-mono text-xs text-muted-foreground">{sg.sell_group_code}</p>
                  <h3 className="font-semibold text-sm line-clamp-1">
                    {pm ? `${pm.brand} ${pm.model_name}` : sg.sell_group_code}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {pm?.short_description ?? ''}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-lg font-bold">{formatPrice(Number(sg.base_price))}</span>
                    <span className={cn('text-xs', stockCount > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground')}>
                      {stockCount > 0 ? `${stockCount} in stock` : 'Sold out'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {/* Accessories (A-codes) */}
          {(shopAccessories ?? []).map((acc: Accessory & { categories: { name: string } | null; accessory_media: AccessoryMedia[] }) => {
            const media = acc.accessory_media ?? []
            const heroImg = media.sort((a, b) => a.sort_order - b.sort_order)[0]
            return (
              <Card
                key={`acc-${acc.id}`}
                className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5"
                onClick={() => navigate(`/shop/accessory/${acc.id}`)}
              >
                <div className="aspect-square bg-muted relative overflow-hidden">
                  {heroImg ? (
                    <img
                      src={heroImg.file_url}
                      alt={acc.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image className="h-16 w-16 text-muted-foreground/30" />
                    </div>
                  )}
                  <Badge variant="outline" className="absolute top-2 right-2 text-xs bg-blue-50 text-blue-700 border-blue-300">
                    Accessory
                  </Badge>
                </div>
                <CardContent className="p-4 space-y-1">
                  <p className="font-mono text-xs text-muted-foreground">{acc.accessory_code}</p>
                  <h3 className="font-semibold text-sm line-clamp-1">
                    {acc.brand ? `${acc.brand} ${acc.name}` : acc.name}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {acc.description ?? ''}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-lg font-bold">{formatPrice(Number(acc.selling_price))}</span>
                    <span className="text-xs text-green-600 dark:text-green-400">
                      {acc.stock_quantity} in stock
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
