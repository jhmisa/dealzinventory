import { useState, useRef } from 'react'
import { Trash2, Upload, Loader2, ExternalLink, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePaymentConfirmations, useCreatePaymentConfirmation, useDeletePaymentConfirmation } from '@/hooks/use-payment-confirmations'
import { uploadPaymentProof, getPaymentProofSignedUrl } from '@/services/payment-confirmations'
import { formatPrice, formatDateTime } from '@/lib/utils'

interface PaymentConfirmationSectionProps {
  orderId: string
  orderTotal: number
}

export function PaymentConfirmationSection({ orderId, orderTotal }: PaymentConfirmationSectionProps) {
  const { data: confirmations = [], isLoading, error: loadError } = usePaymentConfirmations(orderId)
  const createMutation = useCreatePaymentConfirmation()
  const deleteMutation = useDeletePaymentConfirmation()

  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const confirmedTotal = confirmations.reduce((sum, c) => sum + c.amount, 0)
  const isFullyPaid = confirmedTotal >= orderTotal

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      toast.error('Please select a screenshot')
      return
    }
    const amountNum = parseInt(amount)
    if (!amountNum || amountNum <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    setUploading(true)
    try {
      const screenshotUrl = await uploadPaymentProof(orderId, file)
      await createMutation.mutateAsync({
        orderId,
        amount: amountNum,
        screenshotUrl,
        notes: notes || undefined,
      })
      toast.success('Payment confirmation added')
      setAmount('')
      setNotes('')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add confirmation')
    } finally {
      setUploading(false)
    }
  }

  async function handleViewScreenshot(path: string) {
    try {
      const url = await getPaymentProofSignedUrl(path)
      window.open(url, '_blank')
    } catch {
      toast.error('Failed to load screenshot')
    }
  }

  function handleDelete(id: string, screenshotUrl: string) {
    deleteMutation.mutate(
      { id, screenshotUrl, orderId },
      {
        onSuccess: () => toast.success('Confirmation deleted'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete'),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Payment Confirmation
          </CardTitle>
          <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
            isFullyPaid
              ? 'bg-green-100 text-green-800'
              : confirmedTotal > 0
                ? 'bg-amber-100 text-amber-800'
                : 'bg-gray-100 text-gray-600'
          }`}>
            {formatPrice(confirmedTotal)} / {formatPrice(orderTotal)}
            {isFullyPaid ? ' — Fully Paid' : confirmedTotal > 0 ? ' — Partial' : ''}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing confirmations */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : loadError ? (
          <p className="text-sm text-destructive">
            Failed to load confirmations: {loadError instanceof Error ? loadError.message : 'Unknown error'}
          </p>
        ) : confirmations.length > 0 ? (
          <div className="space-y-2">
            {confirmations.map((c) => {
              const staff = (c as Record<string, unknown>).staff_profiles as { display_name: string } | null
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      className="shrink-0 w-10 h-10 rounded border bg-muted flex items-center justify-center hover:bg-accent transition-colors"
                      onClick={() => handleViewScreenshot(c.screenshot_url)}
                      title="View screenshot"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <div className="min-w-0">
                      <p className="font-medium">{formatPrice(c.amount)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {staff?.display_name ?? 'Staff'} · {formatDateTime(c.created_at)}
                        {c.notes && ` · ${c.notes}`}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(c.id, c.screenshot_url)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No payment confirmations yet.</p>
        )}

        {/* Add form */}
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 pt-2 border-t">
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-muted-foreground mb-1 block">Amount (¥)</label>
            <Input
              type="number"
              min={1}
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-muted-foreground mb-1 block">Screenshot</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border file:border-input file:bg-background file:text-sm file:font-medium hover:file:bg-accent h-9"
            />
          </div>
          <div className="flex-1 min-w-[100px]">
            <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
            <Input
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-9"
            />
          </div>
          <Button type="submit" size="sm" disabled={uploading || !file || !amount} className="h-9">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
