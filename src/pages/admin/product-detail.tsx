import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageHeader, ConfirmDialog, FormSkeleton, StatusBadge } from '@/components/shared'
import { MediaUploader, ImageGallery } from '@/components/shared/media'
import type { GalleryImage } from '@/components/shared/media'
import { ProductForm } from '@/components/items/product-form'
import { useProductModel, useUpdateProductModel, useDeleteProductModel, useAddProductMedia, useDeleteProductMedia } from '@/hooks/use-product-models'
import { PRODUCT_STATUSES, getSpecFieldLabel } from '@/lib/constants'
import type { ProductModelFormValues } from '@/validators/product-model'

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { data: product, isLoading } = useProductModel(id!)
  const updateMutation = useUpdateProductModel()
  const deleteMutation = useDeleteProductModel()
  const addMediaMutation = useAddProductMedia()
  const deleteMediaMutation = useDeleteProductMedia()

  function handleUpdate(values: ProductModelFormValues) {
    updateMutation.mutate(
      { id: id!, updates: values },
      {
        onSuccess: () => {
          toast.success('Product model updated')
          setEditOpen(false)
        },
        onError: (err) => toast.error(`Failed to update: ${err.message}`),
      },
    )
  }

  function handleDelete() {
    deleteMutation.mutate(id!, {
      onSuccess: () => {
        toast.success('Product model deleted')
        navigate('/admin/products')
      },
      onError: (err) => toast.error(`Cannot delete: ${err.message}`),
    })
  }

  function handleMediaUpload(url: string) {
    addMediaMutation.mutate(
      { productId: id!, fileUrl: url },
      {
        onError: (err) => toast.error(`Failed to save media: ${err.message}`),
      },
    )
  }

  function handleMediaDelete(mediaId: string) {
    deleteMediaMutation.mutate(mediaId, {
      onError: (err) => toast.error(`Failed to delete media: ${err.message}`),
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <FormSkeleton fields={6} />
      </div>
    )
  }

  if (!product) {
    return <div className="text-center py-12 text-muted-foreground">Product not found.</div>
  }

  const productStatusConfig = PRODUCT_STATUSES.find((s) => s.value === product.status)
  const category = (product as typeof product & { categories?: { name: string; form_fields: string[]; description_fields: string[] } | null }).categories
  const formFields = new Set(category?.form_fields ?? [])

  // Build media gallery from product_media relation
  const productMedia = (product as typeof product & { product_media?: { id: string; file_url: string; role: string; sort_order: number }[] }).product_media ?? []
  const galleryImages: GalleryImage[] = productMedia.map((m) => ({
    id: m.id,
    url: m.file_url,
    alt: `${product.brand} ${product.model_name} — ${m.role}`,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/products')} aria-label="Back to products">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={`${product.brand} ${product.model_name}`}
          description={product.short_description || [product.color, product.chipset, product.screen_size ? `${product.screen_size}"` : null].filter(Boolean).join(' | ') || undefined}
          actions={
            <div className="flex gap-2">
              <Button onClick={() => navigate(`/admin/products/${id}/media-studio`)}>
                <Camera className="h-4 w-4 mr-2" />
                Media Studio
              </Button>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Specifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Brand</span><span>{product.brand}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span>{product.model_name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Color</span><span>{product.color || '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span>{category?.name ?? '—'}</span></div>
            {formFields.has('chipset') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('chipset')}</span><span>{product.chipset || '—'}</span></div>}
            {formFields.has('screen_size') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('screen_size')}</span><span>{product.screen_size ? `${product.screen_size}"` : '—'}</span></div>}
            {formFields.has('ports') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('ports')}</span><span>{product.ports || '—'}</span></div>}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              {productStatusConfig ? <StatusBadge label={productStatusConfig.label} color={productStatusConfig.color} /> : <span>{product.status}</span>}
            </div>
            {product.model_notes && (
              <div className="pt-2 border-t">
                <span className="text-muted-foreground">Notes:</span>
                <p className="mt-1">{product.model_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {formFields.has('cpu') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('cpu')}</span><span>{product.cpu || '—'}</span></div>}
            {formFields.has('ram_gb') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('ram_gb')}</span><span>{product.ram_gb ? `${product.ram_gb}GB` : '—'}</span></div>}
            {formFields.has('storage_gb') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('storage_gb')}</span><span>{product.storage_gb ? `${product.storage_gb}GB` : '—'}</span></div>}
            {formFields.has('os_family') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('os_family')}</span><span>{product.os_family || '—'}</span></div>}
            {formFields.has('gpu') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('gpu')}</span><span>{product.gpu || '—'}</span></div>}
            {formFields.has('carrier') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('carrier')}</span><span>{product.carrier || '—'}</span></div>}
            {formFields.has('keyboard_layout') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('keyboard_layout')}</span><span>{product.keyboard_layout || '—'}</span></div>}
            {formFields.has('has_touchscreen') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('has_touchscreen')}</span><span>{product.has_touchscreen ? 'Yes' : 'No'}</span></div>}
            {formFields.has('has_thunderbolt') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('has_thunderbolt')}</span><span>{product.has_thunderbolt ? 'Yes' : 'No'}</span></div>}
            {formFields.has('supports_stylus') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('supports_stylus')}</span><span>{product.supports_stylus ? 'Yes' : 'No'}</span></div>}
            {formFields.has('has_cellular') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('has_cellular')}</span><span>{product.has_cellular ? 'Yes' : 'No'}</span></div>}
            {formFields.has('is_unlocked') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('is_unlocked')}</span><span>{product.is_unlocked ? 'Yes' : 'No'}</span></div>}
            {formFields.has('imei_slot_count') && <div className="flex justify-between"><span className="text-muted-foreground">{getSpecFieldLabel('imei_slot_count')}</span><span>{product.imei_slot_count ?? '—'}</span></div>}
            {product.match_pattern && (
              <div className="flex justify-between"><span className="text-muted-foreground">Match Pattern</span><span className="font-mono text-xs">{product.match_pattern}</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Match Priority</span><span>{product.match_priority ?? 0}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Media Management */}
      <Card>
        <CardHeader>
          <CardTitle>Product Media ({galleryImages.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <MediaUploader
            bucket="photo-group-media"
            pathPrefix={`product-media/${id}`}
            onUpload={handleMediaUpload}
          />

          {galleryImages.length > 0 && (
            <div className="space-y-3">
              <ImageGallery images={galleryImages} />
              <div className="flex flex-wrap gap-2">
                {productMedia.map((m) => (
                  <Button
                    key={m.id}
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive"
                    onClick={() => handleMediaDelete(m.id)}
                    disabled={deleteMediaMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete {m.role}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Product Model</DialogTitle>
          </DialogHeader>
          <ProductForm
            product={product}
            loading={updateMutation.isPending}
            onSubmit={handleUpdate}
            onCancel={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Product Model"
        description="This will also remove linked config groups and media. Are you sure?"
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
