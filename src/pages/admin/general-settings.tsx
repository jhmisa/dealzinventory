import { useState, useEffect } from 'react'
import { Info, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/shared'
import { useSystemSetting, useUpdateSystemSetting } from '@/hooks/use-settings'

export default function GeneralSettingsPage() {
  const { data: surchargeValue, isLoading } = useSystemSetting('credit_card_surcharge_pct')
  const updateSetting = useUpdateSystemSetting()
  const [surcharge, setSurcharge] = useState('')

  useEffect(() => {
    if (surchargeValue !== undefined && surchargeValue !== null) {
      setSurcharge(surchargeValue)
    }
  }, [surchargeValue])

  const handleSaveSurcharge = () => {
    const num = parseFloat(surcharge)
    if (isNaN(num) || num < 0 || num > 100) {
      toast.error('Surcharge must be between 0 and 100')
      return
    }
    updateSetting.mutate(
      { key: 'credit_card_surcharge_pct', value: surcharge },
      {
        onSuccess: () => toast.success('Surcharge updated'),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="General Settings" />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-muted-foreground" />
            <CardTitle>JOA Consumption Tax Rate</CardTitle>
          </div>
          <CardDescription>
            Controls the tax rate applied when parsing JOA auction invoices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-4 space-y-3 text-sm">
            <div className="grid grid-cols-[160px_1fr] gap-y-2">
              <span className="font-medium text-muted-foreground">Environment Variable</span>
              <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">JOA_TAX_RATE</code>

              <span className="font-medium text-muted-foreground">Default Value</span>
              <span>
                <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">0.10</code>{' '}
                (10%)
              </span>

              <span className="font-medium text-muted-foreground">Format</span>
              <span>
                Decimal rate — e.g.{' '}
                <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">0.08</code> for
                8%
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">How to change</p>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
              <li>Open the Supabase Dashboard</li>
              <li>
                Go to <span className="font-medium text-foreground">Project Settings → Edge Functions → Environment Variables</span>
              </li>
              <li>
                Set <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">JOA_TAX_RATE</code> to the desired decimal rate
              </li>
              <li>Save — changes take effect on the next edge function invocation (no redeploy needed)</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Credit Card Surcharge</CardTitle>
          </div>
          <CardDescription>
            Percentage added as a line item to orders paid by credit card via Cash on Delivery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.1}
              className="w-24"
              value={surcharge}
              onChange={(e) => setSurcharge(e.target.value)}
              disabled={isLoading}
            />
            <span className="text-sm text-muted-foreground">%</span>
            <Button size="sm" onClick={handleSaveSurcharge} disabled={updateSetting.isPending}>
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Currently: {surchargeValue ?? '4'}%. Applied when payment method is Credit Card.
            This adds a visible "Credit Card Fee" line item to the order.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
