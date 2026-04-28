import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/shared/status-badge'
import { CodeDisplay } from '@/components/shared/code-display'
import { TicketTypeBadge } from './ticket-type-badge'
import { TICKET_STATUSES, TICKET_PRIORITIES } from '@/lib/constants'
import { useStaffProfiles } from '@/hooks/use-staff-profiles'
import { useUpdateTicketStatus, useAssignTicket, useUpdateTicket } from '@/hooks/use-tickets'
import { toast } from 'sonner'
import type { TicketStatus, TicketPriority } from '@/lib/types'
import type { TicketType } from '@/services/tickets'

interface TicketDetailHeaderProps {
  ticketId: string
  ticketCode: string
  ticketStatus: TicketStatus
  priority: TicketPriority
  assignedStaffId: string | null
  ticketType: Pick<TicketType, 'name' | 'label' | 'icon'> | null
}

export function TicketDetailHeader({
  ticketId,
  ticketCode,
  ticketStatus,
  priority,
  assignedStaffId,
  ticketType,
}: TicketDetailHeaderProps) {
  const { data: staffProfiles = [] } = useStaffProfiles()
  const updateStatus = useUpdateTicketStatus()
  const assignTicket = useAssignTicket()
  const updateTicket = useUpdateTicket()

  function handleStatusChange(status: TicketStatus) {
    updateStatus.mutate(
      { id: ticketId, status },
      {
        onSuccess: () => toast.success(`Status updated to ${status}`),
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function handleAssign(staffId: string) {
    assignTicket.mutate(
      { id: ticketId, staffId: staffId === 'unassigned' ? null : staffId },
      {
        onSuccess: () => toast.success('Ticket assigned'),
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function handlePriorityChange(newPriority: TicketPriority) {
    updateTicket.mutate(
      { id: ticketId, priority: newPriority },
      {
        onSuccess: () => toast.success('Priority updated'),
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  const nextStatuses: Record<TicketStatus, TicketStatus[]> = {
    OPEN: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['RESOLVED', 'CANCELLED'],
    RESOLVED: ['CLOSED'],
    CLOSED: [],
    CANCELLED: [],
  }

  const available = nextStatuses[ticketStatus] ?? []

  return (
    <div className="flex flex-wrap items-center gap-3">
      <CodeDisplay code={ticketCode} />
      <TicketTypeBadge ticketType={ticketType} />
      <StatusBadge status={ticketStatus} config={TICKET_STATUSES} />

      <div className="flex items-center gap-2 ml-auto">
        {/* Priority */}
        <Select value={priority} onValueChange={(v) => handlePriorityChange(v as TicketPriority)}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TICKET_PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Assign */}
        <Select
          value={assignedStaffId ?? 'unassigned'}
          onValueChange={handleAssign}
        >
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Assign..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {staffProfiles.map((s: { id: string; display_name: string }) => (
              <SelectItem key={s.id} value={s.id}>
                {s.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status transitions */}
        {available.map((status) => (
          <Button
            key={status}
            size="sm"
            variant={status === 'CANCELLED' ? 'destructive' : 'default'}
            onClick={() => handleStatusChange(status)}
            disabled={updateStatus.isPending}
          >
            {status === 'IN_PROGRESS' && 'Start Working'}
            {status === 'RESOLVED' && 'Resolve'}
            {status === 'CLOSED' && 'Close'}
            {status === 'CANCELLED' && 'Cancel'}
          </Button>
        ))}
      </div>
    </div>
  )
}
