import { useState, useMemo } from 'react'
import { useSnapshots, useSnapshot, useSnapshotItems, useGenerateSnapshot } from '@/hooks/use-inventory-snapshots'
import { downloadSnapshotCsv } from '@/services/inventory-snapshots'
import { PageHeader, PriceDisplay, TableSkeleton } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { Download, Printer, RefreshCw, Package, DollarSign, Wrench, Calculator, Box } from 'lucide-react'
import { toast } from 'sonner'
import type { InventorySnapshotItem } from '@/services/inventory-snapshots'

type SortField = 'item_code' | 'brand' | 'total_cost' | 'purchase_price' | 'item_status'
type SortDir = 'asc' | 'desc'

export default function InventoryReportPage() {
  const { data: snapshots, isLoading: loadingSnapshots } = useSnapshots()
  const [selectedId, setSelectedId] = useState<string>('')
  const generateMutation = useGenerateSnapshot()
  const [sortField, setSortField] = useState<SortField>('item_code')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Auto-select the latest snapshot
  const activeId = selectedId || snapshots?.[0]?.id || ''

  const { data: snapshot, isLoading: loadingSnapshot } = useSnapshot(activeId)
  const { data: items, isLoading: loadingItems } = useSnapshotItems(activeId)

  const sortedItems = useMemo(() => {
    if (!items) return []
    return [...items].sort((a, b) => {
      const aVal = a[sortField] ?? ''
      const bVal = b[sortField] ?? ''
      const cmp = typeof aVal === 'number' && typeof bVal === 'number'
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [items, sortField, sortDir])

  const itemRows = useMemo(() => sortedItems.filter((i) => i.item_type === 'item'), [sortedItems])
  const accessoryRows = useMemo(() => sortedItems.filter((i) => i.item_type === 'accessory'), [sortedItems])

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function sortIndicator(field: SortField) {
    if (sortField !== field) return ''
    return sortDir === 'asc' ? ' \u2191' : ' \u2193'
  }

  async function handleGenerate() {
    try {
      await generateMutation.mutateAsync()
      toast.success('Snapshot generated successfully')
    } catch {
      toast.error('Failed to generate snapshot')
    }
  }

  function handleDownloadCsv() {
    if (!items || !snapshot) return
    downloadSnapshotCsv(items, snapshot.period_label)
    toast.success('CSV downloaded')
  }

  function handlePrint() {
    window.print()
  }

  if (loadingSnapshots) return <TableSkeleton rows={6} columns={4} />

  return (
    <>
      {/* Print-only header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-xl font-bold">Dealz K.K. — Monthly Inventory Report</h1>
        {snapshot && <p className="text-sm text-muted-foreground">{snapshot.period_label}</p>}
      </div>

      <div className="space-y-6 print:space-y-4">
        <div className="print:hidden">
          <PageHeader
            title="Inventory Report"
            actions={
              <div className="flex items-center gap-2">
                <Select value={activeId} onValueChange={setSelectedId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    {(snapshots ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.period_label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleGenerate} disabled={generateMutation.isPending} variant="outline">
                  <RefreshCw className={`h-4 w-4 mr-1 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
                  Generate Now
                </Button>
              </div>
            }
          />
        </div>

        {!activeId && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No snapshots yet. Click "Generate Now" to create the first inventory snapshot.
            </CardContent>
          </Card>
        )}

        {activeId && loadingSnapshot && <TableSkeleton rows={4} columns={4} />}

        {snapshot && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <KpiCard icon={<Package className="h-5 w-5" />} label="Total Items" value={snapshot.total_items} />
              <KpiCard icon={<DollarSign className="h-5 w-5" />} label="Purchase Cost" value={<PriceDisplay amount={snapshot.total_purchase_cost} />} />
              <KpiCard icon={<Wrench className="h-5 w-5" />} label="Additional Costs" value={<PriceDisplay amount={snapshot.total_additional_costs} />} />
              <KpiCard icon={<Calculator className="h-5 w-5" />} label="Item Value" value={<PriceDisplay amount={snapshot.total_inventory_value} />} />
              <KpiCard icon={<Box className="h-5 w-5" />} label="Grand Total" value={<PriceDisplay amount={snapshot.grand_total} className="text-primary" />} />
            </div>

            {/* Accessory Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Accessories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted">
                    <p className="text-2xl font-bold">{snapshot.total_accessory_skus}</p>
                    <p className="text-xs text-muted-foreground">SKUs</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted">
                    <p className="text-2xl font-bold">{snapshot.total_accessory_units}</p>
                    <p className="text-xs text-muted-foreground">Units</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted">
                    <p className="text-2xl font-bold font-mono tabular-nums">{formatPrice(snapshot.total_accessory_value)}</p>
                    <p className="text-xs text-muted-foreground">Value</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Breakdown Tabs */}
            <Tabs defaultValue="status" className="print:hidden">
              <TabsList>
                <TabsTrigger value="status">By Status</TabsTrigger>
                <TabsTrigger value="brand">By Brand</TabsTrigger>
                <TabsTrigger value="source">By Source</TabsTrigger>
                <TabsTrigger value="grade">By Grade</TabsTrigger>
              </TabsList>
              <TabsContent value="status">
                <BreakdownTable data={snapshot.summary_by_status} />
              </TabsContent>
              <TabsContent value="brand">
                <BreakdownTable data={snapshot.summary_by_brand} />
              </TabsContent>
              <TabsContent value="source">
                <BreakdownTable data={snapshot.summary_by_source} />
              </TabsContent>
              <TabsContent value="grade">
                <BreakdownTable data={snapshot.summary_by_grade} />
              </TabsContent>
            </Tabs>

            {/* Print-only: show all breakdowns */}
            <div className="hidden print:block space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">By Status</h3>
                  <BreakdownTable data={snapshot.summary_by_status} />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">By Brand</h3>
                  <BreakdownTable data={snapshot.summary_by_brand} />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">By Source</h3>
                  <BreakdownTable data={snapshot.summary_by_source} />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">By Grade</h3>
                  <BreakdownTable data={snapshot.summary_by_grade} />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 print:hidden">
              <Button onClick={handleDownloadCsv} variant="outline" disabled={loadingItems}>
                <Download className="h-4 w-4 mr-1" />
                Download CSV
              </Button>
              <Button onClick={handlePrint} variant="outline">
                <Printer className="h-4 w-4 mr-1" />
                Print Report
              </Button>
            </div>

            {/* Line Items Table */}
            <div className="print:break-before-page">
              {loadingItems ? (
                <TableSkeleton rows={10} columns={6} />
              ) : (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">
                      Items ({itemRows.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortableHead field="item_code" current={sortField} dir={sortDir} onSort={toggleSort}>Code</SortableHead>
                            <SortableHead field="brand" current={sortField} dir={sortDir} onSort={toggleSort}>Brand</SortableHead>
                            <TableHead>Model</TableHead>
                            <TableHead>Grade</TableHead>
                            <SortableHead field="item_status" current={sortField} dir={sortDir} onSort={toggleSort}>Status</SortableHead>
                            <TableHead>Source</TableHead>
                            <SortableHead field="purchase_price" current={sortField} dir={sortDir} onSort={toggleSort}>Purchase</SortableHead>
                            <TableHead className="text-right">Add'l Costs</TableHead>
                            <SortableHead field="total_cost" current={sortField} dir={sortDir} onSort={toggleSort}>Total</SortableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itemRows.map((item) => (
                            <ItemRow key={item.id} item={item} />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {accessoryRows.length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">
                      Accessories ({accessoryRows.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Code</TableHead>
                            <TableHead>Brand</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit Cost</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {accessoryRows.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-mono text-sm">{item.item_code}</TableCell>
                              <TableCell>{item.brand ?? '—'}</TableCell>
                              <TableCell>{item.model_name ?? '—'}</TableCell>
                              <TableCell className="text-right font-mono tabular-nums">{item.stock_quantity}</TableCell>
                              <TableCell className="text-right font-mono tabular-nums">{formatPrice(item.unit_cost)}</TableCell>
                              <TableCell className="text-right font-mono tabular-nums">{formatPrice(item.total_cost)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )
}

function BreakdownTable({ data }: { data: Record<string, { count: number; value: number }> }) {
  const entries = Object.entries(data).sort((a, b) => b[1].value - a[1].value)
  const totalCount = entries.reduce((sum, [, d]) => sum + d.count, 0)
  const totalValue = entries.reduce((sum, [, d]) => sum + d.value, 0)

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">No data</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Count</TableHead>
          <TableHead className="text-right">Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(([key, { count, value }]) => (
          <TableRow key={key}>
            <TableCell>{key}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{count}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{formatPrice(value)}</TableCell>
          </TableRow>
        ))}
        <TableRow className="font-semibold border-t-2">
          <TableCell>Total</TableCell>
          <TableCell className="text-right font-mono tabular-nums">{totalCount}</TableCell>
          <TableCell className="text-right font-mono tabular-nums">{formatPrice(totalValue)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}

function ItemRow({ item }: { item: InventorySnapshotItem }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{item.item_code}</TableCell>
      <TableCell>{item.brand ?? '—'}</TableCell>
      <TableCell className="max-w-[200px] truncate">{item.model_name ?? '—'}</TableCell>
      <TableCell>
        {item.condition_grade ? (
          <Badge variant="outline" className="text-xs">{item.condition_grade}</Badge>
        ) : '—'}
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="text-xs">{item.item_status}</Badge>
      </TableCell>
      <TableCell className="text-sm">{item.source_type ?? '—'}</TableCell>
      <TableCell className="text-right font-mono tabular-nums">{formatPrice(item.purchase_price)}</TableCell>
      <TableCell className="text-right font-mono tabular-nums">{formatPrice(item.additional_costs)}</TableCell>
      <TableCell className="text-right font-mono tabular-nums font-medium">{formatPrice(item.total_cost)}</TableCell>
    </TableRow>
  )
}

function SortableHead({
  field,
  current,
  dir,
  onSort,
  children,
}: {
  field: SortField
  current: SortField
  dir: SortDir
  onSort: (f: SortField) => void
  children: React.ReactNode
}) {
  const isActive = current === field
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground ${field === 'purchase_price' || field === 'total_cost' ? 'text-right' : ''}`}
      onClick={() => onSort(field)}
    >
      {children}
      {isActive && <span className="ml-1">{dir === 'asc' ? '\u2191' : '\u2193'}</span>}
    </TableHead>
  )
}
