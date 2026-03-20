import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Circle,
  Image as ImageIcon,
  Maximize2,
  Plus,
  Video,
  X,
  Edit3,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
// Tabs components available if needed later
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FormSkeleton, GradeBadge } from '@/components/shared'
import { ProductPicker } from '@/components/intake/product-picker'
import {
  DefectSection,
  AdditionalCostsSection,
} from '@/components/inspection'
import { useItem, useUpdateItem } from '@/hooks/use-items'
import { useProductModelsWithHeroImage, useProductModel } from '@/hooks/use-product-models'
import { useItemDefects } from '@/hooks/use-item-defects'
import { inspectionSchema, type InspectionFormValues } from '@/validators/inspection'
import { CONDITION_GRADES, DEFECT_TYPES, FUNCTIONALITY_CHECKS, SPEC_CHECK_FIELDS } from '@/lib/constants'
import type { DeviceCategory } from '@/lib/constants'
import type { ProductModel, ItemCost, ItemMedia } from '@/lib/types'
import { cn, formatPrice } from '@/lib/utils'

// --- Product Media Preview (shop-like gallery) ---

interface ProductMediaItem {
  id: string
  file_url: string
  media_type: string
  role: string
  sort_order: number
}

interface DefectPhoto {
  id: string
  file_url: string
  label: string
}

function MediaViewer({
  productId,
  itemMedia,
  defectPhotos,
}: {
  productId: string | null
  itemMedia: ItemMedia[]
  defectPhotos: DefectPhoto[]
}) {
  const { data: product } = useProductModel(productId ?? '')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('photos')

  const allMedia = ((product?.product_media ?? []) as ProductMediaItem[])
    .sort((a, b) => {
      if (a.role === 'hero' && b.role !== 'hero') return -1
      if (b.role === 'hero' && a.role !== 'hero') return 1
      return a.sort_order - b.sort_order
    })

  const photos = allMedia.filter((m) => m.media_type === 'image')
  const videos = allMedia.filter((m) => m.media_type === 'video')

  // "Actual" tab: combine item media photos + defect photos
  const actualPhotos = [
    ...itemMedia.map((m) => ({ id: m.id, file_url: m.file_url, label: m.description ?? 'Item photo' })),
    ...defectPhotos,
  ]

  const currentPhotos = activeTab === 'photos' ? photos : activeTab === 'actual' ? actualPhotos : []
  const safeIndex = Math.min(selectedIndex, Math.max(currentPhotos.length - 1, 0))

  function goPrev() {
    setSelectedIndex((i) => (i > 0 ? i - 1 : currentPhotos.length - 1))
  }

  function goNext() {
    setSelectedIndex((i) => (i < currentPhotos.length - 1 ? i + 1 : 0))
  }

  function handleTabChange(tab: string) {
    setActiveTab(tab)
    setSelectedIndex(0)
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          type="button"
          className={cn(
            'pr-3.5 py-1.5 text-sm font-medium transition-colors',
            activeTab === 'photos'
              ? 'border-b-2 border-foreground text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => handleTabChange('photos')}
        >
          Photos ({photos.length})
        </button>
        <button
          type="button"
          className={cn(
            'px-3.5 py-1.5 text-sm font-medium transition-colors',
            activeTab === 'videos'
              ? 'border-b-2 border-foreground text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => handleTabChange('videos')}
        >
          Videos ({videos.length})
        </button>
        <button
          type="button"
          className={cn(
            'px-3.5 py-1.5 text-sm font-medium transition-colors',
            activeTab === 'actual'
              ? 'border-b-2 border-foreground text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => handleTabChange('actual')}
        >
          Actual ({actualPhotos.length})
        </button>
      </div>

      {/* Hero Image */}
      {activeTab === 'videos' ? (
        <div className="space-y-2">
          {videos.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {videos.map((v) => (
                <div key={v.id} className="aspect-video rounded-lg overflow-hidden border bg-muted">
                  <video src={v.file_url} controls preload="metadata" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <div className="h-60 lg:h-80 flex items-center justify-center rounded-xl bg-muted">
              <Video className="h-10 w-10 text-muted-foreground/50" />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="relative group">
            <div
              className="h-60 lg:h-80 w-full flex items-center justify-center rounded-xl bg-muted overflow-hidden cursor-pointer"
              onClick={() => currentPhotos.length > 0 && setLightboxOpen(true)}
            >
              {currentPhotos.length > 0 ? (
                <img
                  src={currentPhotos[safeIndex]?.file_url}
                  alt="Product photo"
                  className="w-full h-full object-contain"
                />
              ) : (
                <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
              )}
            </div>

            {/* Nav arrows */}
            {currentPhotos.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center size-8 lg:size-7 rounded-full bg-white/90 dark:bg-black/60 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); goPrev() }}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center size-8 lg:size-7 rounded-full bg-white/90 dark:bg-black/60 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); goNext() }}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </>
            )}

            {/* Fullscreen button */}
            {currentPhotos.length > 0 && (
              <button
                type="button"
                className="absolute top-2.5 right-2.5 flex items-center justify-center size-7 rounded-md bg-white/90 dark:bg-black/60"
                onClick={(e) => { e.stopPropagation(); setLightboxOpen(true) }}
              >
                <Maximize2 className="h-3 w-3" />
              </button>
            )}

            {/* Counter */}
            {currentPhotos.length > 1 && (
              <div className="absolute bottom-2.5 right-2.5 rounded-sm py-0.5 px-2 bg-black/60 text-white text-xs">
                {safeIndex + 1} / {currentPhotos.length}
              </div>
            )}
          </div>

          {/* Thumbnails */}
          {currentPhotos.length > 1 && (
            <div className="flex gap-1.5 lg:gap-2 overflow-x-auto pb-1">
              {currentPhotos.map((photo, i) => (
                <button
                  key={photo.id}
                  type="button"
                  className={cn(
                    'shrink-0 w-[60px] h-12 lg:w-[72px] lg:h-14 rounded-md overflow-hidden bg-muted transition-all',
                    i === safeIndex
                      ? 'border-2 border-foreground'
                      : 'border border-transparent opacity-60 hover:opacity-100',
                  )}
                  onClick={() => setSelectedIndex(i)}
                >
                  <img src={photo.file_url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Lightbox */}
      {lightboxOpen && currentPhotos.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/10 z-10"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>

          {currentPhotos.length > 1 && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/10 h-10 w-10"
                onClick={(e) => { e.stopPropagation(); goPrev() }}
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/10 h-10 w-10"
                onClick={(e) => { e.stopPropagation(); goNext() }}
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </>
          )}

          <img
            src={currentPhotos[safeIndex]?.file_url}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
            {safeIndex + 1} / {currentPhotos.length}
          </div>
        </div>
      )}
    </div>
  )
}

// --- AC Adapter Segmented Toggle ---
const AC_OPTIONS = [
  { value: 'CORRECT', label: 'Correct', mobileLabel: 'OK' },
  { value: 'INCORRECT', label: 'Incorrect', mobileLabel: 'Wrong' },
  { value: 'MISSING', label: 'Missing', mobileLabel: 'N/A' },
] as const

function AcAdapterToggle({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (val: string) => void
}) {
  return (
    <div className="flex">
      {AC_OPTIONS.map((option, i) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            'flex-1 py-2 px-3.5 text-[11px] leading-3.5 transition-colors border border-border',
            i === 0 && 'rounded-l-[5px]',
            i === AC_OPTIONS.length - 1 && 'rounded-r-[5px]',
            i > 0 && 'border-l-0',
            value === option.value
              ? 'bg-foreground text-background font-medium border-foreground'
              : 'text-muted-foreground hover:bg-muted',
          )}
          onClick={() => onChange(option.value)}
        >
          <span className="hidden sm:inline">{option.label}</span>
          <span className="sm:hidden">{option.mobileLabel}</span>
        </button>
      ))}
    </div>
  )
}

// --- Compact Defects List ---
function CompactDefectsList({
  itemId,
  defects,
  deviceCategory,
}: {
  itemId: string
  defects: { area: string; id: string; defect_type: string; description?: string | null; photo_url?: string | null }[]
  deviceCategory: DeviceCategory | null
}) {
  const [expandedArea, setExpandedArea] = useState<string | null>(null)

  const areas: { key: string; label: string }[] = [
    { key: 'body', label: 'Body' },
    { key: 'screen', label: 'Screen' },
    ...(deviceCategory === 'COMPUTER' || deviceCategory === 'TABLET'
      ? [{ key: 'keyboard', label: 'Keyboard' }]
      : []),
    { key: 'other', label: 'Other' },
  ]

  return (
    <div className="space-y-2">
      <h3 className="text-[15px] font-semibold leading-[18px] lg:text-[15px]">Defects Found</h3>
      <div className="rounded-md overflow-hidden border border-border">
        {areas.map((area, i) => {
          const areaDefects = defects.filter((d) => d.area === area.key)
          const isLast = i === areas.length - 1
          const isExpanded = expandedArea === area.key

          return (
            <div key={area.key}>
              {/* Area header row */}
              <div
                className={cn(
                  'flex items-center justify-between py-2.5 px-3.5',
                  !isLast && !isExpanded && 'border-b border-muted',
                  isExpanded && 'border-b border-muted',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px] leading-4">{area.label}</span>
                  {areaDefects.length > 0 && (
                    <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full font-medium">
                      {areaDefects.length}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="flex items-center gap-0.5 text-[11px] font-medium hover:text-foreground/80 transition-colors"
                  onClick={() => setExpandedArea(isExpanded ? null : area.key)}
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </div>

              {/* Expanded: show defect section inline */}
              {isExpanded && (
                <div className={cn('px-2 pb-2', !isLast && 'border-b border-muted')}>
                  <DefectSection
                    itemId={itemId}
                    area={area.key as 'body' | 'screen' | 'keyboard' | 'other'}
                    title=""
                    defects={areaDefects}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Main Page ---

export default function InspectItemPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: item, isLoading } = useItem(id!)
  const { data: productsWithHero } = useProductModelsWithHeroImage()
  const updateMutation = useUpdateItem()
  const [editingSellingPrice, setEditingSellingPrice] = useState(false)

  const pm = item?.product_models as ProductModel | null
  const supplier = (item?.suppliers as { supplier_name: string } | null)?.supplier_name ?? null
  const deviceCategory = (item?.device_category ?? pm?.device_category ?? null) as DeviceCategory | null
  const itemCosts = ((item as Record<string, unknown>)?.item_costs ?? []) as ItemCost[]
  const itemMedia = ((item as Record<string, unknown>)?.item_media ?? []) as ItemMedia[]

  // Fetch defects for this item
  const { data: defects = [] } = useItemDefects(item?.id ?? '')

  // Parse existing checklist from item
  const existingChecklist = (item?.inspection_checklist ?? {}) as Record<string, unknown>

  const form = useForm<InspectionFormValues>({
    resolver: zodResolver(inspectionSchema),
    values: item ? {
      condition_grade: item.condition_grade ?? undefined as unknown as InspectionFormValues['condition_grade'],
      item_status: (item.item_status === 'INTAKE' ? 'AVAILABLE' : item.item_status) as InspectionFormValues['item_status'],
      product_id: '',
      ac_adapter_status: item.ac_adapter_status ?? undefined,
      battery_health_pct: item.battery_health_pct ?? null,
      inspection_checklist: {
        func_keyboard_status: existingChecklist.func_keyboard_status as string ?? '',
        func_keyboard_note: existingChecklist.func_keyboard_note as string ?? '',
        func_trackpad_status: existingChecklist.func_trackpad_status as string ?? '',
        func_trackpad_note: existingChecklist.func_trackpad_note as string ?? '',
        func_ports_status: existingChecklist.func_ports_status as string ?? '',
        func_ports_note: existingChecklist.func_ports_note as string ?? '',
        func_mic_earpiece_status: existingChecklist.func_mic_earpiece_status as string ?? '',
        func_mic_earpiece_note: existingChecklist.func_mic_earpiece_note as string ?? '',
        func_buttons_status: existingChecklist.func_buttons_status as string ?? '',
        func_buttons_note: existingChecklist.func_buttons_note as string ?? '',
        func_sim_status: existingChecklist.func_sim_status as string ?? '',
        func_sim_note: existingChecklist.func_sim_note as string ?? '',
        func_touchscreen_status: existingChecklist.func_touchscreen_status as string ?? '',
        func_touchscreen_note: existingChecklist.func_touchscreen_note as string ?? '',
        func_camera_status: existingChecklist.func_camera_status as string ?? '',
        func_camera_note: existingChecklist.func_camera_note as string ?? '',
        func_speakers_status: existingChecklist.func_speakers_status as string ?? '',
        func_speakers_note: existingChecklist.func_speakers_note as string ?? '',
        func_wifi_status: existingChecklist.func_wifi_status as string ?? '',
        func_wifi_note: existingChecklist.func_wifi_note as string ?? '',
        func_bluetooth_status: existingChecklist.func_bluetooth_status as string ?? '',
        func_bluetooth_note: existingChecklist.func_bluetooth_note as string ?? '',
      },
      cpu: item.cpu ?? pm?.cpu ?? '',
      ram_gb: item.ram_gb ?? pm?.ram_gb ?? null,
      storage_gb: item.storage_gb ?? pm?.storage_gb ?? null,
      os_family: item.os_family ?? pm?.os_family ?? '',
      screen_size: item.screen_size ?? pm?.screen_size ?? null,
      keyboard_layout: item.keyboard_layout ?? pm?.keyboard_layout ?? '',
      gpu: item.gpu ?? pm?.gpu ?? '',
      color: item.color ?? pm?.color ?? '',
      carrier: item.carrier ?? pm?.carrier ?? '',
      is_unlocked: item.is_unlocked ?? pm?.is_unlocked ?? null,
      imei: item.imei ?? '',
      specs_verified: false,
      specs_notes: item.specs_notes ?? '',
      condition_notes: item.condition_notes ?? '',
      purchase_price: item.purchase_price ?? null,
      selling_price: item.selling_price ?? null,
    } : undefined,
  })

  // Filtered spec fields and functionality checks (safe to compute before early returns)
  const specFields = SPEC_CHECK_FIELDS.filter(
    (f) => !deviceCategory || f.categories.includes(deviceCategory)
  )
  const funcChecks = FUNCTIONALITY_CHECKS.filter(
    (f) => !deviceCategory || f.categories.includes(deviceCategory)
  )
  const showAcAdapter = !deviceCategory || ['COMPUTER', 'TABLET', 'OTHER'].includes(deviceCategory)

  // Price calculations
  const purchasePrice = form.watch('purchase_price') ?? 0
  const sellingPrice = form.watch('selling_price') ?? 0
  const totalCosts = itemCosts.reduce((sum, c) => sum + (c.amount ?? 0), 0)
  const totalCost = purchasePrice + totalCosts
  const estProfit = sellingPrice - totalCost

  const effectiveProductId = form.watch('product_id') || item?.product_id

  // --- Auto-generate condition notes from defects + functionality problems ---
  const manuallyEditedNotes = useRef(false)

  const buildConditionNotes = useCallback(() => {
    const parts: string[] = []

    // Group defects by area
    const areaGroups: Record<string, string[]> = {}
    for (const defect of defects) {
      const areaLabel = defect.area.charAt(0).toUpperCase() + defect.area.slice(1)
      if (!areaGroups[areaLabel]) areaGroups[areaLabel] = []

      // Get readable label for the defect type
      let label = defect.defect_type
      if (defect.area !== 'other') {
        const areaTypes = DEFECT_TYPES[defect.area as keyof typeof DEFECT_TYPES]
        if (areaTypes) {
          const found = areaTypes.find((d) => d.value === defect.defect_type)
          if (found) label = found.label
        }
      }
      areaGroups[areaLabel].push(label)
    }

    // Build defect summary: "Body: Scratch, Dent. Screen: Crack."
    for (const [area, types] of Object.entries(areaGroups)) {
      parts.push(`${area}: ${types.join(', ')}`)
    }

    // Build functionality issues: "Keyboard issue, ASDF not typing."
    const checklist = form.getValues('inspection_checklist')
    if (checklist) {
      for (const check of funcChecks) {
        const statusKey = `${check.key}_status` as keyof typeof checklist
        const noteKey = `${check.key}_note` as keyof typeof checklist
        const status = checklist[statusKey]
        if (status === 'PROBLEM') {
          const note = checklist[noteKey] as string
          if (note?.trim()) {
            parts.push(`${check.label} issue, ${note.trim()}`)
          } else {
            parts.push(`${check.label} issue`)
          }
        }
      }
    }

    // Append "please view photos" if there are any defect photos
    const hasDefectPhotos = defects.some((d) => d.photo_url)
    if (parts.length > 0) {
      const summary = parts.join('. ') + '.'
      return hasDefectPhotos ? `${summary} Please view photos.` : summary
    }

    return ''
  }, [defects, funcChecks, form])

  // Auto-update condition notes when defects or functionality checks change
  const watchedChecklist = form.watch('inspection_checklist')

  useEffect(() => {
    if (manuallyEditedNotes.current) return
    const generated = buildConditionNotes()
    const current = form.getValues('condition_notes') ?? ''
    // Only auto-update if the current value looks auto-generated or is empty
    if (!current || current === generated || !manuallyEditedNotes.current) {
      form.setValue('condition_notes', generated, { shouldDirty: true })
    }
  }, [defects, watchedChecklist, buildConditionNotes, form])

  // --- Validation state for pre-submit checks ---
  const [validationIssues, setValidationIssues] = useState<string[]>([])
  const specsVerified = form.watch('specs_verified')
  const watchedColor = form.watch('color')
  const watchedAcAdapter = form.watch('ac_adapter_status')
  const watchedBattery = form.watch('battery_health_pct')
  const watchedGrade = form.watch('condition_grade')

  // Color mismatch detection
  const productColor = pm?.color ?? null
  const currentColor = watchedColor || item?.color || productColor || ''
  const colorMismatch = productColor && currentColor && productColor.toLowerCase() !== currentColor.toLowerCase()

  // Compute section completion status for visual indicators
  const funcChecksDone = funcChecks.every((check) => {
    const statusKey = `inspection_checklist.${check.key}_status` as const
    const val = form.getValues(statusKey as `inspection_checklist.${string}`) as string
    return val === 'WORKING' || val === 'PROBLEM'
  })

  const batteryDone = watchedBattery != null && watchedBattery !== '' && !isNaN(Number(watchedBattery))
  const acAdapterDone = !showAcAdapter || (!!watchedAcAdapter && watchedAcAdapter !== '')
  const colorDone = !!currentColor
  const gradeDone = !!watchedGrade

  // --- Early returns (after all hooks) ---
  if (isLoading) return <FormSkeleton fields={8} />
  if (!item) return <div className="text-center py-12 text-muted-foreground">Item not found.</div>

  function resolveSpecValue(key: string): string | number | boolean | null {
    const itemVal = (item as Record<string, unknown>)[key]
    if (itemVal !== null && itemVal !== undefined) return itemVal as string | number | boolean
    if (pm) {
      const pmVal = (pm as Record<string, unknown>)[key]
      if (pmVal !== null && pmVal !== undefined) return pmVal as string | number | boolean
    }
    return null
  }

  /** Pre-submit validation: checks that can't easily live in Zod (device-category-dependent) */
  function validateBeforeSubmit(values: InspectionFormValues): string[] {
    const issues: string[] = []

    // 1. All applicable functionality checks must be checked
    const checklist = values.inspection_checklist
    for (const check of funcChecks) {
      const statusKey = `${check.key}_status` as keyof typeof checklist
      const status = checklist[statusKey]
      if (!status || status === '') {
        issues.push(`Functionality: "${check.label}" not checked`)
      }
    }

    // 2. Battery health required
    if (values.battery_health_pct == null || values.battery_health_pct === '' as unknown) {
      issues.push('Battery health (%) is required')
    }

    // 3. AC Adapter required (if applicable)
    if (showAcAdapter && !values.ac_adapter_status) {
      issues.push('AC Adapter status is required')
    }

    // 4. Color must be filled
    const effectiveColor = values.color || item!.color || pm?.color
    if (!effectiveColor) {
      issues.push('Color is required')
    }

    // 5. Specs must be verified
    if (!values.specs_verified) {
      issues.push('Specs must be verified (check the "Specs verified" checkbox)')
    }

    // 6. Grade must be selected
    if (!values.condition_grade) {
      issues.push('Condition grade must be selected')
    }

    return issues
  }

  function handleSubmit(values: InspectionFormValues) {
    // Run pre-submit validation
    const issues = validateBeforeSubmit(values)
    if (issues.length > 0) {
      setValidationIssues(issues)
      toast.error(`${issues.length} issue${issues.length > 1 ? 's' : ''} to fix before completing inspection`)
      // Scroll to top to show the issues banner
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setValidationIssues([])
    updateMutation.mutate(
      {
        id: item!.id,
        updates: {
          condition_grade: values.condition_grade,
          item_status: values.item_status,
          product_id: values.product_id || item!.product_id,
          ac_adapter_status: values.ac_adapter_status ?? null,
          battery_health_pct: values.battery_health_pct ?? null,
          inspection_checklist: values.inspection_checklist as Record<string, unknown>,
          cpu: values.cpu || null,
          ram_gb: values.ram_gb ?? null,
          storage_gb: values.storage_gb ?? null,
          os_family: values.os_family || null,
          screen_size: values.screen_size ?? null,
          keyboard_layout: values.keyboard_layout || null,
          gpu: values.gpu || null,
          color: values.color || null,
          carrier: values.carrier || null,
          is_unlocked: values.is_unlocked ?? null,
          imei: values.imei || null,
          specs_notes: values.specs_notes || null,
          condition_notes: values.condition_notes || null,
          purchase_price: values.purchase_price ?? null,
          selling_price: values.selling_price ?? null,
          inspected_at: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => {
          toast.success('Inspection complete')
          navigate('/admin/inspection')
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col min-h-screen">
      {/* === Mobile Header === */}
      <div className="lg:hidden flex items-center justify-between w-full py-3 px-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => navigate('/admin/inspection')}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-[15px] font-semibold leading-[18px]">
            Inspect {item.item_code}
          </span>
        </div>
      </div>

      {/* === Desktop Header === */}
      <div className="hidden lg:block w-full pt-7 px-12">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/admin/inspection')}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-2xl font-bold">
                Inspect {item.item_code}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground ml-8">
              {pm ? `${pm.brand} ${pm.model_name}` : 'No product assigned'}{' '}
              {(item.color ?? pm?.color) && `· ${item.color ?? pm?.color}`}{' '}
              {deviceCategory && `· ${deviceCategory}`}
            </p>
            <div className="flex items-center ml-8 pt-1 gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">P-Code</span>
                <span className="font-semibold">{item.item_code}</span>
              </div>
              <div className="w-px h-3.5 bg-border" />
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Supplier</span>
                <span className="font-medium">{supplier ?? '—'}</span>
              </div>
              <div className="w-px h-3.5 bg-border" />
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Product</span>
                <Controller
                  control={form.control}
                  name="product_id"
                  render={({ field }) => (
                    <ProductPicker
                      value={field.value ?? ''}
                      onSelect={field.onChange}
                      products={productsWithHero ?? []}
                      initialSearch={item.supplier_description?.split(' ').slice(0, 3).join(' ')}
                    />
                  )}
                />
              </div>
            </div>
          </div>
          <Button type="submit" disabled={updateMutation.isPending} className="gap-2">
            <Check className="h-4 w-4" />
            {updateMutation.isPending ? 'Saving...' : 'Complete Inspection'}
          </Button>
        </div>
      </div>

      {/* === Mobile Item Info === */}
      <div className="lg:hidden px-5 pt-3.5">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold leading-[18px]">
            {pm ? `${pm.brand} ${pm.model_name}` : 'No product assigned'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {(item.color ?? pm?.color) && `${item.color ?? pm?.color} · `}
            {deviceCategory && `${deviceCategory} · `}
            P-Code <span className="font-semibold text-foreground">{item.item_code}</span>
            {' · '}Supplier <span className="font-medium text-foreground">{supplier ?? '—'}</span>
          </p>
        </div>
      </div>

      {/* === Supplier Description Banner === */}
      {item.supplier_description && (
        <div className="mx-5 lg:mx-12 mt-3 lg:mt-5 rounded-[5px] py-[7px] px-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">
            {item.supplier_description}
          </p>
        </div>
      )}

      {/* === Validation Issues Banner === */}
      {validationIssues.length > 0 && (
        <div className="mx-5 lg:mx-12 mt-3 rounded-md py-3 px-4 bg-destructive/10 border border-destructive/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">
                {validationIssues.length} issue{validationIssues.length > 1 ? 's' : ''} to fix:
              </p>
              <ul className="mt-1 space-y-0.5">
                {validationIssues.map((issue, i) => (
                  <li key={i} className="text-xs text-destructive/80">• {issue}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              className="ml-auto shrink-0"
              onClick={() => setValidationIssues([])}
            >
              <X className="h-3.5 w-3.5 text-destructive/60 hover:text-destructive" />
            </button>
          </div>
        </div>
      )}

      {/* === Two-column layout (desktop) / Single column (mobile) === */}
      <div className="flex flex-col lg:flex-row w-full items-start pt-3 lg:pt-5 gap-5 lg:gap-6 px-5 lg:px-12">
        {/* Left column: Media viewer */}
        <div className="w-full lg:w-[480px] lg:shrink-0">
          <MediaViewer
            productId={effectiveProductId ?? null}
            itemMedia={itemMedia}
            defectPhotos={defects
              .filter((d) => d.photo_url)
              .map((d) => ({
                id: d.id,
                file_url: d.photo_url!,
                label: `${d.area}: ${d.defect_type}`,
              }))}
          />

          {/* Mobile: Product picker */}
          <div className="lg:hidden flex items-center gap-2 pt-3">
            <span className="text-xs text-muted-foreground">Product</span>
            <Controller
              control={form.control}
              name="product_id"
              render={({ field }) => (
                <ProductPicker
                  value={field.value ?? ''}
                  onSelect={field.onChange}
                  products={productsWithHero ?? []}
                  initialSearch={item.supplier_description?.split(' ').slice(0, 3).join(' ')}
                />
              )}
            />
          </div>
        </div>

        {/* Right column: Specs + Defects */}
        <div className="flex flex-col grow gap-5 w-full">
          {/* Specs Check */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold leading-[18px]">Specs Check</h3>
                {specsVerified ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/40" />
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {specFields.map((field) => {
                const currentVal = resolveSpecValue(field.key)
                const formKey = field.key as keyof InspectionFormValues
                const isColorField = field.key === 'color'

                if (field.type === 'boolean') {
                  return (
                    <div key={field.key} className="flex flex-col gap-0.5">
                      <span className="text-[10px] lg:text-[11px] text-muted-foreground leading-3.5">
                        {field.label}
                      </span>
                      <label className="flex items-center gap-2 rounded-[5px] py-2 px-2.5 border border-border cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.watch(formKey) as boolean ?? currentVal === true}
                          onChange={(e) => form.setValue(formKey, e.target.checked as never, { shouldDirty: true })}
                          className="rounded"
                        />
                        <span className="text-xs">{currentVal ? 'Yes' : 'No'}</span>
                      </label>
                    </div>
                  )
                }

                return (
                  <div key={field.key} className="flex flex-col gap-0.5">
                    <span className="text-[10px] lg:text-[11px] text-muted-foreground leading-3.5">
                      {field.label}
                      {isColorField && !colorDone && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                    </span>
                    <Input
                      type={field.type === 'number' ? 'number' : 'text'}
                      placeholder={currentVal != null ? String(currentVal) : '--'}
                      className={cn(
                        'h-8 text-xs',
                        isColorField && !colorDone && 'border-destructive/50',
                        isColorField && colorMismatch && 'border-amber-400',
                      )}
                      {...form.register(formKey as 'cpu' | 'ram_gb' | 'storage_gb' | 'os_family' | 'screen_size' | 'keyboard_layout' | 'gpu' | 'color' | 'carrier' | 'imei')}
                    />
                    {isColorField && colorMismatch && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          Product color is "{productColor}" — please verify
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Specs Verified Checkbox */}
            <label className={cn(
              'flex items-center gap-2.5 rounded-md py-2.5 px-3 border cursor-pointer transition-colors',
              specsVerified
                ? 'border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-800'
                : 'border-border bg-muted/30 hover:bg-muted/50',
            )}>
              <input
                type="checkbox"
                checked={specsVerified}
                onChange={(e) => form.setValue('specs_verified', e.target.checked, { shouldDirty: true })}
                className="rounded"
              />
              <div>
                <span className={cn(
                  'text-xs font-medium',
                  specsVerified ? 'text-green-700 dark:text-green-400' : 'text-foreground',
                )}>
                  {specsVerified ? 'Specs verified — matches physical device' : 'I confirm the specs above match the physical device'}
                </span>
                {!specsVerified && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Check all fields above, then tick this box to confirm
                  </p>
                )}
              </div>
            </label>
          </div>

          {/* Defects + Specs Notes side by side on desktop */}
          <div className="flex flex-col lg:flex-row gap-5 lg:gap-6">
            <div className="flex-1">
              <CompactDefectsList
                itemId={item.id}
                defects={defects}
                deviceCategory={deviceCategory}
              />
            </div>
            <div className="flex-1 flex flex-col gap-0.5">
              <Label className="text-[11px] text-muted-foreground leading-3.5">Specs Notes</Label>
              <Textarea
                placeholder="Any notes about spec discrepancies..."
                className="flex-1 min-h-[120px] text-xs resize-none"
                {...form.register('specs_notes')}
              />
            </div>
          </div>
        </div>
      </div>

      {/* === Functionality Checks (mobile: compact list, desktop: inline) === */}
      <div className="px-5 lg:px-12 pt-4 lg:pt-5">
        <div className="lg:hidden space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold leading-[18px]">Functionality Checks</h3>
            {funcChecksDone ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
                {funcChecks.filter((check) => {
                  const val = form.getValues(`inspection_checklist.${check.key}_status` as `inspection_checklist.${string}`) as string
                  return !val || val === ''
                }).length} remaining
              </span>
            )}
          </div>
          <div className="rounded-md overflow-hidden border border-border">
            {funcChecks.map((check, i) => {
              const statusKey = `inspection_checklist.${check.key}_status` as const
              const noteKey = `inspection_checklist.${check.key}_note` as const
              const statusValue = form.watch(statusKey as `inspection_checklist.${string}`) as string
              const isLast = i === funcChecks.length - 1

              return (
                <div key={check.key}>
                  <div className={cn(
                    'flex items-center py-[7px] px-3',
                    !isLast && 'border-b border-muted',
                  )}>
                    <span className="text-xs grow">{check.label}</span>
                    <Controller
                      control={form.control}
                      name={statusKey as `inspection_checklist.${string}`}
                      render={({ field }) => (
                        <div className="flex items-center gap-0.5">
                          <span className="text-[11px] text-muted-foreground">
                            {(field.value as string) === 'WORKING' ? 'Working' : (field.value as string) === 'PROBLEM' ? 'Problem' : 'Not checked'}
                          </span>
                          <Select value={field.value as string ?? ''} onValueChange={field.onChange}>
                            <SelectTrigger className="border-0 h-auto p-0 w-auto shadow-none focus:ring-0">
                              <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="WORKING">Working</SelectItem>
                              <SelectItem value="PROBLEM">Problem Found</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    />
                  </div>
                  {statusValue === 'PROBLEM' && (
                    <div className="px-3 pb-2">
                      <Input
                        placeholder="Describe the problem..."
                        className="text-xs h-7"
                        {...form.register(noteKey as `inspection_checklist.${string}`)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Desktop: horizontal layout for functionality checks */}
        <div className="hidden lg:block space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold leading-[18px]">Functionality Checks</h3>
            {funcChecksDone ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
                {funcChecks.filter((check) => {
                  const val = form.getValues(`inspection_checklist.${check.key}_status` as `inspection_checklist.${string}`) as string
                  return !val || val === ''
                }).length} remaining
              </span>
            )}
          </div>
          <div className="space-y-3">
            {funcChecks.map((check) => {
              const statusKey = `inspection_checklist.${check.key}_status` as const
              const noteKey = `inspection_checklist.${check.key}_note` as const
              const statusValue = form.watch(statusKey as `inspection_checklist.${string}`) as string

              return (
                <div key={check.key} className="flex items-center gap-3">
                  <Label className="text-xs w-44 shrink-0">{check.label}</Label>
                  <Controller
                    control={form.control}
                    name={statusKey as `inspection_checklist.${string}`}
                    render={({ field }) => (
                      <Select value={field.value as string ?? ''} onValueChange={field.onChange}>
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue placeholder="Not checked" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="WORKING">Working</SelectItem>
                          <SelectItem value="PROBLEM">Problem Found</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {statusValue === 'PROBLEM' && (
                    <Input
                      placeholder="Describe the problem..."
                      className="flex-1 h-8 text-xs"
                      {...form.register(noteKey as `inspection_checklist.${string}`)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* === Battery / AC Adapter / Condition Notes === */}
      <div className="px-5 lg:px-12 pt-4 lg:pt-5">
        <div className="flex flex-col lg:flex-row gap-5 lg:gap-8 lg:items-end">
          <div className="flex gap-2.5 lg:grow">
            {/* Battery Health */}
            <div className="flex flex-col gap-0.5 w-32 shrink-0">
              <Label className={cn(
                'text-[10px] lg:text-[11px] leading-3.5',
                batteryDone ? 'text-muted-foreground' : 'text-muted-foreground',
              )}>
                Battery Health (%)
                {!batteryDone && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="e.g. 87"
                className={cn('h-8 text-xs', !batteryDone && 'border-destructive/50')}
                {...form.register('battery_health_pct')}
              />
            </div>

            {/* AC Adapter */}
            {showAcAdapter && (
              <div className="flex flex-col gap-0.5 grow">
                <Label className="text-[10px] lg:text-[11px] text-muted-foreground leading-3.5">
                  AC Adapter
                  {!acAdapterDone && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <Controller
                  control={form.control}
                  name="ac_adapter_status"
                  render={({ field }) => (
                    <AcAdapterToggle
                      value={field.value ?? undefined}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
            )}
          </div>

          {/* Condition Notes (auto-generated from defects + func checks) */}
          <div className="flex flex-col gap-0.5 lg:grow">
            <div className="flex items-center gap-2">
              <Label className="text-[10px] lg:text-[11px] text-muted-foreground leading-3.5">
                Condition Notes
              </Label>
              {!manuallyEditedNotes.current && (defects.length > 0 || form.getValues('condition_notes')) && (
                <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  Auto-generated
                </span>
              )}
            </div>
            <Textarea
              placeholder="Auto-generated from defects and checks..."
              className="h-14 text-xs resize-none"
              {...form.register('condition_notes', {
                onChange: () => { manuallyEditedNotes.current = true },
              })}
            />
          </div>
        </div>
      </div>

      {/* === Additional Costs === */}
      <div className="px-5 lg:px-12 pt-4 lg:pt-5">
        <AdditionalCostsSection itemId={item.id} costs={itemCosts} />
      </div>

      {/* === Price Summary Bar === */}
      <div className="px-5 lg:px-12 pt-3 lg:pt-2.5">
        {/* Desktop: horizontal bar */}
        <div className="hidden lg:flex items-center justify-end rounded-md py-3.5 px-5 gap-6 bg-muted">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Buying Price</span>
            <span className="text-sm font-semibold">{formatPrice(purchasePrice)}</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Total Cost</span>
            <span className="text-sm font-bold">{formatPrice(totalCost)}</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Selling Price</span>
            {editingSellingPrice ? (
              <Input
                type="number"
                min={0}
                className="w-28 h-7 text-sm font-semibold"
                {...form.register('selling_price', { valueAsNumber: true })}
                onBlur={() => setEditingSellingPrice(false)}
                autoFocus
              />
            ) : (
              <button
                type="button"
                className="flex items-center gap-1 hover:opacity-70 transition-opacity"
                onClick={() => setEditingSellingPrice(true)}
              >
                <span className="text-sm font-semibold">{formatPrice(sellingPrice)}</span>
                <Edit3 className="h-2.5 w-2.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Est. Profit</span>
            <span className={cn(
              'text-sm font-bold',
              estProfit >= 0 ? 'text-green-500' : 'text-destructive',
            )}>
              {formatPrice(estProfit)}
            </span>
          </div>
        </div>

        {/* Mobile: vertical card */}
        <div className="lg:hidden rounded-lg py-3.5 px-4 bg-muted w-full">
          <div className="flex items-baseline justify-between py-1.5 border-b border-border">
            <span className="text-[13px] text-muted-foreground">Buying Price</span>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                className="w-24 h-7 text-right text-sm font-semibold"
                {...form.register('purchase_price', { valueAsNumber: true })}
              />
            </div>
          </div>
          <div className="flex items-baseline justify-between py-1.5 border-b border-border">
            <span className="text-[13px] text-muted-foreground">Total Cost</span>
            <span className="text-[15px] font-bold">{formatPrice(totalCost)}</span>
          </div>
          <div className="flex items-baseline justify-between py-1.5 border-b border-border">
            <span className="text-[13px] text-muted-foreground">Selling Price</span>
            <Input
              type="number"
              min={0}
              className="w-24 h-7 text-right text-sm font-semibold"
              {...form.register('selling_price', { valueAsNumber: true })}
            />
          </div>
          <div className="flex items-baseline justify-between pt-2">
            <span className={cn('text-[13px] font-medium', estProfit >= 0 ? 'text-green-500' : 'text-destructive')}>
              Est. Profit
            </span>
            <span className={cn('text-[17px] font-bold', estProfit >= 0 ? 'text-green-500' : 'text-destructive')}>
              {formatPrice(estProfit)}
            </span>
          </div>
        </div>
      </div>

      {/* === Footer === */}
      {/* Desktop footer */}
      <div className="hidden lg:flex items-center justify-end mx-12 py-4 mt-5 mb-10 gap-4 border-t border-border">
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-muted-foreground">Grade:</span>
          <Controller
            control={form.control}
            name="condition_grade"
            render={({ field, fieldState }) => (
              <div>
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue placeholder="Choose grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_GRADES.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        <span className="flex items-center gap-1.5">
                          <GradeBadge grade={g.value} />
                          <span>{g.label.split(' — ')[1]}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldState.error && (
                  <p className="text-sm text-destructive mt-1">{fieldState.error.message}</p>
                )}
              </div>
            )}
          />
          <div className="w-px h-4 bg-border" />
          <span className="text-[13px] text-muted-foreground">Status:</span>
          <Controller
            control={form.control}
            name="item_status"
            render={({ field, fieldState }) => (
              <div>
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className="w-32 h-9">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AVAILABLE">Available</SelectItem>
                    <SelectItem value="REPAIR">Repair</SelectItem>
                    <SelectItem value="MISSING">Missing</SelectItem>
                  </SelectContent>
                </Select>
                {fieldState.error && (
                  <p className="text-sm text-destructive mt-1">{fieldState.error.message}</p>
                )}
              </div>
            )}
          />
        </div>
        <Button type="submit" size="lg" disabled={updateMutation.isPending} className="gap-2">
          <Check className="h-4 w-4" />
          {updateMutation.isPending ? 'Saving...' : 'Complete Inspection'}
        </Button>
      </div>

      {/* Mobile footer: boxy segmented bar */}
      <div className="lg:hidden flex w-full mt-5 sticky bottom-0 z-10 bg-background">
        <Controller
          control={form.control}
          name="condition_grade"
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger className="flex-1 rounded-none border-t border-l border-b border-border h-10 text-[11px] justify-center gap-1 shadow-none focus:ring-0">
                {field.value ? (
                  <span className="flex items-center gap-1">
                    <GradeBadge grade={field.value} />
                  </span>
                ) : (
                  <span className="text-muted-foreground">Grade</span>
                )}
              </SelectTrigger>
              <SelectContent>
                {CONDITION_GRADES.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    <span className="flex items-center gap-1.5">
                      <GradeBadge grade={g.value} />
                      <span>{g.label.split(' — ')[1]}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <Controller
          control={form.control}
          name="item_status"
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger className="flex-1 rounded-none border-t border-l border-b border-border h-10 text-[11px] justify-center gap-1 shadow-none focus:ring-0">
                {field.value ? (
                  <span>{field.value === 'AVAILABLE' ? 'Available' : field.value === 'REPAIR' ? 'Repair' : 'Missing'}</span>
                ) : (
                  <span className="text-muted-foreground">Status</span>
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AVAILABLE">Available</SelectItem>
                <SelectItem value="REPAIR">Repair</SelectItem>
                <SelectItem value="MISSING">Missing</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="flex items-center justify-center flex-[1.2] py-[7px] gap-1.5 bg-foreground text-background"
        >
          <Check className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">
            {updateMutation.isPending ? 'Saving...' : 'Complete'}
          </span>
        </button>
      </div>
    </form>
  )
}
