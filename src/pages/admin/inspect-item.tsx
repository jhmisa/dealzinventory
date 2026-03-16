import { useParams, useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader, GradeBadge, FormSkeleton } from '@/components/shared'
import {
  ItemHeaderCard,
  SpecsCheckSection,
  BodyConditionSection,
  ScreenConditionSection,
  OthersSection,
  AdditionalCostsSection,
  ConditionPhotosSection,
} from '@/components/inspection'
import { useItem, useUpdateItem } from '@/hooks/use-items'
import { useProductModels } from '@/hooks/use-product-models'
import { inspectionSchema, type InspectionFormValues } from '@/validators/inspection'
import { CONDITION_GRADES } from '@/lib/constants'
import type { DeviceCategory } from '@/lib/constants'
import type { ProductModel, ItemCost, ItemMedia } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function InspectItemPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: item, isLoading } = useItem(id!)
  const { data: products } = useProductModels()
  const updateMutation = useUpdateItem()

  const pm = item?.product_models as ProductModel | null
  const supplier = (item?.suppliers as { supplier_name: string } | null)?.supplier_name ?? null
  const deviceCategory = (item?.device_category ?? pm?.device_category ?? null) as DeviceCategory | null
  const itemCosts = ((item as Record<string, unknown>)?.item_costs ?? []) as ItemCost[]
  const itemMedia = ((item as Record<string, unknown>)?.item_media ?? []) as ItemMedia[]

  // Parse existing checklist from item
  const existingChecklist = (item?.inspection_checklist ?? {}) as Record<string, unknown>

  const form = useForm<InspectionFormValues>({
    resolver: zodResolver(inspectionSchema),
    values: item ? {
      condition_grade: item.condition_grade ?? undefined as unknown as InspectionFormValues['condition_grade'],
      item_status: (item.item_status === 'INTAKE' ? 'AVAILABLE' : item.item_status) as InspectionFormValues['item_status'],
      product_id: '',
      ac_adapter_status: item.ac_adapter_status ?? undefined,
      body_condition: item.body_condition ?? undefined,
      screen_condition: item.screen_condition ?? undefined,
      battery_health_pct: item.battery_health_pct ?? null,
      inspection_checklist: {
        body_scratches: existingChecklist.body_scratches as boolean ?? false,
        body_dents: existingChecklist.body_dents as boolean ?? false,
        body_cracks: existingChecklist.body_cracks as boolean ?? false,
        body_discoloration: existingChecklist.body_discoloration as boolean ?? false,
        body_missing_parts: existingChecklist.body_missing_parts as boolean ?? false,
        screen_mura: existingChecklist.screen_mura as boolean ?? false,
        screen_white_spots: existingChecklist.screen_white_spots as boolean ?? false,
        screen_dead_pixels: existingChecklist.screen_dead_pixels as boolean ?? false,
        screen_scratches: existingChecklist.screen_scratches as boolean ?? false,
        screen_backlight_bleed: existingChecklist.screen_backlight_bleed as boolean ?? false,
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
      specs_notes: item.specs_notes ?? '',
      condition_notes: item.condition_notes ?? '',
    } : undefined,
  })

  if (isLoading) return <FormSkeleton fields={8} />
  if (!item) return <div className="text-center py-12 text-muted-foreground">Item not found.</div>

  function handleSubmit(values: InspectionFormValues) {
    updateMutation.mutate(
      {
        id: item!.id,
        updates: {
          condition_grade: values.condition_grade,
          item_status: values.item_status,
          product_id: values.product_id || item!.product_id,
          ac_adapter_status: values.ac_adapter_status ?? null,
          body_condition: values.body_condition ?? null,
          screen_condition: values.screen_condition ?? null,
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

  const selectedGrade = form.watch('condition_grade')

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 pb-24">
      <div className="flex items-center gap-4">
        <Button type="button" variant="ghost" size="icon" onClick={() => navigate('/admin/inspection')} aria-label="Back to inspection queue">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={`Inspect ${item.item_code}`}
          description={pm ? `${pm.brand} ${pm.model_name}` : undefined}
        />
      </div>

      {/* 1. Item Header */}
      <ItemHeaderCard item={item} productModel={pm} supplierName={supplier} />

      {/* 2. Product Assignment */}
      <Card>
        <CardHeader>
          <CardTitle>Product</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {item.product_id && pm && (
            <p className="text-sm text-muted-foreground">
              Current: {pm.brand} {pm.model_name} ({pm.color})
            </p>
          )}
          <Controller
            control={form.control}
            name="product_id"
            render={({ field }) => (
              <div>
                <Label className="text-sm">Reassign Product (optional)</Label>
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Keep current" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep current</SelectItem>
                    {(products ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.brand} {p.model_name} ({p.color})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />
        </CardContent>
      </Card>

      {/* 3. Specs Check */}
      <SpecsCheckSection
        form={form}
        item={item}
        productModel={pm}
        deviceCategory={deviceCategory}
      />

      {/* 4. Body Condition */}
      <BodyConditionSection form={form} deviceCategory={deviceCategory} />

      {/* 5. Screen Condition */}
      <ScreenConditionSection form={form} deviceCategory={deviceCategory} />

      {/* 6. Functionality & Other */}
      <OthersSection form={form} deviceCategory={deviceCategory} />

      {/* 7. Additional Costs (independent mutations) */}
      <AdditionalCostsSection itemId={item.id} costs={itemCosts} />

      {/* 8. Condition Photos (independent mutations) */}
      <ConditionPhotosSection itemId={item.id} media={itemMedia} />

      {/* 9. Condition Grade Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Condition Grade</CardTitle>
        </CardHeader>
        <CardContent>
          <Controller
            control={form.control}
            name="condition_grade"
            render={({ field, fieldState }) => (
              <div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {CONDITION_GRADES.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      className={cn(
                        'flex flex-col items-center gap-1 p-4 rounded-lg border-2 transition-all',
                        field.value === g.value
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-muted hover:border-muted-foreground/30',
                      )}
                      onClick={() => field.onChange(g.value)}
                    >
                      <GradeBadge grade={g.value} />
                      <span className="text-xs text-muted-foreground mt-1">
                        {g.label.split(' — ')[1]}
                      </span>
                      {field.value === g.value && (
                        <Check className="h-3 w-3 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
                {fieldState.error && (
                  <p className="text-sm text-destructive mt-2">{fieldState.error.message}</p>
                )}
              </div>
            )}
          />
        </CardContent>
      </Card>

      {/* 10. Sticky Submit Bar */}
      <div className="sticky bottom-0 bg-background border-t p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Status after inspection:</span>
          <Controller
            control={form.control}
            name="item_status"
            render={({ field, fieldState }) => (
              <div>
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
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
          {selectedGrade && (
            <span className="text-sm text-muted-foreground">
              Grade: <GradeBadge grade={selectedGrade} />
            </span>
          )}
        </div>
        <Button type="submit" size="lg" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Saving...' : 'Complete Inspection'}
        </Button>
      </div>
    </form>
  )
}
