import { Link } from 'react-router-dom'
import {
  MapPin,
  Phone,
  Facebook,
  Youtube,
  MessageCircle,
  CreditCard,
  Banknote,
  Truck,
} from 'lucide-react'
import { DealzWordmark } from '@/components/marketing/dealz-logo'

const QUICK_LINKS = [
  { label: 'About App', href: '/about' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Testimonials', href: '/testimonials' },
  { label: 'Our Story', href: '/our-story' },
]

const LEGAL_LINKS = [
  { label: 'Returns & Warranty', href: '/legal/returns-warranty' },
  { label: 'Terms & Conditions', href: '/legal/terms' },
  { label: 'Privacy Policy', href: '/legal/privacy' },
  { label: '特定商取引法表記', href: '/legal/tokushoho' },
]

const SOCIAL_LINKS = [
  { label: 'Facebook Live', href: '#', icon: Facebook },
  { label: 'YouTube Channel', href: '#', icon: Youtube },
  { label: 'Facebook Messenger', href: '#', icon: MessageCircle },
]

function ColHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-data text-[11px] uppercase tracking-[0.18em] text-brand-ash">
      {children}
    </h3>
  )
}

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-brand-ink text-brand-paper">
      <div className="container mx-auto px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand + contact */}
          <div className="lg:col-span-2">
            <DealzWordmark invert className="text-3xl" />
            <div className="mt-5 space-y-2.5 font-data text-xs leading-relaxed text-brand-paper/65">
              <p className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 flex-none text-brand-ash" strokeWidth={1.75} />
                <span>
                  121-0011 Tokyo-to Adachi-ku Chuohoncho 3-5-3 1F Biru B1F
                  <br />
                  Business Registration: 0118-01-045980
                </span>
              </p>
              <p className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 flex-none text-brand-ash" strokeWidth={1.75} />
                <span>03-4550-1409</span>
              </p>
            </div>
            <Link
              to="/admin/login"
              className="mt-6 inline-flex items-center rounded-lg border border-brand-paper/20 px-3.5 py-2 font-data text-[11px] uppercase tracking-[0.14em] text-brand-paper/70 transition-colors hover:border-brand-paper/40 hover:text-brand-paper"
            >
              Admin Login
            </Link>
          </div>

          {/* Quick links */}
          <div>
            <ColHeading>Quick Links</ColHeading>
            <nav className="mt-4 flex flex-col gap-2.5">
              {QUICK_LINKS.map((l) => (
                <Link
                  key={l.href}
                  to={l.href}
                  className="font-brand text-sm text-brand-paper/75 transition-colors hover:text-brand-paper"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Legal */}
          <div>
            <ColHeading>Legal</ColHeading>
            <nav className="mt-4 flex flex-col gap-2.5">
              {LEGAL_LINKS.map((l) => (
                <Link
                  key={l.href}
                  to={l.href}
                  className="font-brand text-sm text-brand-paper/75 transition-colors hover:text-brand-paper"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Connect + Payment/Shipping */}
          <div className="space-y-8">
            <div>
              <ColHeading>Connect With Us</ColHeading>
              <nav className="mt-4 flex flex-col gap-2.5">
                {SOCIAL_LINKS.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    className="flex items-center gap-2.5 font-brand text-sm text-brand-paper/75 transition-colors hover:text-brand-paper"
                  >
                    <l.icon className="h-4 w-4 text-brand-ash" strokeWidth={1.75} />
                    {l.label}
                  </a>
                ))}
              </nav>
            </div>
            <div>
              <ColHeading>Payment &amp; Shipping</ColHeading>
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-brand-paper/15 px-2.5 py-1 font-data text-[11px] text-brand-paper/75">
                    <Banknote className="h-3.5 w-3.5" strokeWidth={1.75} /> COD
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-brand-paper/15 px-2.5 py-1 font-data text-[11px] text-brand-paper/75">
                    <CreditCard className="h-3.5 w-3.5" strokeWidth={1.75} /> Credit Card
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 font-data text-[11px] text-brand-paper/60">
                  <Truck className="h-3.5 w-3.5 text-brand-ash" strokeWidth={1.75} /> Yamato Transport
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-brand-paper/10 pt-6 sm:flex-row sm:items-center">
          <p className="font-data text-[11px] text-brand-paper/45">
            © {new Date().getFullYear()} Dealz K.K. All rights reserved.
          </p>
          <p className="font-data text-[11px] text-brand-paper/45">
            Refurbished tech, done right.
          </p>
        </div>
      </div>
    </footer>
  )
}
