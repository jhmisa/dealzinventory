import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CodeDisplay } from '@/components/shared'
import { ImageGallery } from '@/components/shared/media'
import type { GalleryImage } from '@/components/shared/media'
import { useKaitoriRequestByCode, useSellerAcceptRevision } from '@/hooks/use-kaitori'
import { getKaitoriStatusConfig, BATTERY_CONDITIONS, SCREEN_CONDITIONS, BODY_CONDITIONS, KAITORI_DELIVERY_METHODS } from '@/lib/constants'
import { formatPrice, formatDateTime, cn } from '@/lib/utils'
import type { KaitoriStatus } from '@/lib/types'
import { toast } from 'sonner'

const STATUS_FLOW: KaitoriStatus[] = [
  'QUOTED', 'ACCEPTED', 'SHIPPED', 'RECEIVED', 'INSPECTING', 'APPROVED', 'PAID',
]

export default function KaitoriStatusPage() {
  const [code, setCode] = useState('')
  const [searchCode, setSearchCode] = useState('')
  const { data: kt, isLoading, isError } = useKaitoriRequestByCode(searchCode)
  const acceptMutation = useSellerAcceptRevision()

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (code.trim()) setSearchCode(code.trim().toUpperCase())
  }

  function handleAcceptRevision(accepted: boolean) {
    if (!kt) return
    acceptMutation.mutate({ id: kt.id, accepted }, {
      onSuccess: () => toast.success(accepted ? 'Revision accepted' : 'Revision rejected'),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Track Your Kaitori Request</h1>
        <p className="text-muted-foreground">Enter your KT-code to check the status of your request.</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 max-w-md mx-auto">
        <Input
          placeholder="e.g. KT000001"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="font-mono"
        />
        <Button type="submit" disabled={!code.trim()}>
          <Search className="h-4 w-4 mr-2" />
          Track
        </Button>
      </form>

      {isLoading && searchCode && (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      )}

      {isError && searchCode && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Request not found. Check the code and try again.</p>
        </div>
      )}

      {kt && (() => {
        const status = kt.request_status as KaitoriStatus
        const statusCfg = getKaitoriStatusConfig(status)
        const currentIdx = STATUS_FLOW.indexOf(status)
        const pm = kt.product_models as { brand: string; model_name: string } | null
        const media = (kt.kaitori_request_media as { id: string; file_url: string; role: string; sort_order: number }[] ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)

        return (
          <div className="space-y-6">
            {/* Status Stepper */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-center gap-1 flex-wrap">
                  {STATUS_FLOW.map((step, i) => {
                    const cfg = getKaitoriStatusConfig(step)
                    const isActive = step === status
                    const isDone = currentIdx >= 0 && i < currentIdx
                    return (
                      <div key={step} className="flex items-center">
                        <div className={cn(
                          'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border whitespace-nowrap',
                          isActive ? cfg.color : isDone ? 'bg-green-50 text-green-700 border-green-300' : 'bg-muted text-muted-foreground border-transparent',
                        )}>
                          {isDone && <CheckCircle2 className="h-3 w-3" />}
                          {cfg.label}
                        </div>
                        {i < STATUS_FLOW.length - 1 && (
                          <div className={cn('w-3 h-0.5 mx-0.5', isDone ? 'bg-green-400' : 'bg-muted')} />
                        )}
                      </div>
                    )
                  })}
                  {(status === 'CANCELLED' || status === 'REJECTED' || status === 'PRICE_REVISED') && (
                    <Badge variant="outline" className={cn('ml-2', statusCfg.color)}>{statusCfg.label}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Price Revision Alert */}
            {status === 'PRICE_REVISED' && kt.seller_accepted_revision == null && (
              <Card className="border-orange-300 bg-orange-50">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold">Price Revision</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        After inspection, we've revised the price to <span className="font-bold">{formatPrice(kt.final_price ?? 0)}</span>
                        {' '}(original: {formatPrice(kt.auto_quote_price)}).
                      </p>
                      {kt.revision_reason && (
                        <p className="text-sm mt-1"><strong>Reason:</strong> {kt.revision_reason}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-8">
                    <Button size="sm" onClick={() => handleAcceptRevision(true)} disabled={acceptMutation.isPending}>
                      Accept New Price
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleAcceptRevision(false)} disabled={acceptMutation.isPending}>
                      Reject & Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Request Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Code</span><CodeDisplay code={kt.kaitori_code} /></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Device</span><span>{pm ? `${pm.brand} ${pm.model_name}` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{KAITORI_DELIVERY_METHODS.find(d => d.value === kt.delivery_method)?.label ?? kt.delivery_method}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Submitted</span><span>{formatDateTime(kt.created_at)}</span></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pricing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Quote</span><span className="font-bold">{formatPrice(kt.auto_quote_price)}</span></div>
                  {kt.final_price != null && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Final</span><span className="font-bold text-primary">{formatPrice(kt.final_price)}</span></div>
                  )}
                  {kt.paid_at && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="text-green-600">{formatDateTime(kt.paid_at)}</span></div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Your Assessment */}
            <Card>
              <CardHeader>
                <CardTitle>Your Assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="text-muted-foreground block">Battery</span>{BATTERY_CONDITIONS.find(b => b.value === kt.battery_condition)?.label ?? kt.battery_condition}</div>
                  <div><span className="text-muted-foreground block">Screen</span>{SCREEN_CONDITIONS.find(s => s.value === kt.screen_condition)?.label ?? kt.screen_condition}</div>
                  <div><span className="text-muted-foreground block">Body</span>{BODY_CONDITIONS.find(b => b.value === kt.body_condition)?.label ?? kt.body_condition}</div>
                </div>
              </CardContent>
            </Card>

            {media.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Photos</CardTitle>
                </CardHeader>
                <CardContent>
                  <ImageGallery
                    images={media.map((m): GalleryImage => ({ id: m.id, url: m.file_url, alt: m.role }))}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        )
      })()}

      {!searchCode && (
        <div className="text-center pt-4">
          <p className="text-sm text-muted-foreground">
            Don't have a request yet?{' '}
            <Link to="/sell/assess" className="text-primary hover:underline">Start a new assessment</Link>
          </p>
        </div>
      )}
    </div>
  )
}
