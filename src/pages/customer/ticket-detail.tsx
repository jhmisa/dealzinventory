import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Check, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTicket } from '@/hooks/use-tickets'
import { StatusBadge, CodeDisplay, FormSkeleton } from '@/components/shared'
import { TicketTypeBadge } from '@/components/tickets'
import { TICKET_STATUSES, RETURN_REASONS } from '@/lib/constants'
import { formatDateTime, formatPrice, cn } from '@/lib/utils'
import type { ReturnData } from '@/services/tickets'

const STATUS_FLOW = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const

export default function CustomerTicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: ticket, isLoading } = useTicket(id!)

  if (isLoading) return <FormSkeleton fields={6} />
  if (!ticket) return <div className="text-center py-12 text-muted-foreground">Ticket not found.</div>

  const ticketType = ticket.ticket_types as { name: string; label: string; icon: string } | null
  const returnData = ticket.return_data as ReturnData | null
  const isCancelled = ticket.ticket_status === 'CANCELLED'
  const currentIdx = STATUS_FLOW.indexOf(ticket.ticket_status as typeof STATUS_FLOW[number])
  const media = (ticket.ticket_media ?? []) as { id: string; file_url: string; media_type: string }[]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/account/tickets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <CodeDisplay code={ticket.ticket_code} />
            <TicketTypeBadge ticketType={ticketType} />
            <StatusBadge status={ticket.ticket_status} config={TICKET_STATUSES} />
          </div>
          <h1 className="text-lg font-bold mt-1">{ticket.subject}</h1>
        </div>
      </div>

      {/* Status Progress */}
      {!isCancelled && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              {STATUS_FLOW.map((step, i) => (
                <div key={step} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center border-2',
                        i <= currentIdx
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-muted-foreground/30 text-muted-foreground',
                      )}
                    >
                      {i < currentIdx ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Circle className="h-3 w-3" />
                      )}
                    </div>
                    <span className="text-xs mt-1 text-center">{step.replace('_', ' ')}</span>
                  </div>
                  {i < STATUS_FLOW.length - 1 && (
                    <div
                      className={cn(
                        'flex-1 h-0.5 mx-2',
                        i < currentIdx ? 'bg-primary' : 'bg-muted-foreground/20',
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isCancelled && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-red-800">This ticket has been cancelled.</p>
          </CardContent>
        </Card>
      )}

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
        </CardContent>
      </Card>

      {/* Return-specific data */}
      {returnData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Return Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Reason: </span>
              <span className="font-medium">
                {RETURN_REASONS.find(r => r.value === returnData.reason_category)?.label ?? returnData.reason_category}
              </span>
            </div>
            {returnData.refund_amount != null && (
              <div className="text-sm">
                <span className="text-muted-foreground">Refund Amount: </span>
                <span className="font-medium">{formatPrice(returnData.refund_amount)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Resolution */}
      {ticket.resolution_notes && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-base text-green-800">Resolution</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-green-900">{ticket.resolution_notes}</p>
            {ticket.resolved_at && (
              <p className="text-xs text-green-700 mt-2">{formatDateTime(ticket.resolved_at)}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Customer media */}
      {media.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attached Media</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {media.map((m) => (
                <a
                  key={m.id}
                  href={m.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square overflow-hidden rounded-md border"
                >
                  {m.media_type === 'video' ? (
                    <video src={m.file_url} className="h-full w-full object-cover" />
                  ) : (
                    <img src={m.file_url} alt="" className="h-full w-full object-cover" />
                  )}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Meta */}
      <div className="text-xs text-muted-foreground">
        Created {formatDateTime(ticket.created_at)}
      </div>
    </div>
  )
}
