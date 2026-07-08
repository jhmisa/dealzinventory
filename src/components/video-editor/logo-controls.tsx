import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LogoConfig, LogoCorner } from '@/lib/video-editor/logo'

interface LogoControlsProps {
  value: LogoConfig
  onChange: (c: LogoConfig) => void
}

const CORNERS: { key: LogoCorner; label: string }[] = [
  { key: 'tl', label: '↖' },
  { key: 'tr', label: '↗' },
  { key: 'bl', label: '↙' },
  { key: 'br', label: '↘' },
]

export function LogoControls({ value, onChange }: LogoControlsProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Switch
          id="logo-toggle"
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
        <label htmlFor="logo-toggle" className="cursor-pointer text-sm text-foreground">
          Logo
        </label>
      </div>
      <div className={cn('grid grid-cols-2 gap-1', !value.enabled && 'pointer-events-none opacity-40')}>
        {CORNERS.map((c) => (
          <Button
            key={c.key}
            type="button"
            size="icon"
            variant={value.corner === c.key ? 'default' : 'outline'}
            className="h-6 w-6 text-xs"
            aria-label={`Logo ${c.key}`}
            onClick={() => onChange({ ...value, corner: c.key })}
          >
            {c.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
