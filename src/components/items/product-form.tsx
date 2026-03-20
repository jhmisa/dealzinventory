import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { productModelSchema, type ProductModelFormValues } from '@/validators/product-model'
import type { ProductModel, Category } from '@/lib/types'
import { useCategories } from '@/hooks/use-categories'
import { getSpecFieldLabel } from '@/lib/constants'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const PRODUCT_STATUS_OPTIONS = ['DRAFT', 'ACTIVE']

interface ProductFormProps {
  product?: ProductModel | null
  loading?: boolean
  onSubmit: (values: ProductModelFormValues) => void
  onCancel: () => void
}

function generateShortDescription(
  values: Record<string, unknown>,
  descriptionFields: string[],
): string {
  return descriptionFields
    .map((key) => {
      const val = values[key]
      if (val == null || val === '' || val === false) return null
      if (key === 'ram_gb' && val) return `${val}GB`
      if (key === 'storage_gb' && val) return `${val}GB`
      if (key === 'screen_size' && val) return `${val}"`
      if (typeof val === 'boolean') return val ? getSpecFieldLabel(key) : null
      return String(val)
    })
    .filter(Boolean)
    .join(' ')
}

export function ProductForm({ product, loading = false, onSubmit, onCancel }: ProductFormProps) {
  const { data: categories } = useCategories()

  const form = useForm<ProductModelFormValues>({
    resolver: zodResolver(productModelSchema),
    defaultValues: {
      brand: product?.brand ?? '',
      model_name: product?.model_name ?? '',
      color: product?.color ?? '',
      category_id: product?.category_id ?? '',
      chipset: product?.chipset ?? '',
      screen_size: product?.screen_size ?? undefined,
      ports: product?.ports ?? '',
      year: product?.year ?? undefined,
      other_features: product?.other_features ?? '',
      model_notes: product?.model_notes ?? '',
      cpu: product?.cpu ?? '',
      ram_gb: product?.ram_gb ?? undefined,
      storage_gb: product?.storage_gb ?? undefined,
      os_family: product?.os_family ?? '',
      gpu: product?.gpu ?? '',
      carrier: product?.carrier ?? '',
      keyboard_layout: product?.keyboard_layout ?? '',
      has_touchscreen: product?.has_touchscreen ?? false,
      has_thunderbolt: product?.has_thunderbolt ?? false,
      supports_stylus: product?.supports_stylus ?? false,
      has_cellular: product?.has_cellular ?? false,
      has_bluetooth: product?.has_bluetooth ?? false,
      has_camera: product?.has_camera ?? false,
      is_unlocked: product?.is_unlocked ?? true,
      imei_slot_count: product?.imei_slot_count ?? undefined,
      match_pattern: product?.match_pattern ?? '',
      match_priority: product?.match_priority ?? 0,
      device_category: product?.device_category ?? 'COMPUTER',
      status: product?.status ?? 'DRAFT',
      short_description: product?.short_description ?? '',
    },
  })

  const selectedCategoryId = form.watch('category_id')

  const selectedCategory = useMemo(
    () => categories?.find((c) => c.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  )

  const visibleFields = useMemo(
    () => new Set(selectedCategory?.form_fields ?? []),
    [selectedCategory],
  )

  // Auto-update short_description when relevant fields change
  const watchedValues = form.watch()
  useEffect(() => {
    if (!selectedCategory) return
    const desc = generateShortDescription(watchedValues, selectedCategory.description_fields)
    const current = form.getValues('short_description')
    if (desc !== current) {
      form.setValue('short_description', desc)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    watchedValues.brand,
    watchedValues.model_name,
    watchedValues.color,
    watchedValues.cpu,
    watchedValues.ram_gb,
    watchedValues.storage_gb,
    watchedValues.os_family,
    watchedValues.gpu,
    watchedValues.chipset,
    watchedValues.carrier,
    watchedValues.screen_size,
    watchedValues.has_camera,
    selectedCategory,
  ])

  function handleSubmit(values: ProductModelFormValues) {
    onSubmit({
      ...values,
      chipset: values.chipset || undefined,
      ports: values.ports || undefined,
      other_features: values.other_features || undefined,
      model_notes: values.model_notes || undefined,
      cpu: values.cpu || undefined,
      os_family: values.os_family || undefined,
      gpu: values.gpu || undefined,
      carrier: values.carrier || undefined,
      keyboard_layout: values.keyboard_layout || undefined,
      has_camera: values.has_camera,
      match_pattern: values.match_pattern || undefined,
      short_description: values.short_description || undefined,
    })
  }

  function show(field: string) {
    return visibleFields.has(field)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {/* Category selector — first thing */}
        <FormField
          control={form.control}
          name="category_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Always visible: brand, model_name, color */}
        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="brand"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Brand</FormLabel>
                <FormControl>
                  <Input placeholder="Apple, Lenovo, etc." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="model_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model Name</FormLabel>
                <FormControl>
                  <Input placeholder="MacBook Air M1" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color</FormLabel>
                <FormControl>
                  <Input placeholder="Space Gray, Silver, etc." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Always visible: year, other_features, status */}
        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="year"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Year</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="2024" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="other_features"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Other Features</FormLabel>
                <FormControl>
                  <Input placeholder="Fingerprint reader, IR camera" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PRODUCT_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Dynamic spec fields based on category */}
        {(show('chipset') || show('screen_size') || show('ports')) && (
          <div className="grid grid-cols-3 gap-4">
            {show('chipset') && (
              <FormField
                control={form.control}
                name="chipset"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chipset</FormLabel>
                    <FormControl>
                      <Input placeholder="Apple M1, Intel i7" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {show('screen_size') && (
              <FormField
                control={form.control}
                name="screen_size"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Screen Size</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" placeholder="13.3" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {show('ports') && (
              <FormField
                control={form.control}
                name="ports"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ports</FormLabel>
                    <FormControl>
                      <Input placeholder="2x USB-C, HDMI, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        )}

        {/* CPU / RAM / Storage */}
        {(show('cpu') || show('ram_gb') || show('storage_gb')) && (
          <div className="grid grid-cols-3 gap-4">
            {show('cpu') && (
              <FormField
                control={form.control}
                name="cpu"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPU</FormLabel>
                    <FormControl>
                      <Input placeholder="Apple M1, Intel i7-1165G7" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {show('ram_gb') && (
              <FormField
                control={form.control}
                name="ram_gb"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RAM (GB)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="8" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {show('storage_gb') && (
              <FormField
                control={form.control}
                name="storage_gb"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Storage (GB)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="256" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        )}

        {/* OS / GPU / Carrier */}
        {(show('os_family') || show('gpu') || show('carrier')) && (
          <div className="grid grid-cols-3 gap-4">
            {show('os_family') && (
              <FormField
                control={form.control}
                name="os_family"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OS Family</FormLabel>
                    <FormControl>
                      <Input placeholder="macOS, Windows, iOS" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {show('gpu') && (
              <FormField
                control={form.control}
                name="gpu"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GPU</FormLabel>
                    <FormControl>
                      <Input placeholder="Integrated, NVIDIA RTX 3060" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {show('carrier') && (
              <FormField
                control={form.control}
                name="carrier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Carrier</FormLabel>
                    <FormControl>
                      <Input placeholder="Unlocked, Docomo, SoftBank" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        )}

        {/* Keyboard / IMEI */}
        {(show('keyboard_layout') || show('imei_slot_count')) && (
          <div className="grid grid-cols-3 gap-4">
            {show('keyboard_layout') && (
              <FormField
                control={form.control}
                name="keyboard_layout"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Keyboard Layout</FormLabel>
                    <FormControl>
                      <Input placeholder="JIS, US, UK" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {show('imei_slot_count') && (
              <FormField
                control={form.control}
                name="imei_slot_count"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IMEI Slot Count</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        )}

        {/* Boolean toggles — only show relevant ones */}
        {(show('has_touchscreen') || show('has_thunderbolt') || show('supports_stylus') || show('has_cellular') || show('has_bluetooth') || show('has_camera') || show('is_unlocked')) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {show('has_touchscreen') && (
              <FormField
                control={form.control}
                name="has_touchscreen"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel className="text-sm">Touchscreen</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
            {show('has_thunderbolt') && (
              <FormField
                control={form.control}
                name="has_thunderbolt"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel className="text-sm">Thunderbolt</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
            {show('supports_stylus') && (
              <FormField
                control={form.control}
                name="supports_stylus"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel className="text-sm">Stylus Support</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
            {show('has_cellular') && (
              <FormField
                control={form.control}
                name="has_cellular"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel className="text-sm">Cellular</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
            {show('has_bluetooth') && (
              <FormField
                control={form.control}
                name="has_bluetooth"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel className="text-sm">Bluetooth</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
            {show('has_camera') && (
              <FormField
                control={form.control}
                name="has_camera"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel className="text-sm">Camera</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
            {show('is_unlocked') && (
              <FormField
                control={form.control}
                name="is_unlocked"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel className="text-sm">Unlocked</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
          </div>
        )}

        {/* Auto-generated short description preview */}
        <FormField
          control={form.control}
          name="short_description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Short Description (auto-generated)</FormLabel>
              <FormControl>
                <Input {...field} readOnly className="bg-muted" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Match pattern & priority */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="match_pattern"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Match Pattern</FormLabel>
                <FormControl>
                  <Input placeholder="Regex pattern for auto-matching" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="match_priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Match Priority</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="model_notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Additional notes" rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : product ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
