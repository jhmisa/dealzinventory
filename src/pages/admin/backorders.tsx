import { PageHeader } from '@/components/shared'
import { BackorderList } from '@/components/backorders'

export default function BackordersPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Backorders" description="Manage pre-orders for out-of-stock items." />
      <BackorderList />
    </div>
  )
}
