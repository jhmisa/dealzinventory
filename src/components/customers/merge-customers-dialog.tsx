import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Merge, X, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react'
import { useCustomers, useMergeCustomers } from '@/hooks/use-customers'
import * as customersService from '@/services/customers'
import { formatCustomerName } from '@/lib/utils'
import { CodeDisplay } from '@/components/shared'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import type { Customer } from '@/lib/types'

type MergeStep = 'select' | 'preview' | 'confirm'

interface MergePreview {
  orders: number
  kaitori: number
  addresses: number
  conversations: number
  tickets: number
  offers: number
}

interface MergeCustomersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function CustomerCard({ customer, onRemove }: { customer: Customer; onRemove?: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <CodeDisplay code={customer.customer_code} />
          <span className="font-medium text-sm">{formatCustomerName(customer)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {customer.email ?? customer.phone ?? 'No contact'}
        </p>
      </div>
      {onRemove && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

function CustomerSearch({
  label,
  excludeIds,
  onSelect,
}: {
  label: string
  excludeIds: string[]
  onSelect: (customer: Customer) => void
}) {
  const [search, setSearch] = useState('')
  const { data: customers, isLoading } = useCustomers(search || undefined)

  const filtered = customers?.filter((c) => !excludeIds.includes(c.id)) ?? []

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <Command className="rounded-lg border" shouldFilter={false}>
        <CommandInput
          placeholder="Search by name, code, email..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          {search && !isLoading && filtered.length === 0 && (
            <CommandEmpty>No customers found.</CommandEmpty>
          )}
          {search && isLoading && (
            <div className="py-4 text-center text-sm text-muted-foreground">Searching...</div>
          )}
          {filtered.length > 0 && (
            <CommandGroup>
              {filtered.slice(0, 8).map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onSelect(c)
                    setSearch('')
                  }}
                >
                  <CodeDisplay code={c.customer_code} />
                  <span>{formatCustomerName(c)}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {c.email ?? c.phone ?? ''}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  )
}

export function MergeCustomersDialog({ open, onOpenChange }: MergeCustomersDialogProps) {
  const [step, setStep] = useState<MergeStep>('select')
  const [primary, setPrimary] = useState<Customer | null>(null)
  const [secondaries, setSecondaries] = useState<Customer[]>([])
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const mergeMutation = useMergeCustomers()

  const reset = useCallback(() => {
    setStep('select')
    setPrimary(null)
    setSecondaries([])
    setPreview(null)
    setLoadingPreview(false)
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const allSelectedIds = [primary?.id, ...secondaries.map((s) => s.id)].filter(Boolean) as string[]

  async function handleNext() {
    if (!primary || secondaries.length === 0) return
    setLoadingPreview(true)
    try {
      const data = await customersService.getMergePreview(
        primary.id,
        secondaries.map((s) => s.id),
      )
      setPreview(data)
      setStep('preview')
    } catch (err) {
      toast.error(`Failed to load preview: ${(err as Error).message}`)
    } finally {
      setLoadingPreview(false)
    }
  }

  function handleMerge() {
    if (!primary) return
    mergeMutation.mutate(
      { primaryId: primary.id, secondaryIds: secondaries.map((s) => s.id) },
      {
        onSuccess: (result) => {
          toast.success(
            `Merged ${result.merged_count} account${result.merged_count > 1 ? 's' : ''} into ${result.primary_code}`,
          )
          onOpenChange(false)
        },
        onError: (err) => toast.error(`Merge failed: ${err.message}`),
      },
    )
  }

  const totalRecords = preview
    ? preview.orders + preview.kaitori + preview.addresses + preview.conversations + preview.tickets + preview.offers
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge Customers
          </DialogTitle>
          <DialogDescription>
            {step === 'select' && 'Select a primary account and accounts to merge into it.'}
            {step === 'preview' && 'Review what will be merged before confirming.'}
            {step === 'confirm' && 'This action cannot be undone.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Select */}
        {step === 'select' && (
          <div className="space-y-4">
            <CustomerSearch
              label="Primary Account (keep)"
              excludeIds={secondaries.map((s) => s.id)}
              onSelect={setPrimary}
            />
            {primary && <CustomerCard customer={primary} onRemove={() => setPrimary(null)} />}

            <Separator />

            <CustomerSearch
              label="Accounts to Merge (delete)"
              excludeIds={allSelectedIds}
              onSelect={(c) => setSecondaries((prev) => [...prev, c])}
            />
            {secondaries.length > 0 && (
              <div className="space-y-2">
                {secondaries.map((s) => (
                  <CustomerCard
                    key={s.id}
                    customer={s}
                    onRemove={() => setSecondaries((prev) => prev.filter((x) => x.id !== s.id))}
                  />
                ))}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleNext}
                disabled={!primary || secondaries.length === 0 || loadingPreview}
              >
                {loadingPreview && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Next
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && primary && preview && (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">
                Merging {secondaries.length} account{secondaries.length > 1 ? 's' : ''} into:
              </p>
              <CustomerCard customer={primary} />
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">Accounts to be deleted:</p>
              <div className="space-y-1.5">
                {secondaries.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <CodeDisplay code={s.customer_code} />
                    <span>{formatCustomerName(s)}</span>
                  </div>
                ))}
              </div>
            </div>

            {totalRecords > 0 && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm font-medium mb-2">Records to reassign:</p>
                <div className="flex flex-wrap gap-2">
                  {preview.orders > 0 && <Badge variant="secondary">{preview.orders} orders</Badge>}
                  {preview.kaitori > 0 && <Badge variant="secondary">{preview.kaitori} kaitori</Badge>}
                  {preview.addresses > 0 && <Badge variant="secondary">{preview.addresses} addresses</Badge>}
                  {preview.conversations > 0 && <Badge variant="secondary">{preview.conversations} conversations</Badge>}
                  {preview.tickets > 0 && <Badge variant="secondary">{preview.tickets} tickets</Badge>}
                  {preview.offers > 0 && <Badge variant="secondary">{preview.offers} offers</Badge>}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select')}>
                Back
              </Button>
              <Button onClick={() => setStep('confirm')}>Merge</Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium">This action cannot be undone</p>
                <p className="text-xs text-muted-foreground">
                  {secondaries.length} account{secondaries.length > 1 ? 's' : ''} will be permanently
                  deleted. All their orders, conversations, tickets, and other data will be moved to{' '}
                  <span className="font-medium">{primary?.customer_code}</span>.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('preview')}>
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleMerge}
                disabled={mergeMutation.isPending}
              >
                {mergeMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Confirm Merge
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
