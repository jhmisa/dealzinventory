import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { ContentRule, ContentRulePickStrategy } from '@/lib/types'
import { useContentCategories } from '@/hooks/use-content-categories'
import { useCreateContentRule, useUpdateContentRule } from '@/hooks/use-content-rules'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { cadenceSummary } from './cadence-summary'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STRATEGIES: { value: ContentRulePickStrategy; label: string; hint: string }[] = [
  { value: 'lru', label: 'Least recent', hint: 'Rotate — post the one shown longest ago' },
  { value: 'random', label: 'Random', hint: 'Pick at random each slot' },
  { value: 'newest', label: 'Newest', hint: 'Favour the freshest content' },
]

interface RuleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule?: ContentRule
}

export function RuleFormDialog({ open, onOpenChange, rule }: RuleFormDialogProps) {
  const isEdit = Boolean(rule)
  const { data: categories = [] } = useContentCategories()
  const createRule = useCreateContentRule()
  const updateRule = useUpdateContentRule()

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [days, setDays] = useState<number[]>([1, 3, 5])
  const [time, setTime] = useState('18:00')
  const [strategy, setStrategy] = useState<ContentRulePickStrategy>('lru')
  const [activeFrom, setActiveFrom] = useState('')
  const [activeTo, setActiveTo] = useState('')

  useEffect(() => {
    if (!open) return
    if (rule) {
      const cadence = (rule.cadence ?? {}) as { days?: number[]; time?: string }
      setName(rule.name)
      setCategoryId(rule.category_id ?? '')
      setDays(Array.isArray(cadence.days) ? cadence.days : [1, 3, 5])
      setTime(cadence.time ?? '18:00')
      setStrategy((rule.pick_strategy as ContentRulePickStrategy) ?? 'lru')
      setActiveFrom(rule.active_from ?? '')
      setActiveTo(rule.active_to ?? '')
    } else {
      setName('')
      setCategoryId(categories[0]?.id ?? '')
      setDays([1, 3, 5])
      setTime('18:00')
      setStrategy('lru')
      setActiveFrom('')
      setActiveTo('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule])

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)))
  }

  const saving = createRule.isPending || updateRule.isPending
  const canSave = name.trim() && categoryId && days.length > 0

  function handleSubmit() {
    const payload = {
      name: name.trim(),
      category_id: categoryId,
      cadence: { days, time },
      pick_strategy: strategy,
      active_from: activeFrom || null,
      active_to: activeTo || null,
    }
    const onSuccess = () => {
      toast.success(isEdit ? 'Rule updated — calendar refreshed' : 'Rule created — ghosts added to the calendar')
      onOpenChange(false)
    }
    const onError = (e: unknown) => toast.error(`Couldn't save: ${(e as Error).message}`)
    if (isEdit && rule) {
      updateRule.mutate({ id: rule.id, updates: payload }, { onSuccess, onError })
    } else {
      createRule.mutate({ ...payload, active: true }, { onSuccess, onError })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit rule' : 'New rule'}</DialogTitle>
          <DialogDescription>
            Pick a pool, a cadence, and how to choose. Posts are materialised onto the calendar as editable
            drafts — nothing publishes until you enable the publisher.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily deals reel" />
          </div>

          <div className="space-y-1.5">
            <Label>Pool (category)</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>How often</Label>
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>
                Daily
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDays([1, 2, 3, 4, 5])}>
                Weekdays
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDays([0, 6])}>
                Weekends
              </Button>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex gap-1">
                {DAY_LABELS.map((label, d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={cn(
                      'h-8 w-9 rounded-md border text-xs font-medium transition-colors',
                      days.includes(d)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {label[0]}
                  </button>
                ))}
              </div>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Which one to post</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {STRATEGIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStrategy(s.value)}
                  title={s.hint}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                    strategy === s.value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Active from</Label>
              <Input type="date" value={activeFrom} onChange={(e) => setActiveFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Active until</Label>
              <Input type="date" value={activeTo} onChange={(e) => setActiveTo(e.target.value)} />
            </div>
          </div>

          <div className="rounded-md bg-muted p-3 text-sm">
            <span className="text-muted-foreground">Preview: </span>
            <span className="font-medium">{cadenceSummary({ days, time })}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave || saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
