/**
 * Shared wrapper for marketing text pages (About, FAQ, Our Story, Legal).
 * Centered prose column on the Paper canvas, MONO type system.
 */
export function ContentPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow?: string
  title: string
  intro?: string
  children?: React.ReactNode
}) {
  return (
    <article className="container mx-auto px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <header className="mx-auto max-w-2xl">
        {eyebrow && (
          <p className="font-data text-xs uppercase tracking-[0.22em] text-brand-signal">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-3 font-brand text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">
          {title}
        </h1>
        {intro && (
          <p className="mt-5 text-lg leading-relaxed text-brand-umber">{intro}</p>
        )}
      </header>
      {children && (
        <div className="mx-auto mt-12 max-w-2xl space-y-6 text-[15px] leading-relaxed text-brand-umber">
          {children}
        </div>
      )}
    </article>
  )
}

/** Placeholder shown on pages whose final copy hasn't been supplied yet. */
export function ContentComingSoon({ label = 'this page' }: { label?: string }) {
  return (
    <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-dashed border-brand-ink/15 bg-brand-ink/[0.02] px-6 py-12 text-center">
      <p className="font-data text-xs uppercase tracking-[0.18em] text-brand-ash">
        Content coming soon
      </p>
      <p className="mt-3 text-sm text-brand-umber/80">
        The full copy for {label} will be published here shortly.
      </p>
    </div>
  )
}
