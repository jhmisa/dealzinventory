import { Outlet } from 'react-router-dom'
import { ShopHeader } from './shop-header'
import { ShopFooter } from './shop-footer'

export function ShopLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <ShopHeader />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
      <ShopFooter />
    </div>
  )
}
