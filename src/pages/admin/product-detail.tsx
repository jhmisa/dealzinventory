import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Pencil,
  Image,
  Video,
  Trash2,
  X,
  Play,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog, FormSkeleton } from '@/components/shared'
import { ProductForm } from '@/components/items/product-form'
import {
  useProductModel,
  useUpdateProductModel,
  useDeleteProductModel,
  useDeleteProductMedia,
  useReorderProductMedia,
} from '@/hooks/use-product-models'
import { PRODUCT_STATUSES, getSpecFieldLabel } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { ProductModelFormValues } from '@/validators/product-model'

// ─── Sub-components ──────────────────────────────────────────────

interface MediaItem {
  id: string
  file_url: string
  media_type: string
  role: string
  sort_order: number
}

function SpecRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-2.5 border-t border-zinc-100">
      <span className="text-[13px] text-zinc-500 leading-4">{label}</span>
      <span className={cn('text-[13px] leading-4', value ? 'text-zinc-900 font-medium' : 'text-zinc-300')}>
        {value || '--'}
      </span>
    </div>
  )
}

interface SortableThumbnailProps {
  media: MediaItem
  isSelected: boolean
  onClick: () => void
}

function SortableThumbnail({ media, isSelected, onClick }: SortableThumbnailProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: media.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative shrink-0 w-[72px] h-[60px] lg:w-[110px] lg:h-[90px] rounded-lg overflow-hidden cursor-pointer bg-zinc-100',
        isSelected ? 'border-2 border-zinc-900' : '',
        isDragging && 'shadow-lg',
      )}
      onClick={onClick}
    >
      {media.media_type === 'video' ? (
        <>
          <video src={media.file_url} className="w-full h-full object-cover" muted preload="metadata" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Play className="h-4 w-4 text-white fill-white" />
          </div>
        </>
      ) : (
        <img src={media.file_url} alt="" className="w-full h-full object-cover" />
      )}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-1.5 left-1.5 flex flex-col gap-0.5 opacity-50 cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-0.5">
          <div className="w-[3px] h-[3px] rounded-full bg-zinc-500" />
          <div className="w-[3px] h-[3px] rounded-full bg-zinc-500" />
        </div>
        <div className="flex gap-0.5">
          <div className="w-[3px] h-[3px] rounded-full bg-zinc-500" />
          <div className="w-[3px] h-[3px] rounded-full bg-zinc-500" />
        </div>
        <div className="flex gap-0.5">
          <div className="w-[3px] h-[3px] rounded-full bg-zinc-500" />
          <div className="w-[3px] h-[3px] rounded-full bg-zinc-500" />
        </div>
      </div>
    </div>
  )
}

// ─── Image placeholder icon ─────────────────────────────────────

function ImagePlaceholder({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

// ─── Main Page Component ─────────────────────────────────────────

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // Dialogs
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Media state
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // Data
  const { data: product, isLoading } = useProductModel(id!)
  const updateMutation = useUpdateProductModel()
  const deleteMutation = useDeleteProductModel()
  const deleteMediaMutation = useDeleteProductMedia()
  const reorderMutation = useReorderProductMedia()

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ─── Handlers ──────────────────────────────────────────────────

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

  function handleMediaDelete(mediaId: string) {
    if (!window.confirm('Delete this media?')) return
    deleteMediaMutation.mutate(mediaId, {
      onError: (err) => toast.error(`Failed to delete media: ${err.message}`),
    })
  }

  // ─── Loading / Not found ───────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <FormSkeleton fields={6} />
      </div>
    )
  }

  if (!product) {
    return <div className="text-center py-12 text-muted-foreground">Product not found.</div>
  }

  // ─── Derived data ──────────────────────────────────────────────

  const category = (product as typeof product & { categories?: { name: string; form_fields: string[]; description_fields: string[] } | null }).categories
  const formFields = new Set(category?.form_fields ?? [])

  const productMedia = (product as typeof product & { product_media?: MediaItem[] }).product_media ?? []
  const photos = productMedia.filter((m) => m.media_type === 'image').sort((a, b) => a.sort_order - b.sort_order)
  const videos = productMedia.filter((m) => m.media_type === 'video').sort((a, b) => a.sort_order - b.sort_order)

  return (
    <ProductDetailContent
      product={product}
      category={category}
      formFields={formFields}
      photos={photos}
      videos={videos}
      selectedIndex={selectedIndex}
      setSelectedIndex={setSelectedIndex}
      lightboxOpen={lightboxOpen}
      setLightboxOpen={setLightboxOpen}
      editOpen={editOpen}
      setEditOpen={setEditOpen}
      deleteOpen={deleteOpen}
      setDeleteOpen={setDeleteOpen}
      sensors={sensors}
      reorderMutation={reorderMutation}
      updateMutation={updateMutation}
      deleteMutation={deleteMutation}
      handleUpdate={handleUpdate}
      handleDelete={handleDelete}
      handleMediaDelete={handleMediaDelete}
      navigate={navigate}
      id={id!}
    />
  )
}

// Separate content component to use hooks after data is loaded
function ProductDetailContent({
  product,
  category,
  formFields,
  photos,
  videos,
  selectedIndex,
  setSelectedIndex,
  lightboxOpen,
  setLightboxOpen,
  editOpen,
  setEditOpen,
  deleteOpen,
  setDeleteOpen,
  sensors,
  reorderMutation,
  updateMutation,
  deleteMutation,
  handleUpdate,
  handleDelete,
  handleMediaDelete,
  navigate,
  id,
}: {
  product: any
  category: any
  formFields: Set<string>
  photos: MediaItem[]
  videos: MediaItem[]
  selectedIndex: number
  setSelectedIndex: (i: number) => void
  lightboxOpen: boolean
  setLightboxOpen: (b: boolean) => void
  editOpen: boolean
  setEditOpen: (b: boolean) => void
  deleteOpen: boolean
  setDeleteOpen: (b: boolean) => void
  sensors: any
  reorderMutation: any
  updateMutation: any
  deleteMutation: any
  handleUpdate: (v: ProductModelFormValues) => void
  handleDelete: () => void
  handleMediaDelete: (mediaId: string) => void
  navigate: (path: string) => void
  id: string
}) {
  const [mediaTab, setMediaTab] = useState<string>('photos')
  const currentMediaList = mediaTab === 'photos' ? photos : videos
  const heroMedia = currentMediaList[selectedIndex] ?? currentMediaList[0] ?? null

  // Keep selectedIndex in bounds
  useEffect(() => {
    if (selectedIndex >= currentMediaList.length && currentMediaList.length > 0) {
      setSelectedIndex(currentMediaList.length - 1)
    }
  }, [currentMediaList.length, selectedIndex, setSelectedIndex])

  // Reset index when switching tabs
  function handleTabChange(value: string) {
    setMediaTab(value)
    setSelectedIndex(0)
  }

  function goToPrev() {
    setSelectedIndex(selectedIndex > 0 ? selectedIndex - 1 : currentMediaList.length - 1)
  }

  function goToNext() {
    setSelectedIndex(selectedIndex < currentMediaList.length - 1 ? selectedIndex + 1 : 0)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const items = mediaTab === 'photos' ? photos : videos
    const oldIndex = items.findIndex((m) => m.id === active.id)
    const newIndex = items.findIndex((m) => m.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(items, oldIndex, newIndex)
    reorderMutation.mutate(reordered.map((m: MediaItem, i: number) => ({ id: m.id, sort_order: i })))
  }

  const productStatusConfig = PRODUCT_STATUSES.find((s) => s.value === product.status)
  const subtitle = [product.model_name, product.color].filter(Boolean).join(' · ')

  return (
    <>
      {/* ─── Mobile Top Bar ─── */}
      <div className="flex items-center justify-between w-full py-3 px-5 border-b border-zinc-200 lg:hidden">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate('/admin/products')} aria-label="Back">
            <ChevronLeft className="h-5 w-5 text-zinc-900" />
          </button>
          <span className="text-[15px] font-semibold text-zinc-900">Product Detail</span>
        </div>
      </div>

      {/* ─── Desktop Breadcrumb Bar ─── */}
      <div className="hidden lg:flex items-center gap-2 px-12 py-4 border-b border-zinc-200">
        <span className="text-xl font-semibold text-zinc-900">Inventory</span>
        <span className="text-[13px] text-zinc-500">/ Products / Detail</span>
      </div>

      {/* ─── Mobile: Status + Name + Actions ─── */}
      <div className="flex flex-col w-full pt-4 pb-1 gap-1.5 px-5 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-widest uppercase font-semibold text-zinc-900">
            {productStatusConfig?.label ?? product.status}
          </span>
          <span className="w-[3px] h-[3px] rounded-full bg-zinc-300" />
          <span className="text-[10px] tracking-widest uppercase font-medium text-zinc-500">
            {category?.name ?? 'Uncategorized'}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-zinc-900">{product.brand} {product.model_name}</h1>
        {subtitle && <p className="text-[13px] text-zinc-500">{subtitle}</p>}
        {product.short_description && (
          <p className="text-[13px] text-zinc-500 pt-1">{product.short_description}</p>
        )}
      </div>

      {/* ─── Mobile: Segmented Action Bar ─── */}
      <div className="flex w-full pt-3 pb-4 px-5 lg:hidden">
        <button
          onClick={() => setEditOpen(true)}
          className="flex items-center justify-center grow shrink basis-0 py-2 gap-[5px] bg-zinc-900 text-white"
        >
          <Pencil className="h-[13px] w-[13px]" />
          <span className="text-xs font-medium">Edit</span>
        </button>
        <button
          onClick={() => navigate(`/admin/products/${id}/media-studio`)}
          className="flex items-center justify-center grow shrink basis-0 py-2 gap-[5px] bg-white border-t border-b border-r border-zinc-200 text-zinc-900"
        >
          <Image className="h-[13px] w-[13px]" />
          <span className="text-xs font-medium">Photo</span>
        </button>
        <button
          onClick={() => navigate(`/admin/products/${id}/media-studio?tab=video`)}
          className="flex items-center justify-center grow shrink basis-0 py-2 gap-[5px] bg-white border-t border-b border-r border-zinc-200 text-zinc-900"
        >
          <Video className="h-[13px] w-[13px]" />
          <span className="text-xs font-medium">Video</span>
        </button>
        <button
          onClick={() => setDeleteOpen(true)}
          className="flex items-center justify-center grow shrink basis-0 py-2 gap-[5px] bg-white border border-zinc-200 text-red-500"
        >
          <Trash2 className="h-[13px] w-[13px]" />
          <span className="text-xs font-medium">Delete</span>
        </button>
      </div>

      {/* ─── Main Content: Two-column desktop / Stacked mobile ─── */}
      <div className="flex flex-col lg:flex-row lg:gap-14 lg:p-12">
        {/* ─── LEFT COLUMN: Media ─── */}
        <div className="flex flex-col shrink-0 lg:w-[512px] gap-3">
          {/* Hero Image */}
          <div className="w-full h-[300px] lg:h-[420px] flex items-center justify-center rounded-none lg:rounded-xl relative bg-zinc-100 shrink-0 overflow-hidden">
            {heroMedia ? (
              heroMedia.media_type === 'video' ? (
                <video
                  src={heroMedia.file_url}
                  className="w-full h-full object-contain"
                  controls
                  muted
                  preload="metadata"
                />
              ) : (
                <img
                  src={heroMedia.file_url}
                  alt={`${product.brand} ${product.model_name}`}
                  className="w-full h-full object-contain"
                />
              )
            ) : (
              <ImagePlaceholder size={64} />
            )}

            {/* Prev/Next navigation */}
            {currentMediaList.length > 1 && (
              <>
                <button
                  onClick={goToPrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/90 size-9 lg:size-9 hover:bg-white transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 text-zinc-900" />
                </button>
                <button
                  onClick={goToNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/90 size-9 lg:size-9 hover:bg-white transition-colors"
                >
                  <ChevronRight className="h-4 w-4 text-zinc-900" />
                </button>
              </>
            )}

            {/* Fullscreen icon */}
            {heroMedia && (
              <button
                onClick={() => setLightboxOpen(true)}
                className="absolute top-3 right-3 flex items-center justify-center rounded-md bg-white/90 size-8 hover:bg-white transition-colors"
              >
                <Maximize2 className="h-3.5 w-3.5 text-zinc-900" />
              </button>
            )}
          </div>

          {/* Tabs + Thumbnails */}
          <div className="px-5 lg:px-0">
            <Tabs value={mediaTab} onValueChange={handleTabChange}>
              <TabsList variant="line" className="border-b border-zinc-200 w-full justify-start">
                <TabsTrigger value="photos" className="text-base">
                  Photos ({photos.length.toString().padStart(2, '0')})
                </TabsTrigger>
                <TabsTrigger value="videos" className="text-base">
                  Videos ({videos.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="photos" className="pt-3">
                {photos.length > 0 ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={photos.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {photos.map((media, idx) => (
                          <SortableThumbnail
                            key={media.id}
                            media={media}
                            isSelected={mediaTab === 'photos' && idx === selectedIndex}
                            onClick={() => setSelectedIndex(idx)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <p className="text-sm text-zinc-400 py-4">No photos yet. Click "Add Photo" to upload.</p>
                )}
              </TabsContent>

              <TabsContent value="videos" className="pt-3">
                {videos.length > 0 ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={videos.map((v) => v.id)} strategy={horizontalListSortingStrategy}>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {videos.map((media, idx) => (
                          <SortableThumbnail
                            key={media.id}
                            media={media}
                            isSelected={mediaTab === 'videos' && idx === selectedIndex}
                            onClick={() => setSelectedIndex(idx)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <p className="text-sm text-zinc-400 py-4">No videos yet. Click "Add Video" to upload.</p>
                )}
              </TabsContent>
            </Tabs>

            {currentMediaList.length > 0 && (
              <p className="text-[11px] text-zinc-400 mt-1">
                Drag to reorder. First image is the main display.
              </p>
            )}
          </div>
        </div>

        {/* ─── RIGHT COLUMN: Info ─── */}
        <div className="flex flex-col gap-8 flex-1 min-w-0">
          {/* Desktop: Status + Name (hidden on mobile since it's above) */}
          <div className="hidden lg:flex flex-col gap-2 max-w-[518px]">
            <div className="flex items-center gap-3">
              <span className="text-[11px] tracking-widest uppercase font-semibold text-zinc-900">
                {productStatusConfig?.label ?? product.status}
              </span>
              <span className="w-1 h-1 rounded-full bg-zinc-300" />
              <span className="text-[11px] tracking-widest uppercase font-medium text-zinc-500">
                {category?.name ?? 'Uncategorized'}
              </span>
            </div>
            <h1 className="text-4xl font-bold text-zinc-900 leading-10">
              {product.brand} {product.model_name}
            </h1>
            <div className="text-base text-zinc-500 leading-5 space-y-1">
              {subtitle && <p>{subtitle}</p>}
              {product.short_description && <p>{product.short_description}</p>}
            </div>
          </div>

          {/* Spec Sections */}
          <div className="flex flex-col w-full gap-7 px-5 lg:px-0">
            {/* Specs + Config side by side on desktop, stacked on mobile */}
            <div className="flex flex-col lg:flex-row w-full lg:gap-10">
              {/* Specifications */}
              <div className="flex flex-col grow shrink basis-0">
                <h3 className="text-[13px] pb-3 font-semibold text-zinc-900 leading-4">Specifications</h3>
                <SpecRow label="Brand" value={product.brand} />
                <SpecRow label="Model" value={product.model_name} />
                <SpecRow label="Color" value={product.color} />
                <SpecRow label="Category" value={category?.name} />
                {formFields.has('chipset') && (
                  <SpecRow label={getSpecFieldLabel('chipset')} value={product.chipset} />
                )}
                {formFields.has('screen_size') && (
                  <SpecRow label={getSpecFieldLabel('screen_size')} value={product.screen_size ? `${product.screen_size}"` : null} />
                )}
                {formFields.has('ports') && (
                  <SpecRow label={getSpecFieldLabel('ports')} value={product.ports} />
                )}
              </div>

              {/* Configuration */}
              <div className="flex flex-col grow shrink basis-0 pt-4 lg:pt-0">
                <h3 className="text-[13px] pb-3 font-semibold text-zinc-900 leading-4">Configuration</h3>
                {formFields.has('cpu') && (
                  <SpecRow label={getSpecFieldLabel('cpu')} value={product.cpu} />
                )}
                {formFields.has('os_family') && (
                  <SpecRow label={getSpecFieldLabel('os_family')} value={product.os_family} />
                )}
                {formFields.has('gpu') && (
                  <SpecRow label={getSpecFieldLabel('gpu')} value={product.gpu} />
                )}
                {formFields.has('keyboard_layout') && (
                  <SpecRow label={getSpecFieldLabel('keyboard_layout')} value={product.keyboard_layout} />
                )}
                {formFields.has('ram_gb') && (
                  <SpecRow label={getSpecFieldLabel('ram_gb')} value={product.ram_gb ? `${product.ram_gb}GB` : null} />
                )}
                {formFields.has('storage_gb') && (
                  <SpecRow label={getSpecFieldLabel('storage_gb')} value={product.storage_gb ? `${product.storage_gb}GB` : null} />
                )}
                {formFields.has('carrier') && (
                  <SpecRow label={getSpecFieldLabel('carrier')} value={product.carrier} />
                )}
              </div>
            </div>

            {/* Hardware Section */}
            {(formFields.has('has_touchscreen') || formFields.has('has_thunderbolt') || formFields.has('supports_stylus') || formFields.has('has_cellular') || formFields.has('is_unlocked') || formFields.has('imei_slot_count')) && (
              <div className="flex flex-col lg:w-1/2">
                <h3 className="text-[13px] pb-3 font-semibold text-zinc-900 leading-4">Hardware</h3>
                {formFields.has('screen_size') && (
                  <SpecRow label={getSpecFieldLabel('screen_size')} value={product.screen_size ? `${product.screen_size}"` : null} />
                )}
                {formFields.has('has_touchscreen') && (
                  <SpecRow label={getSpecFieldLabel('has_touchscreen')} value={product.has_touchscreen ? 'Yes' : 'No'} />
                )}
                {formFields.has('has_thunderbolt') && (
                  <SpecRow label={getSpecFieldLabel('has_thunderbolt')} value={product.has_thunderbolt ? 'Yes' : 'No'} />
                )}
                {formFields.has('supports_stylus') && (
                  <SpecRow label={getSpecFieldLabel('supports_stylus')} value={product.supports_stylus ? 'Yes' : 'No'} />
                )}
                {formFields.has('has_cellular') && (
                  <SpecRow label={getSpecFieldLabel('has_cellular')} value={product.has_cellular ? 'Yes' : 'No'} />
                )}
                {formFields.has('is_unlocked') && (
                  <SpecRow label={getSpecFieldLabel('is_unlocked')} value={product.is_unlocked ? 'Yes' : 'No'} />
                )}
                {formFields.has('imei_slot_count') && (
                  <SpecRow label={getSpecFieldLabel('imei_slot_count')} value={product.imei_slot_count?.toString()} />
                )}
              </div>
            )}

            {/* Other Features */}
            {product.other_features && (
              <div className="flex flex-col lg:w-1/2">
                <h3 className="text-[13px] pb-3 font-semibold text-zinc-900 leading-4">Other Features</h3>
                <p className="text-[13px] text-zinc-700 leading-5 whitespace-pre-wrap">{product.other_features}</p>
              </div>
            )}
          </div>

          {/* Desktop Action Buttons */}
          <div className="hidden lg:flex items-center pt-2 gap-2.5 px-5 lg:px-0">
            <Button onClick={() => setEditOpen(true)} className="gap-2">
              <Pencil className="h-[15px] w-[15px]" />
              Edit Product
            </Button>
            <Button variant="outline" onClick={() => navigate(`/admin/products/${id}/media-studio`)} className="gap-2">
              <Image className="h-[15px] w-[15px]" />
              Add Photo
            </Button>
            <Button variant="outline" onClick={() => navigate(`/admin/products/${id}/media-studio?tab=video`)} className="gap-2">
              <Video className="h-[15px] w-[15px]" />
              Add Video
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="gap-2 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-[15px] w-[15px]" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Lightbox Overlay ─── */}
      {lightboxOpen && currentMediaList.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-md p-2"
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(false) }}
          >
            <X className="h-6 w-6" />
          </button>

          {currentMediaList.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 rounded-full p-2"
                onClick={(e) => { e.stopPropagation(); goToPrev() }}
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 rounded-full p-2"
                onClick={(e) => { e.stopPropagation(); goToNext() }}
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            </>
          )}

          {heroMedia?.media_type === 'video' ? (
            <video
              src={heroMedia.file_url}
              className="max-h-[85vh] max-w-[90vw] object-contain"
              onClick={(e) => e.stopPropagation()}
              controls
              autoPlay
              muted
            />
          ) : (
            <img
              src={heroMedia?.file_url}
              alt={`${product.brand} ${product.model_name}`}
              className="max-h-[85vh] max-w-[90vw] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          <div className="absolute bottom-4 text-white text-sm">
            {selectedIndex + 1} / {currentMediaList.length}
          </div>
        </div>
      )}

      {/* ─── Edit Dialog ─── */}
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

      {/* ─── Delete Confirm ─── */}
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
    </>
  )
}
