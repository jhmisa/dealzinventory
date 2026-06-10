import { STATS_BAR } from './marketing-data'

export function StatsBar() {
  return (
    <section className="border-b border-brand-ink/10">
      <div className="container mx-auto px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-brand-ink/12 bg-brand-ink/12 lg:grid-cols-4">
          {STATS_BAR.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center bg-brand-paper px-4 py-8 text-center"
            >
              <span className="font-brand text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">
                {stat.value}
              </span>
              <span className="mt-2 font-data text-[11px] uppercase tracking-[0.12em] text-brand-ash">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
