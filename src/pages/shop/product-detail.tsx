import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useProductDetail } from '@/hooks/use-shop'
import { CONDITION_GRADES, getSpecFieldLabel } from '@/lib/constants'
import { formatPrice, cn } from '@/lib/utils'

export default function ShopProductDetailPage() {
  const { id: productModelId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: sellGroups, isLoading } = useProductDetail(productModelId!)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="aspect-square bg-muted animate-pulse rounded-lg" />
          <div className="space-y-4">
            <div className="h-8 w-64 bg-muted animate-pulse rounded" />
            <div className="h-4 w-48 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (!sellGroups || sellGroups.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-lg text-muted-foreground">Product not found or no longer available.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/shop">Back to Shop</Link>
        </Button>
      </div>
    )
  }

  // Use first sell group's data for common product info
  const first = sellGroups[0]
  const pm = first.product_models as {
    brand: string; model_name: string; color: string | null; short_description: string | null
    cpu: string | null; ram_gb: string | null; storage_gb: string | null; os_family: string | null
    screen_size: number | null; chipset: string | null; ports: string | null
    categories?: { name: string; form_fields: string[] } | null
    product_media?: { id: string; file_url: string; role: string; sort_order: number }[]
  } | null
  const formFields = new Set(pm?.categories?.form_fields ?? [])

  // Gather all photos from all sell groups' product_models relation
  const allMedia: { id: string; file_url: string; role: string; sort_order: number }[] = []
  const seenIds = new Set<string>()
  for (const sg of sellGroups) {
    const sgPm = sg.product_models as typeof pm
    for (const m of sgPm?.product_media ?? []) {
      if (!seenIds.has(m.id)) {
        seenIds.add(m.id)
        allMedia.push(m)
      }
    }
  }
  allMedia.sort((a, b) => a.sort_order - b.sort_order)

  const currentImage = allMedia[currentImageIndex]

  const priceRange = {
    min: Math.min(...sellGroups.map(sg => Number(sg.base_price))),
    max: Math.max(...sellGroups.map(sg => Number(sg.base_price))),
  }

  return (
    <div className="space-y-8">
      <Button variant="ghost" size="sm" onClick={() => navigate('/shop')}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Shop
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Image Gallery */}
        <div className="space-y-3">
          <div className="aspect-square rounded-lg overflow-hidden bg-muted flex items-center justify-center relative">
            {currentImage ? (
              <>
                <img
                  src={currentImage.file_url}
                  alt={pm ? `${pm.brand} ${pm.model_name}` : 'Product'}
                  className="w-full h-full object-cover"
                />
                {allMedia.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
                      onClick={() => setCurrentImageIndex((i) => (i > 0 ? i - 1 : allMedia.length - 1))}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
                      onClick={() => setCurrentImageIndex((i) => (i < allMedia.length - 1 ? i + 1 : 0))}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">No photos available</p>
            )}
          </div>
          {allMedia.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {allMedia.map((m, idx) => (
                <button
                  key={m.id}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={cn(
                    'w-16 h-16 rounded border-2 overflow-hidden flex-shrink-0',
                    idx === currentImageIndex ? 'border-primary' : 'border-transparent',
                  )}
                >
                  <img src={m.file_url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">
              {pm ? `${pm.brand} ${pm.model_name}` : 'Product'}
            </h1>
            {pm?.short_description && (
              <p className="text-sm text-muted-foreground mt-1">{pm.short_description}</p>
            )}
            <p className="text-lg text-muted-foreground mt-1">
              {priceRange.min === priceRange.max
                ? formatPrice(priceRange.min)
                : `${formatPrice(priceRange.min)} — ${formatPrice(priceRange.max)}`}
            </p>
          </div>

          <Tabs defaultValue="specs" className="w-full">
            <TabsList>
              <TabsTrigger value="specs">Specifications</TabsTrigger>
              <TabsTrigger value="options">Available Options ({sellGroups.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="specs">
              <Card>
                <CardContent className="pt-6 space-y-2 text-sm">
                  {formFields.has('cpu') && pm?.cpu && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('cpu')}</span><span>{pm.cpu}</span></div>}
                  {formFields.has('ram_gb') && pm?.ram_gb && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('ram_gb')}</span><span>{pm.ram_gb}</span></div>}
                  {formFields.has('storage_gb') && pm?.storage_gb && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('storage_gb')}</span><span>{pm.storage_gb}</span></div>}
                  {formFields.has('os_family') && pm?.os_family && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('os_family')}</span><span>{pm.os_family}</span></div>}
                  {formFields.has('screen_size') && pm?.screen_size && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('screen_size')}</span><span>{pm.screen_size}"</span></div>}
                  {formFields.has('chipset') && pm?.chipset && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('chipset')}</span><span>{pm.chipset}</span></div>}
                  {formFields.has('ports') && pm?.ports && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('ports')}</span><span>{pm.ports}</span></div>}
                  {formFields.has('gpu') && pm && (pm as Record<string, unknown>).gpu && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('gpu')}</span><span>{String((pm as Record<string, unknown>).gpu)}</span></div>}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="options">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-1">
                    <div className="grid grid-cols-4 gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase">
                      <span>Condition</span>
                      <span>Price</span>
                      <span>Stock</span>
                      <span className="text-right">Action</span>
                    </div>
                    {sellGroups.map((sg) => {
                      const gradeInfo = CONDITION_GRADES.find(g => g.value === sg.condition_grade)
                      const stock = (sg.sell_group_items as { count: number }[])?.[0]?.count ?? 0
                      const inStock = stock > 0

                      return (
                        <div
                          key={sg.id}
                          className="grid grid-cols-4 gap-4 items-center px-4 py-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            {gradeInfo && (
                              <Badge variant="outline" className={cn('text-xs', gradeInfo.color)}>
                                {gradeInfo.value}
                              </Badge>
                            )}
                            <span className="text-sm">{gradeInfo?.label.split(' — ')[1] ?? sg.condition_grade}</span>
                          </div>
                          <span className="text-lg font-bold">{formatPrice(Number(sg.base_price))}</span>
                          <span className={cn('text-sm', inStock ? 'text-green-600' : 'text-muted-foreground')}>
                            {inStock ? `${stock} available` : 'Out of stock'}
                          </span>
                          <div className="text-right">
                            <Button
                              size="sm"
                              disabled={!inStock}
                              onClick={() => navigate(`/shop/checkout/${sg.id}`)}
                            >
                              {inStock ? 'Buy Now' : 'Sold Out'}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
