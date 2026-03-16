import { Controller, type UseFormReturn } from 'react-hook-form'
import { Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { SCREEN_CONDITIONS, SCREEN_DEFECTS } from '@/lib/constants'
import type { DeviceCategory } from '@/lib/constants'
import type { InspectionFormValues } from '@/validators/inspection'
import { cn } from '@/lib/utils'

interface ScreenConditionSectionProps {
  form: UseFormReturn<InspectionFormValues>
  deviceCategory: DeviceCategory | null
}

export function ScreenConditionSection({ form, deviceCategory }: ScreenConditionSectionProps) {
  const defects = SCREEN_DEFECTS.filter(
    (d) => !deviceCategory || d.categories.includes(deviceCategory)
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Screen Condition</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Controller
          control={form.control}
          name="screen_condition"
          render={({ field }) => (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {SCREEN_CONDITIONS.map((sc) => (
                <button
                  key={sc.value}
                  type="button"
                  className={cn(
                    'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-sm',
                    field.value === sc.value
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-muted hover:border-muted-foreground/30',
                  )}
                  onClick={() => field.onChange(sc.value)}
                >
                  <span className="font-medium">{sc.label}</span>
                  <span className="text-xs text-muted-foreground text-center">{sc.description}</span>
                  {field.value === sc.value && (
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
