import { useEffect, useState, type KeyboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { useCreateShoot, useUpdateShoot } from '@/hooks/use-shoots'
import { useStaffProfiles } from '@/hooks/use-staff-profiles'
import { shootSchema, type ShootFormValues } from '@/validators/shoot'
import type { ShootInsert, ShootUpdate } from '@/lib/types'
import type { ShootWithAssignee } from '@/services/shoots'

// Sentinel value for the "Unassigned" / "None" Select options — Radix Select can't hold an
// empty-string value, so we map these to null on submit.
const UNASSIGNED = '__unassigned__'
const NO_ORIENTATION = '__none__'

interface ShootFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Present => edit mode; absent => create mode.
  shoot?: ShootWithAssignee
}

const emptyValues: ShootFormValues = {
  title: '',
  assignee_id: null,
  item_codes: [],
  notes: '',
  orientation: undefined,
}

export function ShootFormDialog({ open, onOpenChange, shoot }: ShootFormDialogProps) {
  const { data: staff = [] } = useStaffProfiles()
  const createMutation = useCreateShoot()
  const updateMutation = useUpdateShoot()
  const isEdit = Boolean(shoot)

  const [codeInput, setCodeInput] = useState('')

  const form = useForm<ShootFormValues>({
    resolver: zodResolver(shootSchema),
    defaultValues: emptyValues,
  })

  // Seed the form when opening (edit -> the shoot's values, create -> empty).
  useEffect(() => {
    if (!open) return
    setCodeInput('')
    if (shoot) {
      form.reset({
        title: shoot.title,
        assignee_id: shoot.assignee_id ?? null,
        item_codes: shoot.item_codes ?? [],
        notes: shoot.notes ?? '',
        orientation:
          shoot.orientation === 'portrait' || shoot.orientation === 'landscape'
            ? shoot.orientation
            : undefined,
      })
    } else {
      form.reset(emptyValues)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shoot])

  const activeStaff = staff.filter((s) => s.is_active)
  const codes = form.watch('item_codes')

  function addCode() {
    const value = codeInput.trim()
    if (!value) return
    const current = form.getValues('item_codes')
    if (!current.includes(value)) {
      form.setValue('item_codes', [...current, value], { shouldValidate: true })
    }
    setCodeInput('')
  }

  function removeCode(code: string) {
    form.setValue(
      'item_codes',
      form.getValues('item_codes').filter((c) => c !== code),
      { shouldValidate: true },
    )
  }

  function handleCodeKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addCode()
    } else if (e.key === 'Backspace' && !codeInput && codes.length > 0) {
      // Backspace on an empty input removes the last chip.
      removeCode(codes[codes.length - 1])
    }
  }

  function onSubmit(values: ShootFormValues) {
    const payload = {
      title: values.title,
      assignee_id: values.assignee_id ?? null,
      item_codes: values.item_codes,
      notes: values.notes?.trim() ? values.notes.trim() : null,
      orientation: values.orientation ?? null,
    }

    if (isEdit && shoot) {
      updateMutation.mutate(
        { id: shoot.id, updates: payload as ShootUpdate },
        {
          onSuccess: () => {
            toast.success('Shoot updated')
            onOpenChange(false)
          },
          onError: (err) => toast.error(`Failed to update: ${err.message}`),
        },
      )
    } else {
      createMutation.mutate(payload as ShootInsert, {
        onSuccess: () => {
          toast.success('Shoot created')
          onOpenChange(false)
        },
        onError: (err) => toast.error(`Failed to create: ${err.message}`),
      })
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Shoot' : 'New Shoot'}</DialogTitle>
          <DialogDescription>
            Plan a live-selling or product video shoot — assign it, list the item codes to feature, and add notes.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. iPhone 15 Pro live-selling batch" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="assignee_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignee</FormLabel>
                    <Select
                      value={field.value ?? UNASSIGNED}
                      onValueChange={(v) => field.onChange(v === UNASSIGNED ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {activeStaff.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="orientation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orientation</FormLabel>
                    <Select
                      value={field.value ?? NO_ORIENTATION}
                      onValueChange={(v) =>
                        field.onChange(v === NO_ORIENTATION ? undefined : (v as 'portrait' | 'landscape'))
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_ORIENTATION}>None</SelectItem>
                        <SelectItem value="portrait">Portrait</SelectItem>
                        <SelectItem value="landscape">Landscape</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="item_codes"
              render={() => (
                <FormItem>
                  <FormLabel>Item Codes</FormLabel>
                  <div className="rounded-md border p-2">
                    {codes.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {codes.map((code) => (
                          <Badge key={code} variant="secondary" className="gap-1 font-mono">
                            {code}
                            <button
                              type="button"
                              aria-label={`Remove ${code}`}
                              className="rounded-sm opacity-70 hover:opacity-100"
                              onClick={() => removeCode(code)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <Input
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      onKeyDown={handleCodeKeyDown}
                      onBlur={addCode}
                      placeholder="Type a code and press Enter (e.g. P000417)"
                      className="border-0 p-0 shadow-none focus-visible:ring-0"
                    />
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ''}
                      rows={3}
                      placeholder="Angles, talking points, props…"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Shoot'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
