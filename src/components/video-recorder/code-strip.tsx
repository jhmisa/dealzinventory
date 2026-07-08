import { cn } from '@/lib/utils'

interface CodeStripProps {
  codes: string[]
  activeIndex: number
  titles: Record<string, string>
}

/** The preselected item codes as chips; the active item is highlighted. */
export function CodeStrip({ codes, activeIndex, titles }: CodeStripProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {codes.map((code, i) => (
        <div
          key={code}
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
            i === activeIndex
              ? 'border-primary bg-primary/15 text-foreground'
              : i < activeIndex
                ? 'border-border bg-muted/40 text-muted-foreground line-through'
                : 'border-border text-muted-foreground',
          )}
        >
          <span className="font-mono">{code}</span>
          {titles[code] && <span className="max-w-[120px] truncate">{titles[code]}</span>}
        </div>
      ))}
    </div>
  )
}
