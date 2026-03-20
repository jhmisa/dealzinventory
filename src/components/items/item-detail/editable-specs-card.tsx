import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useUpdateItem } from '@/hooks/use-items'
import { itemSpecsSchema, type ItemSpecsFormValues } from '@/validators/item'
import { getSpecFieldLabel } from '@/lib/constants'
import type { Item, ProductModel, ItemUpdate } from '@/lib/types'

type ProductModelJoined = ProductModel & {
  categories?: { name: string; form_fields: string[] } | null
}

interface EditableSpecsCardProps {
  item: Item
  productModel: ProductModelJoined | null
  locked?: boolean
}

// Fields that live only on the product model (read-only even in edit mode)
const PRODUCT_ONLY_FIELDS = ['chipset', 'ports', 'has_thunderbolt', 'supports_stylus', 'has_cellular', 'imei_slot_count', 'camera', 'has_bluetooth'] as const

// Fields always shown regardless of category
const ALWAYS_VISIBLE = new Set(['brand', 'model_name', 'color', 'year', 'other_features', 'battery_health_pct'])

// Editable text fields
const TEXT_FIELDS = ['brand', 'model_name', 'color', 'cpu', 'os_family', 'gpu', 'carrier', 'keyboard_layout', 'other_features'] as const

// Editable number fields
const NUMBER_FIELDS = [
  { key: 'screen_size', suffix: '"' },
  { key: 'ram_gb', suffix: ' GB' },
  { key: 'storage_gb', suffix: ' GB' },
  { key: 'battery_health_pct', suffix: '%' },
  { key: 'year', suffix: '' },
] as const

// Editable boolean fields
const BOOLEAN_FIELDS = ['has_touchscreen', 'is_unlocked'] as const

export function EditableSpecsCard({ item, productModel, locked }: EditableSpecsCardProps) {
  const [editing, setEditing] = useState(false)
  const updateItem = useUpdateItem()

  // Category-aware field visibility
  const categoryFields = productModel?.categories?.form_fields
  const visibleFields = categoryFields ? new Set(categoryFields) : null
  function show(field: string) { return !visibleFields || ALWAYS_VISIBLE.has(field) || visibleFields.has(field) }

  const filteredTextFields = TEXT_FIELDS.filter((key) => ALWAYS_VISIBLE.has(key) || show(key))
  const filteredNumberFields = NUMBER_FIELDS.filter(({ key }) => ALWAYS_VISIBLE.has(key) || show(key))
  const filteredBooleanFields = BOOLEAN_FIELDS.filter((key) => show(key))
  const showImei = show('imei_slot_count')
  const filteredProductOnlyFields = PRODUCT_ONLY_FIELDS.filter((key) => show(key))

  const form = useForm<ItemSpecsFormValues>({
    resolver: zodResolver(itemSpecsSchema),
    defaultValues: {
      brand: item.brand ?? '',
      model_name: item.model_name ?? '',
      color: item.color ?? '',
      screen_size: item.screen_size ?? null,
      cpu: item.cpu ?? '',
      ram_gb: item.ram_gb ?? null,
      storage_gb: item.storage_gb ?? null,
      os_family: item.os_family ?? '',
      gpu: item.gpu ?? '',
      carrier: item.carrier ?? '',
      keyboard_layout: item.keyboard_layout ?? '',
      has_touchscreen: item.has_touchscreen ?? null,
      is_unlocked: item.is_unlocked ?? null,
      imei: item.imei ?? '',
      imei2: item.imei2 ?? '',
      battery_health_pct: item.battery_health_pct ?? null,
      year: item.year ?? null,
      other_features: item.other_features ?? '',
    },
  })

  function getResolvedValue(field: string): string | number | boolean | null | undefined {
    const itemVal = item[field as keyof Item]
    const pmVal = productModel?.[field as keyof ProductModel]
    return (itemVal ?? pmVal) as string | number | boolean | null | undefined
  }

  function handleSave(values: ItemSpecsFormValues) {
    const updates: ItemUpdate = {}
    let hasChanges = false

    for (const key of TEXT_FIELDS) {
      const newVal = values[key] || null
      if (newVal !== (item[key as keyof Item] ?? null)) {
        ;(updates as Record<string, unknown>)[key] = newVal
        hasChanges = true
      }
    }

    for (const { key } of NUMBER_FIELDS) {
      const newVal = values[key as keyof ItemSpecsFormValues] as number | null | undefined
      const parsed = newVal != null && newVal !== (undefined as unknown) ? newVal : null
      if (parsed !== (item[key as keyof Item] ?? null)) {
        ;(updates as Record<string, unknown>)[key] = parsed
        hasChanges = true
      }
    }

    for (const key of BOOLEAN_FIELDS) {
      const newVal = values[key] ?? null
      if (newVal !== (item[key as keyof Item] ?? null)) {
        ;(updates as Record<string, unknown>)[key] = newVal
        hasChanges = true
      }
    }

    // IMEI fields
    for (const key of ['imei', 'imei2'] as const) {
      const newVal = values[key] || null
      if (newVal !== (item[key] ?? null)) {
        ;(updates as Record<string, unknown>)[key] = newVal
        hasChanges = true
      }
    }

    if (!hasChanges) {
      setEditing(false)
      return
    }

    updateItem.mutate(
      { id: item.id, updates },
      {
        onSuccess: () => {
          toast.success('Specs updated')
          setEditing(false)
        },
        onError: () => toast.error('Failed to update specs'),
      },
    )
  }

  function handleCancel() {
    form.reset()
    setEditing(false)
  }

  if (editing) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Specs</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredTextFields.map((key) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{getSpecFieldLabel(key)}</Label>
                  <Input
                    {...form.register(key)}
                    placeholder={productModel?.[key as keyof ProductModel] as string | undefined ?? '—'}
                    className="h-8 text-sm"
                  />
                </div>
              ))}

              {filteredNumberFields.map(({ key, suffix }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{getSpecFieldLabel(key)}</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step={key === 'screen_size' ? '0.1' : '1'}
                      {...form.register(key as keyof ItemSpecsFormValues)}
                      placeholder={
                        productModel?.[key as keyof ProductModel] != null
                          ? String(productModel[key as keyof ProductModel])
                          : '—'
                      }
                      className="h-8 text-sm"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{suffix}</span>
                  </div>
                </div>
              ))}

              {showImei && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">IMEI</Label>
                    <Input {...form.register('imei')} placeholder="—" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">IMEI 2</Label>
                    <Input {...form.register('imei2')} placeholder="—" className="h-8 text-sm" />
                  </div>
                </>
              )}

              {filteredBooleanFields.map((key) => (
                <div key={key} className="flex items-center justify-between py-1">
                  <Label className="text-xs text-muted-foreground">{getSpecFieldLabel(key)}</Label>
                  <Switch
                    checked={form.watch(key) ?? false}
                    onCheckedChange={(val) => form.setValue(key, val)}
                  />
                </div>
              ))}
            </div>

            {/* Product-model-only fields (read-only) */}
            {filteredProductOnlyFields.some((f) => productModel?.[f as keyof ProductModel] != null) && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs text-muted-foreground italic">From product model (read-only)</p>
                {filteredProductOnlyFields.map((key) => {
                  const val = productModel?.[key as keyof ProductModel]
                  if (val == null) return null
                  return (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{getSpecFieldLabel(key)}</span>
                      <span>{typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val)}</span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={updateItem.isPending}>
                {updateItem.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Specs</CardTitle>
        {!locked && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3 mr-1" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {filteredTextFields.map((key) => (
          <Row key={key} label={getSpecFieldLabel(key)} value={getResolvedValue(key) as string | null} />
        ))}
        {filteredNumberFields.map(({ key, suffix }) => {
          const val = getResolvedValue(key) as number | null
          return <Row key={key} label={getSpecFieldLabel(key)} value={val != null ? `${val}${suffix}` : null} />
        })}
        {showImei && (
          <>
            <Row label="IMEI" value={item.imei} />
            <Row label="IMEI 2" value={item.imei2} />
          </>
        )}
        {filteredBooleanFields.map((key) => (
          <BooleanRow key={key} label={getSpecFieldLabel(key)} value={getResolvedValue(key) as boolean | null} />
        ))}

        {/* Product-model-only fields */}
        {filteredProductOnlyFields.map((key) => {
          const val = productModel?.[key as keyof ProductModel]
          if (val == null) return null
          if (typeof val === 'boolean') {
            return <BooleanRow key={key} label={getSpecFieldLabel(key)} value={val} />
          }
          return <Row key={key} label={getSpecFieldLabel(key)} value={String(val)} />
        })}

        {/* Notes inline */}
        {item.condition_notes && (
          <div className="border-t pt-2 mt-2">
            <span className="text-muted-foreground font-medium">Condition Notes</span>
            <p className="mt-1 whitespace-pre-wrap">{item.condition_notes}</p>
          </div>
        )}
        {item.specs_notes && (
          <div className="border-t pt-2">
            <span className="text-muted-foreground font-medium">Specs Notes</span>
            <p className="mt-1 whitespace-pre-wrap">{item.specs_notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value || '—'}</span>
    </div>
  )
}

function BooleanRow({ label, value }: { label: string; value: boolean | null | undefined }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value == null ? '—' : value ? 'Yes' : 'No'}</span>
    </div>
  )
}
