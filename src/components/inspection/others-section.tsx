import { Controller, type UseFormReturn } from 'react-hook-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FUNCTIONALITY_CHECKS, AC_ADAPTER_STATUSES } from '@/lib/constants'
import type { DeviceCategory } from '@/lib/constants'
import type { InspectionFormValues } from '@/validators/inspection'

interface OthersSectionProps {
  form: UseFormReturn<InspectionFormValues>
  deviceCategory: DeviceCategory | null
}

export function OthersSection({ form, deviceCategory }: OthersSectionProps) {
  const funcChecks = FUNCTIONALITY_CHECKS.filter(
    (f) => !deviceCategory || f.categories.includes(deviceCategory)
  )

  const showAcAdapter = !deviceCategory || ['COMPUTER', 'TABLET', 'OTHER'].includes(deviceCategory)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Functionality & Other</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Functionality Checks */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Functionality Checks</Label>
          <div className="space-y-3">
            {funcChecks.map((check) => {
              const statusKey = `inspection_checklist.${check.key}_status` as const
              const noteKey = `inspection_checklist.${check.key}_note` as const
              const statusValue = form.watch(statusKey as `inspection_checklist.${string}`) as string

              return (
                <div key={check.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <Label className="text-sm w-48 shrink-0">{check.label}</Label>
                  <Controller
                    control={form.control}
                    name={statusKey as `inspection_checklist.${string}`}
                    render={({ field }) => (
                      <Select
                        value={field.value as string ?? ''}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="w-40">
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
                      className="flex-1"
                      {...form.register(noteKey as `inspection_checklist.${string}`)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Battery Health */}
        <div className="space-y-1">
          <Label htmlFor="battery_health_pct" className="text-sm font-medium">
            Battery Health (%)
          </Label>
          <Input
            id="battery_health_pct"
            type="number"
            min={0}
            max={100}
            placeholder="e.g. 87"
            className="w-32"
            {...form.register('battery_health_pct')}
          />
        </div>

        {/* AC Adapter */}
        {showAcAdapter && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">AC Adapter</Label>
            <Controller
              control={form.control}
              name="ac_adapter_status"
              render={({ field }) => (
                <RadioGroup
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  className="flex gap-4"
                >
                  {AC_ADAPTER_STATUSES.map((ac) => (
                    <div key={ac.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={ac.value} id={`ac-${ac.value}`} />
                      <Label htmlFor={`ac-${ac.value}`}>{ac.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            />
          </div>
        )}

        {/* Condition Notes */}
        <div className="space-y-1">
          <Label htmlFor="condition_notes" className="text-sm font-medium">
            Condition Notes
          </Label>
          <Textarea
            id="condition_notes"
            placeholder="Any additional condition notes..."
            {...form.register('condition_notes')}
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  )
}
