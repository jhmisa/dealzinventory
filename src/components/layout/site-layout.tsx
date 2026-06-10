import { Outlet } from 'react-router-dom'
import { SiteHeader } from './site-header'
import { SiteFooter } from './site-footer'

export function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-brand-paper text-brand-ink antialiased">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}
