import { Link, useLocation } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Fragment } from 'react'

const labelMap: Record<string, string> = {
  admin: 'Admin',
  dashboard: 'Dashboard',
  items: 'Items',
  intake: 'Bulk Intake',
  scan: 'QR Scanner',
  inspection: 'Inspection',
  products: 'Products',
  categories: 'Categories',
  suppliers: 'Suppliers',
  'sell-groups': 'Sell Groups',
  orders: 'Orders',
  packing: 'Packing Station',
  kaitori: 'Kaitori',
  'kaitori-prices': 'Price List',
  customers: 'Customers',
  'receiving-reports': 'Receiving Reports',
  reports: 'Reports',
  settings: 'Settings',
  ai: 'AI Configuration',
  'postal-codes': 'Postal Codes',
  shop: 'Shop',
  sell: 'Sell',
  account: 'My Account',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function BreadcrumbNav() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  // Skip rendering if we're at the root admin level
  if (segments.length <= 1) return null

  const crumbs = segments.map((segment, index) => {
    const path = '/' + segments.slice(0, index + 1).join('/')
    const label = labelMap[segment] ?? (UUID_RE.test(segment) ? 'Detail' : segment)
    const isLast = index === segments.length - 1
    return { path, label, isLast }
  })

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.path}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {crumb.isLast ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={crumb.path}>{crumb.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
