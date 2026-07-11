import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { ContentRule } from '@/lib/types'
import { useContentRules, useSetRuleActive, useDeleteContentRule, useRuleMaterializedCounts } from '@/hooks/use-content-rules'
import { useContentCategories } from '@/hooks/use-content-categories'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/shared'
import { cadenceSummary, type Cadence } from './cadence-summary'
import { RuleFormDialog } from './rule-form-dialog'

const STRATEGY_LABEL: Record<string, string> = { lru: 'Least recent', random: 'Random', newest: 'Newest' }

export function RulesTab() {
  const { data: rules = [], isLoading } = useContentRules()
  const { data: categories = [] } = useContentCategories()
  const { data: counts } = useRuleMaterializedCounts()
  const setActive = useSetRuleActive()
  const deleteRule = useDeleteContentRule()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ContentRule | undefined>(undefined)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function openNew() {
    setEditing(undefined)
    setFormOpen(true)
  }
  function openEdit(rule: ContentRule) {
    setEditing(rule)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Rules</h2>
          <p className="text-sm text-muted-foreground">
            Automations that materialise editable posts onto the calendar. Nothing publishes until you enable the publisher.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" /> New Rule
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No rules yet. Create one to start auto-filling the calendar from a category pool.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((rule) => {
            const category = categories.find((c) => c.id === rule.category_id) ?? null
            const count = counts?.get(rule.id) ?? 0
            return (
              <Card key={rule.id} className={rule.active ? '' : 'opacity-70'}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{rule.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {category && (
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
                        )}
                        {category?.name ?? 'No pool'}
                      </div>
                    </div>
                    <Switch
                      checked={rule.active}
                      onCheckedChange={(v) =>
                        setActive.mutate(
                          { id: rule.id, active: v },
                          { onError: (e) => toast.error((e as Error).message) },
                        )
                      }
                    />
                  </div>
                  <div className="text-sm">{cadenceSummary((rule.cadence ?? {}) as Cadence)}</div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{STRATEGY_LABEL[rule.pick_strategy] ?? rule.pick_strategy}</span>
                    <span>{count} scheduled</span>
                  </div>
                  <div className="flex justify-end gap-1 border-t pt-2">
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => openEdit(rule)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs text-destructive"
                      onClick={() => setDeleteId(rule.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <RuleFormDialog open={formOpen} onOpenChange={setFormOpen} rule={editing} />
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Delete rule?"
        description="Future auto-scheduled posts from this rule stay on the calendar but stop being managed by it. This can't be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteId) {
            deleteRule.mutate(deleteId, {
              onSuccess: () => toast.success('Rule deleted'),
              onError: (e) => toast.error((e as Error).message),
            })
          }
          setDeleteId(null)
        }}
      />
    </div>
  )
}
