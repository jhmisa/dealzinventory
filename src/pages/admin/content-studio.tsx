import { lazy, Suspense, useState } from 'react'
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
const ReviewCardMaker = lazy(() =>
  import('@/components/content-studio/create/review-card-maker').then((m) => ({ default: m.ReviewCardMaker })),
)
const CarouselBuilder = lazy(() =>
  import('@/components/content-studio/create/carousel-builder').then((m) => ({ default: m.CarouselBuilder })),
)

type MakerModal = 'review' | 'carousel' | null

const CREATE_MAKERS = [
  {
    key: 'product-video',
    title: 'Record product video',
    desc: 'Film items from a shoot — product square over live camera.',
    icon: Video,
    to: '/admin/video-editor' as const,
    modal: null as MakerModal,
  },
  {
    key: 'review-card',
    title: 'Make review card',
    desc: 'Turn a customer review into a branded quote card.',
    icon: MessageSquareQuote,
    to: null,
    modal: 'review' as MakerModal,
  },
  {
    key: 'carousel',
    title: 'Build carousel',
    desc: 'Ordered slides for a multi-image post — from uploads or product photos with specs + price baked in.',
    icon: LayoutGrid,
    to: null,
    modal: 'carousel' as MakerModal,
  },
  {
    key: 'talking-head',
    title: 'Record talking-head',
    desc: 'Presenter with an image + corner layout. (Phase 3b)',
    icon: UserSquare2,
    to: null,
    modal: null as MakerModal,
    disabled: true,
  },
] as const

function CreateHub() {
  const [modal, setModal] = useState<MakerModal>(null)
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Create</h2>
        <p className="text-sm text-muted-foreground">Make a new piece of content — it lands in your Library.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CREATE_MAKERS.map((maker) => {
          const Icon = maker.icon
          const disabled = 'disabled' in maker && maker.disabled
          const inner = (
            <Card className={disabled ? 'h-full opacity-60' : 'h-full transition-colors hover:border-primary'}>
              <CardContent className="flex h-full flex-col gap-2 p-4">
                <Icon className="h-6 w-6 text-primary" />
                <div className="font-medium">{maker.title}</div>
                <div className="text-sm text-muted-foreground">{maker.desc}</div>
              </CardContent>
            </Card>
          )
          if (disabled) return <div key={maker.key} className="cursor-not-allowed">{inner}</div>
          if (maker.to) return <Link key={maker.key} to={maker.to} className="block">{inner}</Link>
          return (
            <button key={maker.key} type="button" onClick={() => setModal(maker.modal)} className="block text-left">
              {inner}
            </button>
          )
        })}
      </div>

      <Suspense fallback={null}>
        {modal === 'review' && <ReviewCardMaker open onOpenChange={(o) => !o && setModal(null)} />}
        {modal === 'carousel' && <CarouselBuilder open onOpenChange={(o) => !o && setModal(null)} />}
      </Suspense>
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
