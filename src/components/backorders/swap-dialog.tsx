import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Check, Keyboard, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CodeDisplay } from '@/components/shared'
import { QRScannerCamera } from '@/components/shared/media'
import { getItemForSwap, type ItemForSwap } from '@/services/items'
import { fulfillBackorderWithItem, type ToFulfillRow } from '@/services/backorders'
import {
  verifyPCodeMatch,
  type BackorderCoreField,
  type PCodeMatchResult,
} from '@/lib/utils'

type Mode = 'manual' | 'camera'

const FIELD_LABELS: Record<BackorderCoreField, string> = {
  product_id: 'Model',
  storage_gb: 'Storage',
  color: 'Color',
  condition_grade: 'Grade',
}

function displayValue(field: BackorderCoreField, value: unknown): string {
  if (value == null || value === '') return '—'
  if (field === 'storage_gb') return `${value}`
  return String(value)
}

interface SwapDialogProps {
  row: ToFulfillRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SwapDialog({ row, open, onOpenChange }: SwapDialogProps) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>('manual')
  const [codeInput, setCodeInput] = useState('')
  const [isLooking, setIsLooking] = useState(false)
  const [item, setItem] = useState<ItemForSwap | null>(null)
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null)
  const [renderedRowId, setRenderedRowId] = useState<string | null>(null)

  const line = row?.backorder_lines ?? null

  function resetState() {
    setItem(null)
    setNotFoundCode(null)
    setCodeInput('')
    setMode('manual')
    setIsLooking(false)
  }

  // Reset scanned state whenever a new row is loaded into the dialog. This is the
  // React "adjusting state during render" pattern — comparing the incoming row id
  // against the last rendered one, which avoids a cascading-render effect.
  const currentRowId = row?.id ?? null
  if (open && currentRowId !== renderedRowId) {
    setRenderedRowId(currentRowId)
    setItem(null)
    setNotFoundCode(null)
    setCodeInput('')
    setMode('manual')
    setIsLooking(false)
  }

  // Wrap the parent handler so closing the dialog also clears scanned state.
  function handleOpenChange(next: boolean) {
    if (!next) resetState()
    onOpenChange(next)
  }

  async function resolveCode(raw: string) {
    const code = raw.trim().toUpperCase()
    if (!code) return
    setIsLooking(true)
    setItem(null)
    setNotFoundCode(null)
    try {
      const found = await getItemForSwap(code)
      if (!found) {
        setNotFoundCode(code)
      } else {
        setItem(found)
        setMode('manual')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lookup failed')
    } finally {
      setIsLooking(false)
    }
  }

  const match: PCodeMatchResult | null =
    item && line
      ? verifyPCodeMatch(
          item as unknown as Record<string, unknown>,
          line as unknown as Record<string, unknown>,
        )
      : null

  const isAvailable = item?.item_status === 'AVAILABLE'
  const canConfirm = Boolean(item && match?.ok && isAvailable)

  const swap = useMutation({
    mutationFn: () => {
      if (!row || !item) throw new Error('Missing item')
      return fulfillBackorderWithItem(row.id, item.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backorder-to-fulfill'] })
      queryClient.invalidateQueries({ queryKey: ['backorder-lines'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Backorder fulfilled')
      handleOpenChange(false)
    },
    onError: (err: unknown) => {
      // Server is authoritative — surface its message verbatim.
      toast.error(err instanceof Error ? err.message : 'Swap failed')
    },
  })

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    void resolveCode(codeInput)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Swap to P-code</DialogTitle>
          <DialogDescription>
            {line ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                Fulfill <CodeDisplay code={line.backorder_code} /> for order{' '}
                <CodeDisplay code={row?.orders?.order_code ?? '—'} /> by scanning or
                typing a real P-code.
              </span>
            ) : (
              'Scan or type a real P-code to fulfill this backorder line.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scan / type toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === 'manual' ? 'default' : 'outline'}
              onClick={() => setMode('manual')}
            >
              <Keyboard className="h-4 w-4 mr-2" />
              Type
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'camera' ? 'default' : 'outline'}
              onClick={() => setMode('camera')}
            >
              <Camera className="h-4 w-4 mr-2" />
              Scan
            </Button>
          </div>

          {mode === 'camera' ? (
            <QRScannerCamera
              containerId="swap-qr-reader"
              onScan={(c) => void resolveCode(c)}
              onError={() => setMode('manual')}
            />
          ) : (
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <Input
                placeholder="e.g. P000417"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                className="font-mono"
                autoFocus
              />
              <Button type="submit" disabled={isLooking || !codeInput.trim()}>
                {isLooking ? 'Looking up...' : 'Resolve'}
              </Button>
            </form>
          )}

          {notFoundCode && (
            <p className="text-sm text-destructive">
              No item {notFoundCode} found.
            </p>
          )}

          {item && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <CodeDisplay code={item.item_code} />
                {!isAvailable && (
                  <span className="text-xs font-medium text-destructive">
                    Not AVAILABLE ({item.item_status})
                  </span>
                )}
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Field</th>
                    <th className="py-1.5 px-2 font-medium">Item</th>
                    <th className="py-1.5 px-2 font-medium">Backorder</th>
                    <th className="py-1.5 pl-2 font-medium text-center">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {match?.fields.map((f) => (
                    <tr key={f.field} className="border-b last:border-0">
                      <td className="py-1.5 pr-2 font-medium">
                        {FIELD_LABELS[f.field]}
                      </td>
                      <td className="py-1.5 px-2 font-mono text-xs">
                        {displayValue(f.field, f.itemValue)}
                      </td>
                      <td className="py-1.5 px-2 font-mono text-xs">
                        {displayValue(f.field, f.lineValue)}
                      </td>
                      <td className="py-1.5 pl-2 text-center">
                        {f.match ? (
                          <Check className="inline h-4 w-4 text-green-600" />
                        ) : (
                          <X className="inline h-4 w-4 text-destructive" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {match && !match.ok && (
                <p className="text-xs text-destructive">
                  Spec mismatch — this P-code does not match the backorder line.
                </p>
              )}
              {match?.ok && !isAvailable && (
                <p className="text-xs text-destructive">
                  Item spec matches but it is not AVAILABLE, so it cannot be used.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={swap.isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => swap.mutate()} disabled={!canConfirm || swap.isPending}>
            {swap.isPending ? 'Confirming...' : 'Confirm swap'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
