import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CodeDisplay } from '@/components/shared'
import { useCreateIntakeAdjustment } from '@/hooks/use-intake-receipts'
import { intakeAdjustmentSchema, type IntakeAdjustmentFormValues } from '@/validators/intake-receipt'
import { INTAKE_ADJUSTMENT_TYPES } from '@/lib/constants'
import type { Item } from '@/lib/types'

interface AdjustmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  receiptId: string
  items: Item[]
}

export function AdjustmentDialog({ open, onOpenChange, receiptId, items }: AdjustmentDialogProps) {
  const createMutation = useCreateIntakeAdjustment()

  const form = useForm<IntakeAdjustmentFormValues>({
    resolver: zodResolver(intakeAdjustmentSchema),
    defaultValues: {
      receipt_id: receiptId,
      adjustment_type: 'VOIDED',
      item_ids: [],
      reason: '',
    },
  })

  const selectedIds = form.watch('item_ids')

  function handleSubmit(values: IntakeAdjustmentFormValues) {
    createMutation.mutate(
      {
        receipt_id: receiptId,
        adjustment_type: values.adjustment_type,
        item_ids: values.item_ids,
        reason: values.reason,
      },
      {
        onSuccess: (data) => {
          toast.success(`Adjustment ${data.adjustment_code} created`)
          onOpenChange(false)
          form.reset({ receipt_id: receiptId, adjustment_type: 'VOIDED', item_ids: [], reason: '' })
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function toggleItem(itemId: string) {
    const current = form.getValues('item_ids')
    if (current.includes(itemId)) {
      form.setValue('item_ids', current.filter((id) => id !== itemId), { shouldValidate: true })
    } else {
      form.setValue('item_ids', [...current, itemId], { shouldValidate: true })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>New Adjustment</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <FormField
              control={form.control}
              name="adjustment_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {INTAKE_ADJUSTMENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="item_ids"
              render={() => (
                <FormItem>
                  <FormLabel>Items ({selectedIds.length} selected)</FormLabel>
                  <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                    {items.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedIds.includes(item.id)}
                          onCheckedChange={() => toggleItem(item.id)}
                        />
                        <CodeDisplay code={item.item_code} />
                        <span className="text-xs text-muted-foreground">{item.item_status}</span>
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe the reason for this adjustment..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Adjustment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
