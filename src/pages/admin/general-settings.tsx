import { Info } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/shared'

export default function GeneralSettingsPage() {
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
    </div>
  )
}
