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
  const [results, setResults] = useState<Pick<Customer, 'id' | 'customer_code' | 'last_name' | 'first_name' | 'email' | 'phone'>[]>([])
  const [searching, setSearching] = useState(false)

  async function handleSearch() {
    if (!search.trim()) return
    setSearching(true)
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, customer_code, last_name, first_name, email, phone')
        .or(`last_name.ilike.%${search}%,first_name.ilike.%${search}%,customer_code.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
        .limit(10)
      if (error) throw error
      setResults(data ?? [])
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
                <div>
                  <span className="font-medium">{c.last_name} {c.first_name ?? ''}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{c.customer_code}</span>
                </div>
                <span className="text-xs text-muted-foreground">{c.email ?? c.phone}</span>
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
