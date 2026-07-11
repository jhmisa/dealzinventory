import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * The six Content Studio tabs, in left-to-right flow order.
 * Tab state is URL-driven (`?tab=`) so tabs are deep-linkable and the browser
 * back button works between them.
 */
export const STUDIO_TABS = [
  { key: 'plan', label: 'Plan' },
  { key: 'create', label: 'Create' },
  { key: 'library', label: 'Library' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'rules', label: 'Rules' },
  { key: 'posted', label: 'Posted' },
] as const

export type StudioTabKey = (typeof STUDIO_TABS)[number]['key']

const TAB_KEYS = STUDIO_TABS.map((t) => t.key) as readonly string[]

/** Read/write the active studio tab from the `?tab=` query param (defaults to `plan`). */
export function useStudioTab(): [StudioTabKey, (tab: StudioTabKey) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab = (raw && TAB_KEYS.includes(raw) ? raw : 'plan') as StudioTabKey

  const setTab = (next: StudioTabKey) => {
    const nextParams = new URLSearchParams(params)
    nextParams.set('tab', next)
    setParams(nextParams)
  }

  return [tab, setTab]
}

export function StudioTabs({ counts }: { counts?: Partial<Record<StudioTabKey, number>> }) {
  const [tab, setTab] = useStudioTab()

  return (
    <div className="border-b">
      <div className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Content Studio
      </div>
      <nav className="-mb-px flex items-center gap-1 overflow-x-auto">
        {STUDIO_TABS.map((t) => {
          const active = t.key === tab
          const count = counts?.[t.key]
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-b-2 border-primary text-foreground'
                  : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {count ? (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
