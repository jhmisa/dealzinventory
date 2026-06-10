import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DealzWordmark, DealzMark } from '@/components/marketing/dealz-logo'
import { StoreBadges } from '@/components/marketing/store-badges'

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'About App', href: '/about' },
  { label: 'Shop', href: '/shop' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Testimonials', href: '/testimonials' },
]

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

export function SiteHeader() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  // Home has a full-bleed dark hero — overlay the nav on it (light text).
  const overlay = location.pathname === '/'

  return (
    <header
      className={cn(
        'top-0 z-50 w-full',
        overlay
          ? 'absolute inset-x-0 bg-transparent'
          : 'sticky border-b border-brand-ink/10 bg-brand-paper/85 backdrop-blur supports-[backdrop-filter]:bg-brand-paper/70',
      )}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Dealz home">
            {!overlay && <DealzMark size={32} />}
            <DealzWordmark invert={overlay} className="text-2xl" />
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {NAV_LINKS.map((link) => {
              const current = isActive(location.pathname, link.href)
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={cn(
                    'font-brand text-sm font-medium tracking-[-0.01em] transition-colors',
                    overlay
                      ? current
                        ? 'text-brand-paper'
                        : 'text-brand-paper/60 hover:text-brand-paper'
                      : current
                        ? 'text-brand-ink'
                        : 'text-brand-umber/70 hover:text-brand-ink',
                  )}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {!overlay && (
          <div className="hidden lg:block">
            <StoreBadges size="sm" />
          </div>
        )}

        <button
          type="button"
          className={cn('md:hidden', overlay ? 'text-brand-paper' : 'text-brand-ink')}
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div
          className={cn(
            'border-t px-4 py-4 md:hidden',
            overlay
              ? 'border-brand-paper/10 bg-brand-ink'
              : 'border-brand-ink/10 bg-brand-paper',
          )}
        >
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => {
              const current = isActive(location.pathname, link.href)
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'rounded-lg px-2 py-2.5 font-brand text-sm font-medium',
                    overlay
                      ? current
                        ? 'bg-brand-paper/10 text-brand-paper'
                        : 'text-brand-paper/70 hover:text-brand-paper'
                      : current
                        ? 'bg-brand-ink/5 text-brand-ink'
                        : 'text-brand-umber hover:text-brand-ink',
                  )}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>
          {!overlay && (
            <div className="mt-4 border-t border-brand-ink/10 pt-4">
              <StoreBadges size="sm" />
            </div>
          )}
        </div>
      )}
    </header>
  )
}
