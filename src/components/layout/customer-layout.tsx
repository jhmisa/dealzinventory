import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { ShoppingBag, Package, HandCoins, RotateCcw, Settings, LogOut, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatCustomerName } from '@/lib/utils'
import { useState } from 'react'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { CustomerAuthContext, useCustomerAuthProvider } from '@/hooks/use-customer-auth'
import { ShopFooter } from './shop-footer'

const navLinks = [
  { label: 'My Orders', href: '/account/orders', icon: Package },
  { label: 'Returns', href: '/account/returns', icon: RotateCcw },
  { label: 'My Sales', href: '/account/kaitori', icon: HandCoins },
  { label: 'Settings', href: '/account/settings', icon: Settings },
]

function CustomerHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const { customer, logout } = useCustomerAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/account/login')
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/account" className="flex items-center gap-2 font-bold text-lg">
            <ShoppingBag className="h-5 w-5" />
            Dealz
          </Link>
          <nav className="hidden md:flex items-center gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  'flex items-center gap-1.5 text-sm transition-colors hover:text-foreground',
                  location.pathname.startsWith(link.href)
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground',
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden md:inline text-sm text-muted-foreground">
            {customer ? formatCustomerName(customer) : ''}
          </span>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="hidden md:flex">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t p-4 space-y-2 bg-background">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="flex items-center gap-2 py-2 text-sm"
              onClick={() => setMobileOpen(false)}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
          <button
            className="flex items-center gap-2 py-2 text-sm text-destructive w-full"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      )}
    </header>
  )
}

function CustomerProtectedContent() {
  const { isAuthenticated } = useCustomerAuth()
  const location = useLocation()

  // Allow login and register pages without auth
  const publicPaths = ['/account/login', '/account/register']
  const isPublicPage = publicPaths.some((p) => location.pathname.startsWith(p))

  if (!isAuthenticated && !isPublicPage) {
    return (
      <div className="container py-12 text-center">
        <h2 className="text-xl font-semibold mb-4">Please log in to continue</h2>
        <Button asChild>
          <Link to="/account/login">Log In</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      {isAuthenticated && <CustomerHeader />}
      <main className="flex-1 container py-6">
        <Outlet />
      </main>
      {isAuthenticated && <ShopFooter />}
    </>
  )
}

export function CustomerLayout() {
  const authState = useCustomerAuthProvider()

  return (
    <CustomerAuthContext.Provider value={authState}>
      <div className="flex min-h-screen flex-col">
        <CustomerProtectedContent />
      </div>
    </CustomerAuthContext.Provider>
  )
}
