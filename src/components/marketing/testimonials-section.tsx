import { Quote, Star } from 'lucide-react'
import { TESTIMONIALS } from './marketing-data'

export function TestimonialsSection() {
  return (
    <section className="border-b border-brand-ink/10">
      <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-data text-xs uppercase tracking-[0.22em] text-brand-signal">
            Live Shopping Experience
          </p>
          <h2 className="mt-3 font-brand text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
            What our customers say
          </h2>
          <p className="mt-4 text-brand-umber">
            Real buyers, tested products, honest reviews.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure
              key={t.name}
              className="flex flex-col rounded-2xl border border-brand-ink/12 bg-brand-paper p-6"
            >
              <Quote className="h-6 w-6 text-brand-ink/15" fill="currentColor" />
              <div className="mt-3 flex gap-0.5">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-brand-ink text-brand-ink" />
                ))}
              </div>
              <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-brand-umber">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-brand-ink/10 pt-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-ink font-data text-[11px] font-bold text-brand-paper">
                  {t.initials}
                </span>
                <span className="font-brand text-sm font-semibold tracking-[-0.01em]">
                  {t.name}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
