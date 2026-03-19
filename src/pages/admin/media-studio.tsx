import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Image, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FormSkeleton } from '@/components/shared'
import { PhotoSection } from '@/components/media-studio/photo-section'
import { VideoSection } from '@/components/media-studio/video-section'
import { useProductModel } from '@/hooks/use-product-models'

export default function MediaStudioPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') === 'video' ? 'video' : 'photos'

  const { data: product, isLoading } = useProductModel(id!)

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-5xl">
        <FormSkeleton />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-5xl">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="text-center py-16">
          <h2 className="text-lg font-semibold mb-2">Product Not Found</h2>
          <p className="text-muted-foreground text-sm">
            The product you are looking for does not exist or has been deleted.
          </p>
        </div>
      </div>
    )
  }

  const media = (product.product_media ?? []) as Array<{
    id: string
    file_url: string
    media_type: string
    role: string
    sort_order: number
  }>

  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/admin/products/${id}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Media Studio</h1>
          <p className="text-sm text-muted-foreground">
            {product.brand} {product.model_name}
            {product.color ? ` - ${product.color}` : ''}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="photos" className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            Photos
          </TabsTrigger>
          <TabsTrigger value="video" className="flex items-center gap-2">
            <Video className="h-4 w-4" />
            Video
          </TabsTrigger>
        </TabsList>
        <TabsContent value="photos" className="mt-6">
          <PhotoSection productId={id!} existingMedia={media} />
        </TabsContent>
        <TabsContent value="video" className="mt-6">
          <VideoSection productId={id!} existingMedia={media} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
