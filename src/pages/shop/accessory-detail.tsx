import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Image } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAccessory } from '@/hooks/use-accessories'
import { formatPrice } from '@/lib/utils'

export default function ShopAccessoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: accessory, isLoading } = useAccessory(id!)

  if (isLoading) {
    return <div className="animate-pulse space-y-4 py-8"><div className="h-64 bg-muted rounded-lg" /></div>
  }

  if (!accessory) {
    return <div className="text-center py-16 text-muted-foreground">Accessory not found</div>
  }

  const media = (accessory.accessory_media ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
  const heroImg = media[0]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/shop')}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Shop
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Image */}
        <div className="aspect-square bg-muted rounded-lg overflow-hidden">
          {heroImg ? (
            <img
              src={heroImg.file_url}
              alt={accessory.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Image className="h-24 w-24 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-4">
          <div>
            {accessory.brand && (
              <p className="text-sm text-muted-foreground">{accessory.brand}</p>
            )}
            <h1 className="text-2xl font-bold">{accessory.name}</h1>
          </div>

          <Badge variant="outline" className="text-blue-700 border-blue-300">Accessory</Badge>

          <p className="text-3xl font-bold">{formatPrice(Number(accessory.selling_price))}</p>

          {accessory.description && (
            <p className="text-muted-foreground">{accessory.description}</p>
          )}

          <div className="flex items-center gap-2">
            {accessory.stock_quantity > 0 ? (
              <Badge variant="outline" className="text-green-700 border-green-400">
                {accessory.stock_quantity} in stock
              </Badge>
            ) : (
              <Badge variant="destructive">Out of stock</Badge>
            )}
          </div>

          {accessory.categories?.name && (
            <p className="text-sm text-muted-foreground">Category: {accessory.categories.name}</p>
          )}
        </div>
      </div>

      {/* Additional Images */}
      {media.length > 1 && (
        <div className="grid grid-cols-4 gap-4">
          {media.slice(1).map((m) => (
            <div key={m.id} className="aspect-square rounded-lg overflow-hidden bg-muted">
              <img src={m.file_url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
