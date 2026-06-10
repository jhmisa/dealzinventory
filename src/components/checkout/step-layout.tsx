interface CheckoutStepLayoutProps {
  children: React.ReactNode
  /** Pinned bottom action bar (usually a <StickyCta/>). Stays below the scroll region. */
  cta?: React.ReactNode
}

// Content scrolls in a flex-1 region; the CTA stays pinned beneath it. Requires an
// ancestor with a definite height (CheckoutShell provides h-dvh).
export function CheckoutStepLayout({ children, cta }: CheckoutStepLayoutProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="-mx-5 min-h-0 flex-1 overflow-y-auto px-5 pb-2">{children}</div>
      {cta}
    </div>
  )
}
