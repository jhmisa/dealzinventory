import type { UseFormReturn } from 'react-hook-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { SPEC_CHECK_FIELDS } from '@/lib/constants'
import type { DeviceCategory } from '@/lib/constants'
import type { InspectionFormValues } from '@/validators/inspection'
import type { Item, ProductModel } from '@/lib/types'

interface SpecsCheckSectionProps {
  form: UseFormReturn<InspectionFormValues>
  item: Item
  productModel: ProductModel | null
  deviceCategory: DeviceCategory | null
}

export function SpecsCheckSection({ form, item, productModel, deviceCategory }: SpecsCheckSectionProps) {
  const fields = SPEC_CHECK_FIELDS.filter(
    (f) => !deviceCategory || f.categories.includes(deviceCategory)
  )

  function resolveValue(key: string): string | number | boolean | null {
    const itemVal = (item as Record<string, unknown>)[key]
    if (itemVal !== null && itemVal !== undefined) return itemVal as string | number | boolean
    if (productModel) {
      const pmVal = (productModel as Record<string, unknown>)[key]
      if (pmVal !== null && pmVal !== undefined) return pmVal as string | number | boolean
    }
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Specs Check</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map((field) => {
            const currentVal = resolveValue(field.key)
            const formKey = field.key as keyof InspectionFormValues

            if (field.type === 'boolean') {
              return (
                <div key={field.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`spec-${field.key}`}
                    checked={form.watch(formKey) as boolean ?? currentVal === true}
                    onCheckedChange={(checked) => form.setValue(formKey, checked as boolean, { shouldDirty: true })}
                  />
                  <Label htmlFor={`spec-${field.key}`}>{field.label}</Label>
                </div>
              )
            }

            return (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`spec-${field.key}`} className="text-sm">
                  {field.label}
                </Label>
                <Input
                  id={`spec-${field.key}`}
                  type={field.type === 'number' ? 'number' : 'text'}
                  placeholder={currentVal != null ? String(currentVal) : '—'}
                  defaultValue={currentVal != null ? String(currentVal) : ''}
                  {...form.register(formKey as 'cpu' | 'ram_gb' | 'storage_gb' | 'os_family' | 'screen_size' | 'keyboard_layout' | 'gpu' | 'color' | 'carrier' | 'imei')}
                />
              </div>
            )
          })}
        </div>

        <div className="space-y-1">
          <Label htmlFor="specs_notes" className="text-sm">Specs Notes</Label>
          <Textarea
            id="specs_notes"
            placeholder="Any notes about spec discrepancies..."
            {...form.register('specs_notes')}
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  )
}
