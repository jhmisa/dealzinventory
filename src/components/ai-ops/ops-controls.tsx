import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { AiOpsSettings } from '@/services/ai-ops'
import type { AiOpsAutonomy } from '@/lib/types'

const AUTONOMY_HELP: Record<AiOpsAutonomy, string> = {
  OFF: 'The agent cannot propose replies at all.',
  PROPOSE: 'The agent proposes; nothing reaches a customer without your approval here.',
  AUTO: 'The agent sends replies WITHOUT review. Only after it has earned trust.',
}

interface OpsControlsProps {
  settings: AiOpsSettings
  onToggleEnabled: (enabled: boolean) => void
  onSetAutonomy: (level: AiOpsAutonomy) => void
  busy?: boolean
}

export function OpsControls({ settings, onToggleEnabled, onSetAutonomy, busy }: OpsControlsProps) {
  const [confirmAuto, setConfirmAuto] = useState(false)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Controls</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="ai-ops-enabled"
            checked={settings.enabled}
            onCheckedChange={onToggleEnabled}
            disabled={busy}
          />
          <Label htmlFor="ai-ops-enabled" className="text-sm">
            AI Ops enabled
            <span className="block text-xs font-normal text-muted-foreground">
              Master kill-switch — off halts every agent tool instantly
            </span>
          </Label>
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-sm">
            Reply autonomy
            <span className="block text-xs font-normal text-muted-foreground">
              {AUTONOMY_HELP[settings.replyAutonomy]}
            </span>
          </Label>
          <Select
            value={settings.replyAutonomy}
            onValueChange={(v) => {
              if (v === 'AUTO') setConfirmAuto(true)
              else onSetAutonomy(v as AiOpsAutonomy)
            }}
            disabled={busy || !settings.enabled}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OFF">OFF</SelectItem>
              <SelectItem value="PROPOSE">PROPOSE</SelectItem>
              <SelectItem value="AUTO">AUTO</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>

      <AlertDialog open={confirmAuto} onOpenChange={setConfirmAuto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Enable fully autonomous replies?
            </AlertDialogTitle>
            <AlertDialogDescription>
              In AUTO mode the agent sends replies to customers WITHOUT your review. Proposals are
              still logged here, but you will be approving after the fact, not before. You can flip
              back to PROPOSE at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep PROPOSE</AlertDialogCancel>
            <AlertDialogAction onClick={() => onSetAutonomy('AUTO')}>
              Enable AUTO
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
