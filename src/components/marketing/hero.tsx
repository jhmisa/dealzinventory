import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ShoppingBag,
  ChevronUp,
  ChevronDown,
  Laptop,
  Smartphone,
  Tablet,
  type LucideIcon,
} from 'lucide-react'

const CATEGORIES: { icon: LucideIcon; label: string }[] = [
  { icon: Laptop, label: 'Laptops' },
  { icon: Smartphone, label: 'Phones' },
  { icon: Tablet, label: 'Tablets' },
]

export function Hero() {
  const [active, setActive] = useState(1)

  return (
    <section className="relative isolate flex min-h-[92vh] flex-col overflow-hidden bg-brand-ink text-brand-paper">
      {/* faint grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(#f3f1ec 1px, transparent 1px), linear-gradient(90deg, #f3f1ec 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }}
      />

      {/* GIANT wordmark — the editorial backdrop */}
      <div className="pointer-events-none absolute inset-x-0 top-[15%] z-0 flex justify-center">
        <span className="font-logo text-[27vw] font-extrabold leading-[0.8] tracking-[-0.05em] text-brand-paper sm:text-[26vw]">
          dealz<span className="text-brand-signal">.</span>
        </span>
      </div>

      {/* PRODUCT — sits in front of the wordmark */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-44 pt-28 sm:pb-40">
        <HeroDevice category={CATEGORIES[active].label} />
      </div>

      {/* bottom-left — CTA + blurb */}
      <div className="absolute bottom-10 left-4 z-20 max-w-xs sm:left-8 lg:bottom-12">
        <Link
          to="/shop"
          className="inline-flex items-center gap-3 rounded-full border border-brand-paper/30 bg-brand-paper/5 py-2 pl-2 pr-5 backdrop-blur transition hover:bg-brand-paper/10"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-paper text-brand-ink">
            <ShoppingBag className="h-4 w-4" strokeWidth={2} />
          </span>
          <span className="font-brand text-sm font-semibold">Shop Now</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-4 text-xs leading-relaxed text-brand-paper/60">
          Refurbished laptops and phones, tested live and backed by a 30-day
          warranty. See every detail before you buy.
        </p>
      </div>

      {/* right — category carousel */}
      <div className="absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-3 sm:right-8 lg:flex">
        <CarouselArrow
          icon={ChevronUp}
          label="Previous category"
          onClick={() => setActive((i) => (i - 1 + CATEGORIES.length) % CATEGORIES.length)}
        />
        {CATEGORIES.map((cat, i) => (
          <Link
            key={cat.label}
            to="/shop"
            onMouseEnter={() => setActive(i)}
            className={
              'flex h-20 w-24 flex-col items-center justify-center gap-1.5 rounded-2xl border transition ' +
              (i === active
                ? 'border-brand-signal bg-brand-paper text-brand-ink'
                : 'border-brand-paper/15 bg-brand-paper/5 text-brand-paper/70 hover:bg-brand-paper/10')
            }
          >
            <cat.icon className="h-6 w-6" strokeWidth={1.75} />
            <span className="font-data text-[9px] uppercase tracking-[0.12em]">
              {cat.label}
            </span>
          </Link>
        ))}
        <CarouselArrow
          icon={ChevronDown}
          label="Next category"
          onClick={() => setActive((i) => (i + 1) % CATEGORIES.length)}
        />
      </div>
    </section>
  )
}

function CarouselArrow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-paper/25 text-brand-paper/80 transition hover:bg-brand-paper/10 hover:text-brand-paper"
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

/** Phone showing a live product card — conveys the live-shopping app. */
function HeroDevice({ category }: { category: string }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-8 rounded-[3rem] bg-brand-signal/10 blur-3xl"
      />
      <div className="relative w-[280px] rounded-[2.5rem] border-[10px] border-brand-ink bg-brand-ink shadow-2xl ring-1 ring-brand-paper/10">
        <div className="overflow-hidden rounded-[1.9rem] bg-brand-paper">
          <div className="flex justify-center pt-3">
            <div className="h-1.5 w-16 rounded-full bg-brand-ink/15" />
          </div>
          <div className="px-5 pb-6 pt-5">
            {/* device photo placeholder */}
            <div
              className="relative flex h-40 items-center justify-center rounded-xl border border-brand-ink/10"
              style={{
                background:
                  'repeating-linear-gradient(135deg, transparent 0 11px, rgba(22,20,15,0.045) 11px 12px)',
              }}
            >
              <span className="font-data text-[10px] uppercase tracking-[0.14em] text-brand-ash">
                {category}
              </span>
              <span className="absolute right-3 top-3 rounded-md border border-brand-signal px-1.5 py-0.5 font-data text-[9px] tracking-[0.1em] text-brand-signal">
                LIVE
              </span>
            </div>
            <div className="mt-4 flex items-start justify-between">
              <div>
                <div className="font-brand text-base font-bold tracking-[-0.02em] text-brand-ink">
                  MacBook Air M2
                </div>
                <div className="mt-1 font-data text-[10px] uppercase tracking-[0.08em] text-brand-ash">
                  Grade A · 30-Day Warranty
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-brand-ink/10 pt-4">
              <span className="font-data text-base font-bold text-brand-ink">
                ¥124,000
              </span>
              <span className="rounded-lg bg-brand-ink px-4 py-2 font-brand text-xs font-semibold text-brand-paper">
                Buy
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
