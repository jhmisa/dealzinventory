import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, User, ShoppingBag, MessageSquare, Link2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  PageHeader,
  StatusBadge,
  CodeDisplay,
  PriceDisplay,
  FormSkeleton,
} from '@/components/shared'
import {
  TicketDetailHeader,
  TicketNotesSection,
  TicketMediaSection,
} from '@/components/tickets'
import { useTicket, useResolveTicket, useUpdateTicket } from '@/hooks/use-tickets'
import { useCustomerOrders } from '@/hooks/use-customers'
import { TICKET_STATUSES, RETURN_REASONS, RESOLUTION_TYPES } from '@/lib/constants'
import { formatDate, formatDateTime, formatPrice, formatCustomerName } from '@/lib/utils'
import type { TicketStatus } from '@/lib/types'
import type { ReturnData } from '@/services/tickets'

export default function TicketDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: ticket, isLoading } = useTicket(id!)
  const resolveTicket = useResolveTicket()
  const updateTicket = useUpdateTicket()

  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [linkingOrder, setLinkingOrder] = useState(false)

  // Extract customer ID for order fetching (must be before early returns for hooks rules)
  const customerId = (ticket?.customers as { id: string } | null)?.id ?? ''
  const { data: customerOrders = [] } = useCustomerOrders(customerId)

  if (isLoading) return <FormSkeleton />
  if (!ticket) return <div className="p-8 text-center text-muted-foreground">Ticket not found.</div>

  const ticketType = ticket.ticket_types as { id: string; name: string; slug: string; label: string; icon: string } | null
  const customer = ticket.customers as { id: string; customer_code: string; last_name: string; first_name: string; email: string; phone: string } | null
  const order = ticket.orders as { id: string; order_code: string; order_status: string; total_price: number } | null
  const conversation = ticket.conversations as { contact_name: string | null } | null
  const notes = (ticket.ticket_notes ?? []) as { id: string; staff_id: string | null; content: string; note_type: string; metadata: Record<string, unknown> | null; created_at: string; ticket_id: string }[]
  const media = (ticket.ticket_media ?? []) as { id: string; file_url: string; media_type: string; sort_order: number; uploaded_at: string; ticket_id: string }[]
  const returnData = ticket.return_data as ReturnData | null

  function handleLinkOrder(orderId: string | null) {
    updateTicket.mutate(
      { id: ticket!.id, order_id: orderId },
      {
        onSuccess: () => {
          toast.success(orderId ? 'Order linked' : 'Order unlinked')
          setLinkingOrder(false)
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function handleResolve() {
    if (!resolutionNotes.trim()) return
    resolveTicket.mutate(
      { id: ticket!.id, resolutionNotes: resolutionNotes.trim() },
      {
        onSuccess: () => {
          toast.success('Ticket resolved')
          setResolveOpen(false)
          setResolutionNotes('')
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/tickets')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader title={ticket.subject} />
      </div>

      {/* Header with status controls */}
      <TicketDetailHeader
        ticketId={ticket.id}
        ticketCode={ticket.ticket_code}
        ticketStatus={ticket.ticket_status as TicketStatus}
        priority={ticket.priority as TicketStatus}
        assignedStaffId={ticket.assigned_staff_id}
        ticketType={ticketType}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
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
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Reason: </span>
                    <span className="font-medium">
                      {RETURN_REASONS.find(r => r.value === returnData.reason_category)?.label ?? returnData.reason_category}
                    </span>
                  </div>
                  {returnData.resolution_type && (
                    <div>
                      <span className="text-muted-foreground">Resolution: </span>
                      <span className="font-medium">
                        {RESOLUTION_TYPES.find(r => r.value === returnData.resolution_type)?.label ?? returnData.resolution_type}
                      </span>
                    </div>
                  )}
                  {returnData.refund_amount != null && (
                    <div>
                      <span className="text-muted-foreground">Refund: </span>
                      <span className="font-medium">{formatPrice(returnData.refund_amount)}</span>
                    </div>
                  )}
                </div>
                {returnData.items && returnData.items.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Items</h4>
                    <div className="space-y-1">
                      {returnData.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded">
                          {item.item_id && (
                            <Link
                              to={`/admin/items/${item.item_id}`}
                              className="font-mono text-primary hover:underline"
                            >
                              View Item
                            </Link>
                          )}
                          {item.reason_note && (
                            <span className="text-muted-foreground">— {item.reason_note}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Linked entities */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Linked Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer ? (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <Link to={`/admin/customers/${customer.id}`} className="text-primary hover:underline">
                    {formatCustomerName(customer)}
                  </Link>
                  <span className="text-muted-foreground">({customer.customer_code})</span>
                  {customer.email && <span className="text-muted-foreground">· {customer.email}</span>}
                </div>
              ) : conversation?.contact_name && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{conversation.contact_name}</span>
                  <span className="text-muted-foreground">(from conversation)</span>
                </div>
              )}
              {order ? (
                <div className="flex items-center gap-2 text-sm">
                  <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                  <Link to={`/admin/orders/${order.id}`} className="text-primary hover:underline">
                    {order.order_code}
                  </Link>
                  <StatusBadge status={order.order_status} config={[
                    { value: 'PENDING', label: 'Pending', color: 'bg-gray-100 text-gray-800 border-gray-300' },
                    { value: 'CONFIRMED', label: 'Confirmed', color: 'bg-blue-100 text-blue-800 border-blue-300' },
                    { value: 'SHIPPED', label: 'Shipped', color: 'bg-purple-100 text-purple-800 border-purple-300' },
                    { value: 'DELIVERED', label: 'Delivered', color: 'bg-green-100 text-green-800 border-green-300' },
                  ]} />
                  <PriceDisplay price={order.total_price} />
                  {customer && (
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setLinkingOrder(true)}
                      >
                        Change
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => handleLinkOrder(null)}
                        disabled={updateTicket.isPending}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ) : customer && !linkingOrder ? (
                <div className="flex items-center gap-2 text-sm">
                  <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setLinkingOrder(true)}
                  >
                    <Link2 className="h-3 w-3 mr-1" />
                    Link Order
                  </Button>
                </div>
              ) : null}
              {linkingOrder && customer && (
                <div className="flex items-center gap-2 text-sm">
                  <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                  <Select
                    onValueChange={(v) => handleLinkOrder(v)}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Select an order..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customerOrders.map((o: { id: string; order_code: string; order_status: string; created_at: string }) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.order_code} · {o.order_status} · {formatDate(o.created_at)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1"
                    onClick={() => setLinkingOrder(false)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {ticket.conversation_id && (
                <div className="flex items-center gap-2 text-sm">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <Link to={`/admin/messages?conversation=${ticket.conversation_id}`} className="text-primary hover:underline">
                    View Conversation
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resolution */}
          {ticket.resolution_notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resolution</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{ticket.resolution_notes}</p>
                {ticket.resolved_at && (
                  <p className="text-xs text-muted-foreground mt-2">Resolved {formatDateTime(ticket.resolved_at)}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column (1/3) */}
        <div className="space-y-6">
          {/* Actions */}
          {ticket.ticket_status === 'IN_PROGRESS' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={() => setResolveOpen(true)}>
                  Resolve Ticket
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Notes & Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes & Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <TicketNotesSection ticketId={ticket.id} notes={notes} />
            </CardContent>
          </Card>

          {/* Media */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Media</CardTitle>
            </CardHeader>
            <CardContent>
              <TicketMediaSection ticketId={ticket.id} media={media} />
            </CardContent>
          </Card>

          {/* Meta info */}
          <Card>
            <CardContent className="pt-6 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDateTime(ticket.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span>{formatDateTime(ticket.updated_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created by</span>
                <span>{ticket.created_by_name ?? <span className="capitalize">{ticket.created_by_role}</span>}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Resolve Dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">Resolution Notes</label>
            <Textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Describe how this ticket was resolved..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button onClick={handleResolve} disabled={!resolutionNotes.trim() || resolveTicket.isPending}>
              {resolveTicket.isPending ? 'Resolving...' : 'Resolve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
