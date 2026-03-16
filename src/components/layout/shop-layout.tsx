import { Outlet } from 'react-router-dom'
import { ShopHeader } from './shop-header'
import { ShopFooter } from './shop-footer'

export function ShopLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <ShopHeader />
      <main className="flex-1 container py-6">
        <Outlet />
      </main>
      <ShopFooter />
    </div>
  )
}
