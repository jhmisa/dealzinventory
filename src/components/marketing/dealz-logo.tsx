import { cn } from '@/lib/utils'

/**
 * MONO brand wordmark: lowercase "dealz" + a single red full-stop.
 * The accent never grows beyond the dot — restraint is the brand.
 */
export function DealzWordmark({
  className,
  invert = false,
}: {
  className?: string
  /** Use on dark (ink) surfaces — wordmark becomes paper-colored. */
  invert?: boolean
}) {
  return (
    <span
      className={cn(
        'font-logo font-extrabold leading-none tracking-[-0.045em] select-none',
        invert ? 'text-brand-paper' : 'text-brand-ink',
        className,
      )}
    >
      dealz<span className="text-brand-signal">.</span>
    </span>
  )
}

/**
 * App-icon mark: lowercase "d" with a red full-stop inside a rounded ink square.
 */
export function DealzMark({
  className,
  size = 40,
}: {
  className?: string
  size?: number
}) {
  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center rounded-[22%] bg-brand-ink font-logo font-extrabold leading-none tracking-[-0.05em] text-brand-paper',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.6 }}
      aria-hidden
    >
      d
      <span
        className="absolute rounded-full bg-brand-signal"
        style={{
          width: size * 0.1,
          height: size * 0.1,
          bottom: size * 0.28,
          right: size * 0.24,
        }}
      />
    </span>
  )
}
