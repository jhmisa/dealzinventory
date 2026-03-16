import { Controller, type UseFormReturn } from 'react-hook-form'
import { Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { BODY_CONDITIONS, BODY_DEFECTS } from '@/lib/constants'
import type { DeviceCategory } from '@/lib/constants'
import type { InspectionFormValues } from '@/validators/inspection'
import { cn } from '@/lib/utils'

interface BodyConditionSectionProps {
  form: UseFormReturn<InspectionFormValues>
  deviceCategory: DeviceCategory | null
}

export function BodyConditionSection({ form, deviceCategory }: BodyConditionSectionProps) {
  const defects = BODY_DEFECTS.filter(
    (d) => !deviceCategory || d.categories.includes(deviceCategory)
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Body Condition</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Controller
          control={form.control}
          name="body_condition"
          render={({ field }) => (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {BODY_CONDITIONS.map((bc) => (
                <button
                  key={bc.value}
                  type="button"
                  className={cn(
                    'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-sm',
                    field.value === bc.value
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-muted hover:border-muted-foreground/30',
                  )}
                  onClick={() => field.onChange(bc.value)}
                >
                  <span className="font-medium">{bc.label}</span>
                  <span className="text-xs text-muted-foreground text-center">{bc.description}</span>
                  {field.value === bc.value && (
                    <Check className="h-3 w-3 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        />

        <div>
          <Label className="text-sm font-medium">Defects Found</Label>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {defects.map((defect) => {
              const checklistKey = `inspection_checklist.${defect.key}` as const
              return (
                <div key={defect.key} className="flex items-center gap-2">
                  <Controller
                    control={form.control}
                    name={checklistKey as `inspection_checklist.${string}`}
                    render={({ field }) => (
                      <Checkbox
                        id={defect.key}
                        checked={field.value as boolean ?? false}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                  <Label htmlFor={defect.key} className="text-sm font-normal cursor-pointer">
                    {defect.label}
                  </Label>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
