import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as ruleService from '@/services/content-rules'
import type { ContentRuleInsert, ContentRuleUpdate } from '@/lib/types'

export function useContentRules() {
  return useQuery({
    queryKey: queryKeys.contentRules.list(),
    queryFn: () => ruleService.getContentRules(),
  })
}

// After a rule changes, re-materialise ghosts and refresh the calendar + rotation status.
function useRuleMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>, materialize = true) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      if (materialize) {
        try {
          await ruleService.materializeRules()
        } catch {
          // materialisation is best-effort; the rule still saved
        }
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.contentRules.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.contentCalendar.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.contentItems.all })
    },
  })
}

export function useCreateContentRule() {
  return useRuleMutation((input: ContentRuleInsert) => ruleService.createContentRule(input))
}

export function useUpdateContentRule() {
  return useRuleMutation(({ id, updates }: { id: string; updates: ContentRuleUpdate }) =>
    ruleService.updateContentRule(id, updates),
  )
}

export function useSetRuleActive() {
  return useRuleMutation(({ id, active }: { id: string; active: boolean }) => ruleService.setRuleActive(id, active))
}

export function useDeleteContentRule() {
  // No re-materialise needed; deleting the rule SET NULLs its ghost posts' rule_id.
  return useRuleMutation((id: string) => ruleService.deleteContentRule(id), false)
}
