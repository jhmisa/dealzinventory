import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useShopItemDetail } from '@/hooks/use-shop'
import { CONDITION_GRADES, getSpecFieldLabel } from '@/lib/constants'
import { formatPrice, cn } from '@/lib/utils'

export default function ShopItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: item, isLoading, isError } = useShopItemDetail(id!)
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

  if (isError || !item) {
    return (
      <div className="text-center py-16">
        <p className="text-lg text-muted-foreground">Item not found or no longer available.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/shop">Back to Shop</Link>
        </Button>
      </div>
    )
  }

  const pm = item.product_models as {
    brand: string; model_name: string; color: string | null; short_description: string | null
    cpu: string | null; ram_gb: string | null; storage_gb: string | null; os_family: string | null
    screen_size: number | null; chipset: string | null; ports: string | null
    categories?: { name: string; form_fields: string[] } | null
    product_media?: { id: string; file_url: string; role: string; sort_order: number }[]
  } | null

  const formFields = new Set(pm?.categories?.form_fields ?? [])

  // Combine item-specific media + product model media
  const itemMedia = ((item.item_media ?? []) as { id: string; file_url: string; sort_order: number; visible: boolean; thumbnail_url: string | null }[])
    .filter(m => m.visible !== false)
    .sort((a, b) => a.sort_order - b.sort_order)

  const productMedia = (pm?.product_media ?? []).sort((a, b) => a.sort_order - b.sort_order)

  // Item photos first, then product model photos as fallback
  const allMedia = [
    ...itemMedia.map(m => ({ id: m.id, file_url: m.file_url, role: 'item' })),
    ...productMedia.map(m => ({ id: m.id, file_url: m.file_url, role: m.role })),
  ]
  // Deduplicate by id
  const seenIds = new Set<string>()
  const uniqueMedia = allMedia.filter(m => {
    if (seenIds.has(m.id)) return false
    seenIds.add(m.id)
    return true
  })

  const currentImage = uniqueMedia[currentImageIndex]
  const gradeInfo = CONDITION_GRADES.find(g => g.value === item.condition_grade)

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
                  alt={pm ? `${pm.brand} ${pm.model_name}` : item.item_code}
                  className="w-full h-full object-cover"
                />
                {uniqueMedia.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
                      onClick={() => setCurrentImageIndex((i) => (i > 0 ? i - 1 : uniqueMedia.length - 1))}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
                      onClick={() => setCurrentImageIndex((i) => (i < uniqueMedia.length - 1 ? i + 1 : 0))}
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
          {uniqueMedia.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {uniqueMedia.map((m, idx) => (
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

        {/* Item Info */}
        <div className="space-y-6">
          <div>
            <p className="font-mono text-sm text-muted-foreground">{item.item_code}</p>
            <h1 className="text-2xl font-bold mt-1">
              {pm ? `${pm.brand} ${pm.model_name}` : item.item_code}
            </h1>
            {pm?.short_description && (
              <p className="text-sm text-muted-foreground mt-1">{pm.short_description}</p>
            )}
            <div className="flex items-center gap-3 mt-3">
              <span className="text-2xl font-bold">
                {item.selling_price ? formatPrice(Number(item.selling_price)) : 'Price on request'}
              </span>
              {gradeInfo && (
                <Badge variant="outline" className={cn('text-xs', gradeInfo.color)}>
                  Grade {gradeInfo.value}
                </Badge>
              )}
            </div>
          </div>

          {/* Condition Notes */}
          {item.condition_notes && (
            <div>
              <h3 className="text-sm font-medium mb-1">Condition Notes</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{item.condition_notes}</p>
            </div>
          )}

          {/* Specs */}
          <Card>
            <CardContent className="pt-6 space-y-2 text-sm">
              {pm?.color && <div className="flex justify-between"><span className="text-muted-foreground">Color</span><span>{pm.color}</span></div>}
              {formFields.has('cpu') && pm?.cpu && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('cpu')}</span><span>{pm.cpu}</span></div>}
              {formFields.has('ram_gb') && pm?.ram_gb && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('ram_gb')}</span><span>{pm.ram_gb}</span></div>}
              {formFields.has('storage_gb') && pm?.storage_gb && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('storage_gb')}</span><span>{pm.storage_gb}</span></div>}
              {formFields.has('os_family') && pm?.os_family && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('os_family')}</span><span>{pm.os_family}</span></div>}
              {formFields.has('screen_size') && pm?.screen_size && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('screen_size')}</span><span>{pm.screen_size}"</span></div>}
              {formFields.has('chipset') && pm?.chipset && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('chipset')}</span><span>{pm.chipset}</span></div>}
              {formFields.has('ports') && pm?.ports && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('ports')}</span><span>{pm.ports}</span></div>}
              {item.year && <div className="flex justify-between"><span className="text-muted-foreground">Year</span><span>{item.year}</span></div>}
              {item.specs_notes && <div className="flex justify-between"><span className="text-muted-foreground">Notes</span><span>{item.specs_notes}</span></div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
