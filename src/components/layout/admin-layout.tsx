import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './sidebar'
import { TopHeader } from './top-header'
import { BreadcrumbNav } from './breadcrumb-nav'

export function AdminLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <TopHeader />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-2 md:px-6 lg:px-8 shrink-0">
            <BreadcrumbNav />
          </div>
          <div className="flex-1 min-h-0 overflow-auto px-4 pb-8 md:px-6 lg:px-8 max-w-screen-2xl has-[.full-height-page]:overflow-hidden has-[.full-height-page]:pb-0">
            <Outlet />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
