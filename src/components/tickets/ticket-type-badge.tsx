import { Badge } from '@/components/ui/badge'
import {
  RotateCcw,
  PackageSearch,
  Truck,
  AlertTriangle,
  HelpCircle,
  Circle,
} from 'lucide-react'
import type { TicketType } from '@/services/tickets'

const ICON_MAP: Record<string, typeof Circle> = {
  'rotate-ccw': RotateCcw,
  'package-search': PackageSearch,
  'truck': Truck,
  'alert-triangle': AlertTriangle,
  'help-circle': HelpCircle,
}

const TYPE_COLORS: Record<string, string> = {
  RETURN: 'bg-orange-100 text-orange-800 border-orange-300',
  STOCK_REQUEST: 'bg-blue-100 text-blue-800 border-blue-300',
  DELIVERY: 'bg-cyan-100 text-cyan-800 border-cyan-300',
  COMPLAINT: 'bg-red-100 text-red-800 border-red-300',
  GENERAL: 'bg-gray-100 text-gray-800 border-gray-300',
}

interface TicketTypeBadgeProps {
  ticketType: Pick<TicketType, 'name' | 'label' | 'icon'> | null | undefined
  className?: string
}

export function TicketTypeBadge({ ticketType, className }: TicketTypeBadgeProps) {
  if (!ticketType) return null

  const Icon = ICON_MAP[ticketType.icon] ?? Circle
  const color = TYPE_COLORS[ticketType.name] ?? 'bg-gray-100 text-gray-800 border-gray-300'

  return (
    <Badge variant="outline" className={`font-medium gap-1 ${color} ${className ?? ''}`}>
      <Icon className="h-3 w-3" />
      {ticketType.label}
    </Badge>
  )
}
