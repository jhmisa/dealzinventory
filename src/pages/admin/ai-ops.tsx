import { useState } from 'react'
import { toast } from 'sonner'
import { Bot } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ProposalCard, ActivityFeed, OpsControls } from '@/components/ai-ops'
import {
  useAiOpsProposals,
  useAiOpsActivity,
  useAiOpsSettings,
  useApproveAiOpsProposal,
  useRejectAiOpsProposal,
  useSetAiOpsEnabled,
  useSetAiOpsReplyAutonomy,
} from '@/hooks/use-ai-ops'

export default function AiOpsPage() {
  const [tab, setTab] = useState('pending')
  const { data: pending, isPending: pendingLoading } = useAiOpsProposals('PENDING')
  const { data: all } = useAiOpsProposals()
  const { data: activity } = useAiOpsActivity()
  const { data: settings } = useAiOpsSettings()

  const approve = useApproveAiOpsProposal()
  const reject = useRejectAiOpsProposal()
  const setEnabled = useSetAiOpsEnabled()
  const setAutonomy = useSetAiOpsReplyAutonomy()

  const busy = approve.isPending || reject.isPending
  const history = (all ?? []).filter((p) => p.status !== 'PENDING')

  const handleApprove = (id: string, content?: string) => {
    approve.mutate(
      { id, content },
      {
        onSuccess: () => toast.success('Reply sent to customer'),
        onError: (err) => toast.error(`Send failed: ${err.message}`),
      },
    )
  }

  const handleReject = (id: string, note?: string) => {
    reject.mutate(
      { id, note },
      {
        onSuccess: () => toast.success('Proposal rejected'),
        onError: (err) => toast.error(`Reject failed: ${err.message}`),
      },
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bot className="h-6 w-6" />
          AI Operations
        </h1>
        <p className="text-sm text-muted-foreground">
          Review what the ops agent proposes. While autonomy is PROPOSE, nothing reaches a customer
          without approval here.
        </p>
      </div>

      {settings && (
        <OpsControls
          settings={settings}
          onToggleEnabled={(enabled) =>
            setEnabled.mutate(enabled, {
              onSuccess: () => toast.success(enabled ? 'AI Ops enabled' : 'AI Ops halted'),
              onError: (err) => toast.error(err.message),
            })
          }
          onSetAutonomy={(level) =>
            setAutonomy.mutate(level, {
              onSuccess: () => toast.success(`Reply autonomy: ${level}`),
              onError: (err) => toast.error(err.message),
            })
          }
          busy={setEnabled.isPending || setAutonomy.isPending}
        />
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {(pending?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-2">{pending!.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (pending?.length ?? 0) === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Queue is clear 🎉</p>
          ) : (
            pending!.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                onApprove={handleApprove}
                onReject={handleReject}
                busy={busy}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {history.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No reviewed proposals yet.</p>
          ) : (
            history.map((p) => <ProposalCard key={p.id} proposal={p} />)
          )}
        </TabsContent>

        <TabsContent value="activity">
          <ActivityFeed items={activity ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
