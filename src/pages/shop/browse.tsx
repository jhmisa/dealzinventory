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
import { useShopProducts, useShopBrands } from '@/hooks/use-shop'
import { CONDITION_GRADES } from '@/lib/constants'
import { formatPrice, cn } from '@/lib/utils'

type SortOption = 'newest' | 'price_asc' | 'price_desc'

const SELLABLE_GRADES = CONDITION_GRADES.filter(g => g.value !== 'J')

export default function ShopBrowsePage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState<string>('all')
  const [grade, setGrade] = useState<string>('all')
  const [sort, setSort] = useState<SortOption>('newest')

  const { data: products, isLoading } = useShopProducts({
    search: search || undefined,
    brand: brand === 'all' ? undefined : brand,
    grade: grade === 'all' ? undefined : grade,
    sort,
  })

  const { data: brands } = useShopBrands()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Shop</h1>
        <p className="text-muted-foreground">Quality refurbished laptops, phones, and tablets.</p>
      </div>

      {/* Search + Sort + Filter Toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
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

      {/* Product Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : !products || products.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No products found.</p>
          <p className="text-sm mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map((sg) => {
            const pm = sg.product_models as {
              id: string; brand: string; model_name: string; color: string | null
              cpu: string | null; ram_gb: number | null; storage_gb: number | null; os_family: string | null
              screen_size: number | null; short_description: string | null
              product_media?: { id: string; file_url: string; role: string; sort_order: number }[]
            } | null
            const media = pm?.product_media ?? []
            const heroImg = media.find(m => m.role === 'hero') ?? media[0]
            const stockCount = (sg.sell_group_items as { count: number }[])?.[0]?.count ?? 0
            const gradeInfo = CONDITION_GRADES.find(g => g.value === sg.condition_grade)

            return (
              <Card
                key={sg.id}
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
                <CardContent className="p-4 space-y-1.5">
                  <h3 className="font-semibold text-sm line-clamp-1">
                    {pm ? `${pm.brand} ${pm.model_name}` : sg.sell_group_code}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {pm?.short_description
                      ? pm.short_description
                      : pm ? [pm.cpu, pm.ram_gb ? `${pm.ram_gb}GB` : null, pm.storage_gb ? `${pm.storage_gb}GB` : null].filter(Boolean).join(' / ') : ''}
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
        </div>
      )}
    </div>
  )
}
