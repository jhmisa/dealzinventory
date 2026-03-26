import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  ClipboardCheck,
  Box,
  Truck,
  ScanLine,
  ShoppingBag,
  ClipboardList,
  PackageCheck,
  HandCoins,
  List,
  Users,
  BarChart3,
  FileText,
  BrainCircuit,
  Tags,
  MapPin,
  RotateCcw,
  Columns3,
  Settings,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const navSections = [
  {
    label: 'Overview',
    items: [
      { title: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { title: 'Items', href: '/admin/items', icon: Package },
      { title: 'New Intake', href: '/admin/items/intake', icon: Box },
      { title: 'Receiving Reports', href: '/admin/receiving-reports', icon: FileText },
      { title: 'QR Scanner', href: '/admin/items/scan', icon: ScanLine },
      { title: 'Inspection', href: '/admin/inspection', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { title: 'Products', href: '/admin/products', icon: Box },
      { title: 'Categories', href: '/admin/categories', icon: Tags },
    ],
  },
  {
    label: 'Sales',
    items: [
      { title: 'Sell Groups', href: '/admin/sell-groups', icon: ShoppingBag },
      { title: 'Orders', href: '/admin/orders', icon: ClipboardList },
      { title: 'Returns', href: '/admin/returns', icon: RotateCcw },
      { title: 'Packing', href: '/admin/packing', icon: PackageCheck },
    ],
  },
  {
    label: 'Kaitori',
    items: [
      { title: 'Requests', href: '/admin/kaitori', icon: HandCoins },
      { title: 'Price List', href: '/admin/kaitori-prices', icon: List },
    ],
  },
  {
    label: 'Customers',
    items: [
      { title: 'Customers', href: '/admin/customers', icon: Users },
    ],
  },
  {
    label: 'Partners',
    items: [
      { title: 'Suppliers', href: '/admin/suppliers', icon: Truck },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { title: 'Reports', href: '/admin/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Settings',
    items: [
      { title: 'General', href: '/admin/settings/general', icon: Settings },
      { title: 'AI Configuration', href: '/admin/settings/ai', icon: BrainCircuit },
      { title: 'Items Columns', href: '/admin/settings/items-columns', icon: Columns3 },
      { title: 'Postal Codes', href: '/admin/settings/postal-codes', icon: MapPin },
    ],
  },
]

export function AppSidebar() {
  const location = useLocation()

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link to="/admin/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            D
          </div>
          <div>
            <span className="text-base font-bold leading-none">Dealz</span>
            <span className="text-xs text-muted-foreground block leading-tight">K.K.</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {navSections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/')
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link to={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
