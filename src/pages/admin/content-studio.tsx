import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { Video, UserSquare2, LayoutGrid, MessageSquareQuote } from 'lucide-react'
import { StudioTabs, useStudioTab } from '@/components/content-studio'
import { RouteLoading } from '@/components/layout/route-loading'
import { Card, CardContent } from '@/components/ui/card'

// Plan and Posted tabs reuse existing full pages; lazy-load so they stay in
// their own bundles rather than bloating the studio shell.
const ShootsPage = lazy(() => import('@/pages/admin/shoots'))
const SocialMediaPage = lazy(() => import('@/pages/admin/social-media'))
const LibraryTab = lazy(() =>
  import('@/components/content-studio/library/library-tab').then((m) => ({ default: m.LibraryTab })),
)
const CalendarTab = lazy(() =>
  import('@/components/content-studio/calendar/calendar-tab').then((m) => ({ default: m.CalendarTab })),
)
const RulesTab = lazy(() =>
  import('@/components/content-studio/rules/rules-tab').then((m) => ({ default: m.RulesTab })),
)

const CREATE_MAKERS = [
  {
    key: 'product-video',
    title: 'Record product video',
    desc: 'Film items from a shoot — product square over live camera.',
    icon: Video,
    to: '/admin/video-editor',
    enabled: true,
  },
  {
    key: 'talking-head',
    title: 'Record talking-head',
    desc: 'Presenter with an image + corner layout. (Phase 3)',
    icon: UserSquare2,
    to: '/admin/video-editor',
    enabled: false,
  },
  {
    key: 'carousel',
    title: 'Build carousel',
    desc: 'Ordered slides for a multi-image post. (Phase 4)',
    icon: LayoutGrid,
    to: '#',
    enabled: false,
  },
  {
    key: 'review-card',
    title: 'Make review card',
    desc: 'Turn a customer review into a branded quote card. (Phase 4)',
    icon: MessageSquareQuote,
    to: '#',
    enabled: false,
  },
] as const

function CreateHub() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Create</h2>
        <p className="text-sm text-muted-foreground">Make a new piece of content. Video makers hand off to the editor.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CREATE_MAKERS.map((maker) => {
          const Icon = maker.icon
          const inner = (
            <Card className={maker.enabled ? 'h-full transition-colors hover:border-primary' : 'h-full opacity-60'}>
              <CardContent className="flex h-full flex-col gap-2 p-4">
                <Icon className="h-6 w-6 text-primary" />
                <div className="font-medium">{maker.title}</div>
                <div className="text-sm text-muted-foreground">{maker.desc}</div>
              </CardContent>
            </Card>
          )
          return maker.enabled ? (
            <Link key={maker.key} to={maker.to} className="block">
              {inner}
            </Link>
          ) : (
            <div key={maker.key} className="cursor-not-allowed">
              {inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ContentStudioPage() {
  const [tab] = useStudioTab()

  return (
    <div className="flex h-full flex-col gap-4">
      <StudioTabs />
      <div className="min-h-0 flex-1">
        <Suspense fallback={<RouteLoading />}>
          {tab === 'plan' && <ShootsPage />}
          {tab === 'create' && <CreateHub />}
          {tab === 'library' && <LibraryTab />}
          {tab === 'calendar' && <CalendarTab />}
          {tab === 'rules' && <RulesTab />}
          {tab === 'posted' && <SocialMediaPage />}
        </Suspense>
      </div>
    </div>
  )
}
