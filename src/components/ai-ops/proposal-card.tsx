import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Bot, Check, X, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { AiOpsProposal } from '@/lib/types'

const STATUS_VARIANT: Record<AiOpsProposal['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'default',
  APPROVED: 'secondary',
  REJECTED: 'outline',
  EXECUTED: 'secondary',
  FAILED: 'destructive',
}

interface ProposalCardProps {
  proposal: AiOpsProposal
  onApprove?: (id: string, content?: string) => void
  onReject?: (id: string, note?: string) => void
  busy?: boolean
}

export function ProposalCard({ proposal, onApprove, onReject, busy }: ProposalCardProps) {
  const original = proposal.payload.content ?? ''
  const [content, setContent] = useState(original)
  const [note, setNote] = useState('')
  const edited = content !== original
  const reviewable = proposal.status === 'PENDING' && onApprove && onReject

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline" className="uppercase">{proposal.type}</Badge>
          <Badge variant={STATUS_VARIANT[proposal.status]}>{proposal.status}</Badge>
          {proposal.confidence != null && (
            <Badge variant="secondary">{Math.round(proposal.confidence * 100)}% confident</Badge>
          )}
          {edited && <Badge variant="outline" className="text-amber-600">edited</Badge>}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(proposal.created_at), { addSuffix: true })}
          </span>
        </div>
        <p className="text-sm font-medium">{proposal.summary}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {proposal.rationale && (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{proposal.rationale}</p>
        )}
        {proposal.payload.conversation_id && (
          <a
            href="/admin/messages"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Conversation {proposal.payload.conversation_id.slice(0, 8)}…
          </a>
        )}
        {reviewable ? (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="text-sm"
            disabled={busy}
          />
        ) : (
          <p className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{original}</p>
        )}
        {proposal.error && (
          <p className="text-xs text-destructive">Error: {proposal.error}</p>
        )}
        {proposal.review_note && (
          <p className="text-xs text-muted-foreground">Review note: {proposal.review_note}</p>
        )}
      </CardContent>
      {reviewable && (
        <CardFooter className="flex flex-wrap items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" disabled={busy || !content.trim()}>
                <Check className="mr-1 h-4 w-4" />
                Approve &amp; send
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Send this reply to the customer?</AlertDialogTitle>
                <AlertDialogDescription>
                  This sends a real message via Messenger{edited ? ' (with your edits)' : ''}. It cannot
                  be unsent.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onApprove(proposal.id, edited ? content : undefined)}>
                  Send it
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="ml-auto flex items-center gap-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reject note (optional)"
              className="h-8 w-44 text-xs"
              disabled={busy}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onReject(proposal.id, note.trim() || undefined)}
            >
              <X className="mr-1 h-4 w-4" />
              Reject
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  )
}
