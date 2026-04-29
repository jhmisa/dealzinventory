import { useState } from 'react'
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
  UserCog,
  BarChart3,
  FileText,
  BrainCircuit,
  Tags,
  MapPin,
  RotateCcw,
  Ticket,
  Share2,
  Columns3,
  Settings,
  MessageSquare,
  ChevronRight,
  Undo2,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useNeedsReviewCount } from '@/hooks/use-messaging'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'

type NavItem = {
  title: string
  icon: typeof LayoutDashboard
  href: string
}

interface NavSection {
  label: string
  items: NavItem[]
}

const navSections: NavSection[] = [
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
      { title: 'Returns', href: '/admin/inventory-returns', icon: Undo2 },
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
      { title: 'Packing', href: '/admin/packing', icon: PackageCheck },
    ],
  },
  {
    label: 'Messaging',
    items: [
      { title: 'Messages', href: '/admin/messages', icon: MessageSquare },
      { title: 'Tickets', href: '/admin/tickets', icon: Ticket },
      { title: 'Social Media', href: '/admin/social-media', icon: Share2 },
    ],
  },
  {
    label: 'Kaitori',
    items: [
      { title: 'Kaitori', href: '/admin/kaitori', icon: HandCoins },
      { title: 'Price List', href: '/admin/kaitori-prices', icon: List },
    ],
  },
  {
    label: 'Contacts',
    items: [
      { title: 'Customers', href: '/admin/customers', icon: Users },
      { title: 'Suppliers', href: '/admin/suppliers', icon: Truck },
    ],
  },
]

const settingsItems: NavItem[] = [
  { title: 'General', href: '/admin/settings/general', icon: Settings },
  { title: 'AI Configuration', href: '/admin/settings/ai', icon: BrainCircuit },
  { title: 'AI Messaging', href: '/admin/settings/messaging', icon: MessageSquare },
  { title: 'Items Columns', href: '/admin/settings/items-columns', icon: Columns3 },
  { title: 'Postal Codes', href: '/admin/settings/postal-codes', icon: MapPin },
  { title: 'Members', href: '/admin/settings/staff', icon: UserCog },
  { title: 'Reports', href: '/admin/reports', icon: BarChart3 },
  { title: 'Inventory Report', href: '/admin/reports/inventory', icon: FileText },
]

export function AppSidebar() {
  const location = useLocation()
  const { isAdmin } = useAuth()
  const { data: needsReviewCount } = useNeedsReviewCount()
  const settingsActive = location.pathname.startsWith('/admin/settings') || location.pathname.startsWith('/admin/reports')
  const [settingsOpen, setSettingsOpen] = useState(settingsActive)

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link to="/admin/dashboard" className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            D
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold leading-none tracking-tight">Dealz</span>
              <span className="text-xs font-medium text-muted-foreground leading-none">K.K.</span>
            </div>
            <span className="text-[10px] text-muted-foreground mt-1 block leading-none">v{__APP_VERSION__}</span>
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
                  const showBadge = item.href === '/admin/messages' && (needsReviewCount ?? 0) > 0
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link to={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {showBadge && (
                        <SidebarMenuBadge className="bg-destructive text-white">
                          {needsReviewCount}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {/* Collapsible Settings — admin only */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton isActive={settingsActive}>
                        <Settings className="h-4 w-4" />
                        <span>Settings</span>
                        <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {settingsItems.map((item) => {
                          const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/')
                          return (
                            <SidebarMenuSubItem key={item.href}>
                              <SidebarMenuSubButton asChild isActive={isActive}>
                                <Link to={item.href}>
                                  <span>{item.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  )
}
