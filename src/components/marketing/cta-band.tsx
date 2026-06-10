import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export function CtaBand() {
  return (
    <section className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-brand-ink px-8 py-16 text-center">
        {/* sparing red signal */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-signal/10 blur-2xl"
        />
        <h2 className="relative font-brand text-3xl font-extrabold tracking-[-0.03em] text-brand-paper sm:text-4xl">
          Ready to join our happy customers
          <span className="text-brand-signal">?</span>
        </h2>
        <p className="relative mx-auto mt-4 max-w-lg text-brand-paper/65">
          Transparent shopping with live demonstrations and industry-leading
          warranties. Find your next device today.
        </p>
        <Link
          to="/shop"
          className="relative mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-paper px-7 py-3.5 font-brand text-sm font-semibold text-brand-ink transition hover:bg-brand-paper/90"
        >
          Browse the Shop
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}
