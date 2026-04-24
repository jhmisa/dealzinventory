import { useState, useEffect } from 'react'
import { useCustomers } from '@/hooks/use-customers'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, X } from 'lucide-react'
import type { Customer } from '@/lib/types'
import { formatCustomerName } from '@/lib/utils'

interface CustomerPickerProps {
  selectedCustomer: Customer | null
  onSelect: (customer: Customer | null) => void
}

export function CustomerPicker({ selectedCustomer, onSelect }: CustomerPickerProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  // Debounce search to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data: customers, isLoading } = useCustomers(debouncedSearch || undefined)

  // If a customer is selected, show info card
  if (selectedCustomer) {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {selectedCustomer.customer_code}
                </Badge>
                <span className="font-medium">
                  {formatCustomerName(selectedCustomer)}
                </span>
              </div>
              {selectedCustomer.email && (
                <p className="text-sm text-muted-foreground">{selectedCustomer.email}</p>
              )}
              {selectedCustomer.phone && (
                <p className="text-sm text-muted-foreground">{selectedCustomer.phone}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, code, email, or phone..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          className="pl-9"
        />
      </div>

      {isOpen && search.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : !customers?.length ? (
            <p className="p-4 text-sm text-muted-foreground">No customers found</p>
          ) : (
            customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="w-full text-left px-4 py-2 hover:bg-accent transition-colors"
                onClick={() => {
                  onSelect(customer as Customer)
                  setSearch('')
                  setIsOpen(false)
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {customer.customer_code}
                  </span>
                  <span className="font-medium text-sm">
                    {formatCustomerName(customer)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {[customer.email, customer.phone].filter(Boolean).join(' · ')}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
