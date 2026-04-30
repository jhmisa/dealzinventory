import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, Image, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CodeDisplay, GradeBadge, StatusBadge, PriceDisplay } from '@/components/shared'
import { formatDate, formatCustomerName } from '@/lib/utils'
import type { SellGroupByCode } from '@/services/sell-groups'
import type { ConditionGrade } from '@/lib/types'

interface SellGroupResultBlockProps {
  sellGroup: SellGroupByCode
  onShowcase: (code: string, mode: 'photos' | 'videos') => void
  showLiveSellingToggle?: boolean
  onToggleLiveSelling?: (sellGroupId: string, value: boolean) => void
  recentlyOrderedItemIds?: Set<string>
}

export function SellGroupResultBlock({ sellGroup, onShowcase, showLiveSellingToggle, onToggleLiveSelling, recentlyOrderedItemIds }: SellGroupResultBlockProps) {
  const [expanded, setExpanded] = useState(true)
  const navigate = useNavigate()

  const pm = sellGroup.product_models as Record<string, unknown> | null
  const productMedia = (pm?.product_media ?? []) as Array<{ file_url: string; sort_order: number }>
  const thumbnail = productMedia.sort((a, b) => a.sort_order - b.sort_order)[0]?.file_url

  // Build description
  let description = ''
  if (pm) {
    description = (pm.short_description as string) || ''
    if (!description) {
      const parts = [pm.brand, pm.model_name, pm.cpu, pm.ram_gb, pm.storage_gb, pm.screen_size ? `${pm.screen_size}"` : null, pm.color].filter(Boolean)
      description = parts.join(' / ')
    }
  }

  const items = sellGroup.sell_group_items
    .map((sgi) => sgi.items)
    .filter(Boolean) as Array<{
      id: string
      item_code: string
      condition_grade: string | null
      item_status: string
      selling_price: number | null
      purchase_price: number | null
      discount: number | null
      created_at: string
      suppliers: { supplier_name: string } | null
      product_models: Record<string, unknown> | null
      order_items: Array<{
        orders: {
          id: string
          order_code: string
          order_status: string
          customers: { id: string; customer_code: string; first_name: string | null; last_name: string } | null
        } | null
      }>
    }>

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Collapsed header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {showLiveSellingToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={!!(sellGroup as Record<string, unknown>).is_live_selling}
              onCheckedChange={(checked) => {
                onToggleLiveSelling?.(sellGroup.id, !!checked)
              }}
            />
          </div>
        )}

        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        {thumbnail ? (
          <img
            src={thumbnail}
            alt={sellGroup.sell_group_code}
            className="h-10 w-10 rounded border bg-muted shrink-0 object-cover"
          />
        ) : (
          <div className="h-10 w-10 rounded border bg-muted shrink-0 flex items-center justify-center text-muted-foreground text-xs">
            —
          </div>
        )}

        <CodeDisplay code={sellGroup.sell_group_code} />
        <GradeBadge grade={sellGroup.condition_grade as ConditionGrade} />

        <span className="text-sm text-muted-foreground truncate min-w-0">
          {description}
        </span>

        <PriceDisplay amount={sellGroup.base_price} />

        <Badge variant="secondary" className="shrink-0">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </Badge>

        <div className="flex items-center gap-1 ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Showcase Photos"
            onClick={() => onShowcase(sellGroup.sell_group_code, 'photos')}
          >
            <Image className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Showcase Videos"
            onClick={() => onShowcase(sellGroup.sell_group_code, 'videos')}
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded sub-table */}
      {expanded && items.length > 0 && (
        <div className="border-t">
          <div className="pl-10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>P-code</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Buy</TableHead>
                  <TableHead className="text-right">Sell</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead>Sold To</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const order = item.order_items?.[0]?.orders
                  const customer = order?.customers
                  const customerName = customer
                    ? formatCustomerName(customer)
                    : null

                  return (
                    <TableRow
                      key={item.id}
                      className={`cursor-pointer hover:bg-muted/50 ${recentlyOrderedItemIds?.has(item.id) ? 'animate-[highlight-green_3s_ease-out]' : ''}`}
                      onClick={() => navigate(`/admin/items/${item.id}`)}
                    >
                      <TableCell>
                        <CodeDisplay code={item.item_code} />
                      </TableCell>
                      <TableCell>
                        <GradeBadge grade={item.condition_grade as ConditionGrade} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.item_status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.suppliers?.supplier_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <PriceDisplay amount={item.purchase_price} />
                      </TableCell>
                      <TableCell className="text-right">
                        <PriceDisplay amount={item.selling_price} />
                      </TableCell>
                      <TableCell className="text-right">
                        {item.discount != null ? (
                          <span className="text-red-600 font-mono tabular-nums">-{item.discount}%</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {order ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm">{customerName ?? '—'}</span>
                            <CodeDisplay code={order.order_code} className="text-xs" />
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(item.created_at)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {expanded && items.length === 0 && (
        <div className="border-t px-10 py-6 text-center text-muted-foreground text-sm">
          No items assigned to this sell group
        </div>
      )}
    </div>
  )
}
