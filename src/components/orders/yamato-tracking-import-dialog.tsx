import { useState, useCallback } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { parseYamatoTrackingCsv, type YamatoTrackingRow } from '@/lib/yamato-import'
import { useBulkApplyTracking } from '@/hooks/use-orders'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type MatchStatus = 'matched' | 'already-applied' | 'different-tracking' | 'not-found' | 'cancelled'

interface PreviewRow extends YamatoTrackingRow {
  currentStatus: string | null
  currentTracking: string | null
  matchStatus: MatchStatus
}

type Phase = 'upload' | 'preview' | 'result'

export function YamatoTrackingImportDialog({ open, onOpenChange }: Props) {
  const [phase, setPhase] = useState<Phase>('upload')
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [parseErrors, setParseErrors] = useState<{ row: number; message: string }[]>([])
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [result, setResult] = useState<{ updated: string[]; skipped: { orderCode: string; reason: string }[] } | null>(null)

  const bulkApply = useBulkApplyTracking()

  const reset = useCallback(() => {
    setPhase('upload')
    setPreviewRows([])
    setParseErrors([])
    setAutoAdvance(true)
    setResult(null)
  }, [])

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!v) reset()
      onOpenChange(v)
    },
    [onOpenChange, reset],
  )

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const buffer = await file.arrayBuffer()
      const { rows, errors } = parseYamatoTrackingCsv(buffer)
      setParseErrors(errors)

      if (rows.length === 0) {
        toast.error('No valid tracking rows found in CSV')
        return
      }

      // Fetch matching orders from DB
      const orderCodes = rows.map((r) => r.orderCode).filter((c): c is string => !!c)
      const { data: orders } = await supabase
        .from('orders')
        .select('order_code, order_status, tracking_number')
        .in('order_code', orderCodes)

      const orderMap = new Map(
        (orders ?? []).map((o) => [o.order_code, o]),
      )

      const preview: PreviewRow[] = rows.map((row) => {
        const order = row.orderCode ? orderMap.get(row.orderCode) : null
        let matchStatus: MatchStatus = 'not-found'
        if (!order) {
          matchStatus = 'not-found'
        } else if (order.order_status === 'CANCELLED' || order.order_status === 'DELIVERED') {
          matchStatus = 'cancelled'
        } else if (order.tracking_number === row.trackingNumber) {
          matchStatus = 'already-applied'
        } else if (order.tracking_number && order.tracking_number !== row.trackingNumber) {
          matchStatus = 'different-tracking'
        } else {
          matchStatus = 'matched'
        }

        return {
          ...row,
          currentStatus: order?.order_status ?? null,
          currentTracking: order?.tracking_number ?? null,
          matchStatus,
        }
      })

      setPreviewRows(preview)
      setPhase('preview')
    } catch (err) {
      toast.error(`Failed to parse CSV: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }

    // Reset file input so the same file can be re-selected
    e.target.value = ''
  }, [])

  const applicableRows = previewRows.filter(
    (r) => r.matchStatus === 'matched' || r.matchStatus === 'different-tracking',
  )

  const handleApply = useCallback(async () => {
    const updates = applicableRows.map((r) => ({
      orderCode: r.orderCode!,
      trackingNumber: r.trackingNumber,
    }))

    try {
      const res = await bulkApply.mutateAsync({ updates, autoAdvance })
      setResult(res)
      setPhase('result')
      toast.success(`Updated ${res.updated.length} order(s)`)
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [applicableRows, autoAdvance, bulkApply])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Yamato Tracking Numbers</DialogTitle>
          <DialogDescription>
            Upload the CSV downloaded from Yamato to bulk-apply tracking numbers.
          </DialogDescription>
        </DialogHeader>

        {/* Phase 1: Upload */}
        {phase === 'upload' && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Select the CSV file downloaded from Yamato</p>
            <label>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button asChild variant="outline">
                <span>Select CSV File</span>
              </Button>
            </label>
          </div>
        )}

        {/* Phase 2: Preview */}
        {phase === 'preview' && (
          <>
            <div className="flex items-center gap-4 text-sm">
              <span>
                <strong>{previewRows.length}</strong> rows parsed
              </span>
              <span className="text-green-600">
                {previewRows.filter((r) => r.matchStatus === 'matched').length} ready
              </span>
              {previewRows.some((r) => r.matchStatus === 'different-tracking') && (
                <span className="text-yellow-600">
                  {previewRows.filter((r) => r.matchStatus === 'different-tracking').length} will overwrite
                </span>
              )}
              {previewRows.some((r) => r.matchStatus === 'already-applied') && (
                <span className="text-muted-foreground">
                  {previewRows.filter((r) => r.matchStatus === 'already-applied').length} already applied
                </span>
              )}
              {previewRows.some((r) => r.matchStatus === 'not-found' || r.matchStatus === 'cancelled') && (
                <span className="text-red-600">
                  {previewRows.filter((r) => r.matchStatus === 'not-found' || r.matchStatus === 'cancelled').length} skipped
                </span>
              )}
            </div>

            {parseErrors.length > 0 && (
              <div className="text-xs text-yellow-600 bg-yellow-50 rounded p-2 max-h-16 overflow-y-auto">
                {parseErrors.map((e, i) => (
                  <div key={i}>Row {e.row}: {e.message}</div>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Order</th>
                    <th className="text-left px-3 py-2 font-medium">Tracking #</th>
                    <th className="text-left px-3 py-2 font-medium">P-Code</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-center px-3 py-2 font-medium w-10">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr
                      key={i}
                      className={cn(
                        'border-t',
                        row.matchStatus === 'not-found' || row.matchStatus === 'cancelled'
                          ? 'bg-red-50/50'
                          : row.matchStatus === 'different-tracking'
                            ? 'bg-yellow-50/50'
                            : row.matchStatus === 'already-applied'
                              ? 'bg-muted/30'
                              : '',
                      )}
                    >
                      <td className="px-3 py-1.5 font-mono">{row.orderCode}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{row.trackingNumber}</td>
                      <td className="px-3 py-1.5 font-mono">{row.pCode ?? '—'}</td>
                      <td className="px-3 py-1.5">{row.currentStatus ?? '—'}</td>
                      <td className="px-3 py-1.5 text-center">
                        {row.matchStatus === 'matched' && (
                          <CheckCircle2 className="h-4 w-4 text-green-600 inline" />
                        )}
                        {row.matchStatus === 'already-applied' && (
                          <CheckCircle2 className="h-4 w-4 text-muted-foreground inline" />
                        )}
                        {row.matchStatus === 'different-tracking' && (
                          <AlertTriangle className="h-4 w-4 text-yellow-600 inline" />
                        )}
                        {(row.matchStatus === 'not-found' || row.matchStatus === 'cancelled') && (
                          <XCircle className="h-4 w-4 text-red-500 inline" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="auto-advance"
                checked={autoAdvance}
                onCheckedChange={(v) => setAutoAdvance(v === true)}
              />
              <Label htmlFor="auto-advance" className="text-sm">
                Auto-advance matched orders to SHIPPED
              </Label>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={applicableRows.length === 0 || bulkApply.isPending}
                onClick={handleApply}
              >
                {bulkApply.isPending ? 'Applying...' : `Apply ${applicableRows.length} Tracking Numbers`}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Phase 3: Result */}
        {phase === 'result' && result && (
          <>
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">{result.updated.length} order(s) updated</span>
              </div>
              {result.skipped.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Skipped ({result.skipped.length}):
                  </p>
                  <div className="text-xs space-y-0.5 max-h-40 overflow-y-auto">
                    {result.skipped.map((s, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="font-mono">{s.orderCode}</span>
                        <span className="text-muted-foreground">{s.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
