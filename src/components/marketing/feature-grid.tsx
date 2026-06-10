import { FEATURES } from './marketing-data'

export function FeatureGrid() {
  return (
    <section className="border-b border-brand-ink/10">
      <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-data text-xs uppercase tracking-[0.22em] text-brand-signal">
            Why Dealz
          </p>
          <h2 className="mt-3 font-brand text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
            A better way to buy refurbished
          </h2>
          <p className="mt-4 text-brand-umber">
            Transparent live demonstrations, comprehensive warranties, and direct
            seller communication — the future of electronics shopping.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-brand-ink/12 bg-brand-ink/12 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="bg-brand-paper p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-ink text-brand-paper">
                <feature.icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <h3 className="mt-5 font-brand text-lg font-bold tracking-[-0.02em]">
                {feature.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-brand-umber">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
