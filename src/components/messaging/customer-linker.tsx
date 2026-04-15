import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import type { Customer } from '@/lib/types'
import { toast } from 'sonner'

interface CustomerLinkerProps {
  onLink: (customerId: string) => void
  isLoading?: boolean
  trigger?: React.ReactNode
}

export function CustomerLinker({ onLink, isLoading, trigger }: CustomerLinkerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<(Pick<Customer, 'id' | 'customer_code' | 'last_name' | 'first_name' | 'email' | 'phone'> & { order_count: number; kaitori_count: number })[]>([])
  const [searching, setSearching] = useState(false)

  async function handleSearch() {
    if (!search.trim()) return
    setSearching(true)
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, customer_code, last_name, first_name, email, phone, orders(count), kaitori_requests(count)')
        .or(`last_name.ilike.%${search}%,first_name.ilike.%${search}%,customer_code.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
        .limit(10)
      if (error) throw error
      const mapped = (data ?? []).map((c) => ({
        id: c.id,
        customer_code: c.customer_code,
        last_name: c.last_name,
        first_name: c.first_name,
        email: c.email,
        phone: c.phone,
        order_count: (c.orders as unknown as { count: number }[])?.[0]?.count ?? 0,
        kaitori_count: (c.kaitori_requests as unknown as { count: number }[])?.[0]?.count ?? 0,
      }))
      setResults(mapped)
    } catch {
      toast.error('Failed to search customers')
    } finally {
      setSearching(false)
    }
  }

  function handleSelect(customerId: string) {
    onLink(customerId)
    setOpen(false)
    setSearch('')
    setResults([])
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="xs" variant="outline" disabled={isLoading}>
            <Link2 className="h-3 w-3" />
            Link Customer
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link Customer</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="Search by name, code, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={searching}>
            Search
          </Button>
        </div>
        {results.length > 0 && (
          <div className="max-h-60 overflow-y-auto space-y-1">
            {results.map((c) => (
              <button
                key={c.id}
                className="flex w-full items-center justify-between rounded-md p-2 text-left text-sm hover:bg-muted"
                onClick={() => handleSelect(c.id)}
              >
                <div className="min-w-0">
                  <div>
                    <span className="font-medium">{c.last_name} {c.first_name ?? ''}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{c.customer_code}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{c.email ?? c.phone}</div>
                </div>
                <div className="flex shrink-0 gap-2 ml-2 text-xs text-muted-foreground">
                  <span title="Orders">{c.order_count} ord</span>
                  <span title="Kaitori">{c.kaitori_count} kt</span>
                </div>
              </button>
            ))}
          </div>
        )}
        {results.length === 0 && search && !searching && (
          <p className="text-sm text-muted-foreground text-center py-4">No customers found</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
