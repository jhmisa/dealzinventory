import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, ImageIcon, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useShopItemDetail } from '@/hooks/use-shop'
import { CONDITION_GRADES, getSpecFieldLabel } from '@/lib/constants'
import { formatPrice, cn } from '@/lib/utils'

type MediaTab = 'photos' | 'videos'

interface MediaItem {
  id: string
  file_url: string
  role: string
  media_type: 'image' | 'video'
}

export default function ShopItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: item, isLoading, isError } = useShopItemDetail(id!)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [mediaTab, setMediaTab] = useState<MediaTab>('photos')

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
    product_media?: { id: string; file_url: string; role: string; sort_order: number; media_type?: string }[]
  } | null

  const formFields = new Set(pm?.categories?.form_fields ?? [])

  // Combine item media + product model media
  const itemMedia = ((item.item_media ?? []) as { id: string; file_url: string; sort_order: number; visible: boolean; thumbnail_url: string | null; media_type?: string }[])
    .filter(m => m.visible !== false)
    .sort((a, b) => a.sort_order - b.sort_order)

  const productMedia = (pm?.product_media ?? []).sort((a, b) => a.sort_order - b.sort_order)

  // Build unified media list with type info
  const allMedia: MediaItem[] = []
  const seenIds = new Set<string>()

  for (const m of itemMedia) {
    if (!seenIds.has(m.id)) {
      seenIds.add(m.id)
      allMedia.push({ id: m.id, file_url: m.file_url, role: 'item', media_type: (m.media_type === 'video' ? 'video' : 'image') })
    }
  }
  for (const m of productMedia) {
    if (!seenIds.has(m.id)) {
      seenIds.add(m.id)
      allMedia.push({ id: m.id, file_url: m.file_url, role: m.role, media_type: (m.media_type === 'video' ? 'video' : 'image') })
    }
  }

  const photos = allMedia.filter(m => m.media_type === 'image')
  const videos = allMedia.filter(m => m.media_type === 'video')
  const activeMedia = mediaTab === 'photos' ? photos : videos
  const currentItem = activeMedia[currentIndex]

  const gradeInfo = CONDITION_GRADES.find(g => g.value === item.condition_grade)

  // Reset index when switching tabs
  function switchTab(tab: MediaTab) {
    setMediaTab(tab)
    setCurrentIndex(0)
  }

  return (
    <div className="space-y-8">
      <Button variant="ghost" size="sm" onClick={() => navigate('/shop')}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Shop
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Media Gallery */}
        <div className="space-y-3">
          {/* Photos / Videos toggle */}
          {(photos.length > 0 || videos.length > 0) && (
            <div className="flex border-b">
              <button
                onClick={() => switchTab('photos')}
                className={cn(
                  'flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors flex items-center justify-center gap-2',
                  mediaTab === 'photos'
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <ImageIcon className="h-4 w-4" />
                Photos ({String(photos.length).padStart(2, '0')})
              </button>
              <button
                onClick={() => switchTab('videos')}
                className={cn(
                  'flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors flex items-center justify-center gap-2',
                  mediaTab === 'videos'
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Video className="h-4 w-4" />
                Videos ({String(videos.length).padStart(2, '0')})
              </button>
            </div>
          )}

          {/* Main viewer */}
          <div className="aspect-square rounded-lg overflow-hidden bg-muted flex items-center justify-center relative">
            {currentItem ? (
              currentItem.media_type === 'video' ? (
                <video
                  key={currentItem.id}
                  src={currentItem.file_url}
                  controls
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <>
                  <img
                    src={currentItem.file_url}
                    alt={pm ? `${pm.brand} ${pm.model_name}` : item.item_code}
                    className="w-full h-full object-cover"
                  />
                </>
              )
            ) : (
              <p className="text-muted-foreground">
                {mediaTab === 'videos' ? 'No videos available' : 'No photos available'}
              </p>
            )}
            {activeMedia.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
                  onClick={() => setCurrentIndex((i) => (i > 0 ? i - 1 : activeMedia.length - 1))}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
                  onClick={() => setCurrentIndex((i) => (i < activeMedia.length - 1 ? i + 1 : 0))}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </>
            )}
          </div>

          {/* Thumbnails */}
          {activeMedia.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {activeMedia.map((m, idx) => (
                <button
                  key={m.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    'w-16 h-16 rounded border-2 overflow-hidden flex-shrink-0',
                    idx === currentIndex ? 'border-primary' : 'border-transparent',
                  )}
                >
                  {m.media_type === 'video' ? (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Video className="h-5 w-5 text-muted-foreground" />
                    </div>
                  ) : (
                    <img src={m.file_url} alt="" className="w-full h-full object-cover" />
                  )}
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
              {item.selling_price ? (() => {
                const discount = Number(item.discount ?? 0)
                const sellingPrice = Number(item.selling_price)
                const effectivePrice = sellingPrice - discount
                return discount > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-red-600 dark:text-red-400">{formatPrice(effectivePrice)}</span>
                    <span className="text-sm text-muted-foreground line-through">{formatPrice(sellingPrice)}</span>
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
                      Save {formatPrice(discount)}
                    </Badge>
                  </div>
                ) : (
                  <span className="text-2xl font-bold">{formatPrice(sellingPrice)}</span>
                )
              })() : <span className="text-2xl font-bold">Price on request</span>}
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
