/**
 * Shared input styling for checkout text fields.
 *
 * The base shadcn `Input` is `bg-transparent` with a faint `border-input`, which
 * disappears against the cream brand-paper background. On checkout we want every
 * field to read unmistakably as a tappable field: white fill, a clear soft border,
 * a 48px touch target, and a brand-ink focus ring.
 *
 * Applied via `className` (tailwind-merge lets these win over the Input defaults).
 */
export const CHECKOUT_FIELD_CLASS =
  'h-12 rounded-xl border border-brand-ash/50 bg-white px-4 font-brand text-base text-brand-ink shadow-sm ' +
  'placeholder:text-brand-ash/90 ' +
  'focus-visible:border-brand-ink focus-visible:ring-brand-ink/15 focus-visible:ring-[3px]'
