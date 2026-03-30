import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Pencil, ShieldCheck, ShieldX, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import type { ShippingAddress } from '@/lib/address-types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  PageHeader,
  StatusBadge,
  CodeDisplay,
  PriceDisplay,
  ConfirmDialog,
  FormSkeleton,
  TableSkeleton,
  EmptyState,
  AddressDisplay,
  AddressForm,
} from '@/components/shared'
import {
  useCustomerWithDetails,
  useCustomerOrders,
  useCustomerKaitoriRequests,
  useVerifyCustomerId,
  useUpdateCustomer,
  useResetCustomerPin,
} from '@/hooks/use-customers'
import { ORDER_STATUSES, KAITORI_STATUSES } from '@/lib/constants'
import { formatDate, formatDateTime } from '@/lib/utils'
import { useState } from 'react'
import type { CustomerUpdate } from '@/lib/types'

/** Format Japan phone number with dashes: 09012345678 → 090-1234-5678 */
function formatJapanPhone(value: string): string {
  const digits = value.replace(/[^\d]/g, '')
  if (/^0[5789]0/.test(digits)) {
    if (digits.length <= 3) return digits
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`
  }
  if (/^0[1-9]/.test(digits)) {
    if (digits.length <= 2) return digits
    if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`
  }
  return digits
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: customer, isLoading } = useCustomerWithDetails(id!)
  const { data: orders, isLoading: ordersLoading } = useCustomerOrders(id!)
  const { data: kaitoriRequests, isLoading: kaitoriLoading } = useCustomerKaitoriRequests(id!)
  const verifyMutation = useVerifyCustomerId()
  const updateMutation = useUpdateCustomer()
  const resetPinMutation = useResetCustomerPin()

  const [verifyOpen, setVerifyOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [pinDialogOpen, setPinDialogOpen] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [showPin, setShowPin] = useState(false)

  // Edit form state
  const [editLastName, setEditLastName] = useState('')
  const [editFirstName, setEditFirstName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editAddress, setEditAddress] = useState<ShippingAddress | null>(null)
  const [editIsSeller, setEditIsSeller] = useState(false)
  const [editBankName, setEditBankName] = useState('')
  const [editBankBranch, setEditBankBranch] = useState('')
  const [editBankAccountNumber, setEditBankAccountNumber] = useState('')
  const [editBankAccountHolder, setEditBankAccountHolder] = useState('')

  if (isLoading) return <FormSkeleton fields={8} />
  if (!customer) return <div className="text-center py-12 text-muted-foreground">Customer not found.</div>

  function enterEditMode() {
    if (!customer) return
    setEditLastName(customer.last_name ?? '')
    setEditFirstName(customer.first_name ?? '')
    setEditEmail(customer.email ?? '')
    setEditPhone(customer.phone ?? '')
    setEditAddress(customer.shipping_address as ShippingAddress | null)
    setEditIsSeller(customer.is_seller ?? false)
    setEditBankName(customer.bank_name ?? '')
    setEditBankBranch(customer.bank_branch ?? '')
    setEditBankAccountNumber(customer.bank_account_number ?? '')
    setEditBankAccountHolder(customer.bank_account_holder ?? '')
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
  }

  async function handleSave() {
    if (!customer) return
    const updates: CustomerUpdate = {}

    if (editLastName !== (customer.last_name ?? '')) updates.last_name = editLastName
    if (editFirstName !== (customer.first_name ?? '')) updates.first_name = editFirstName || null
    if (editEmail !== (customer.email ?? '')) updates.email = editEmail || null
    if (editPhone !== (customer.phone ?? '')) updates.phone = editPhone || null
    if (editIsSeller !== (customer.is_seller ?? false)) updates.is_seller = editIsSeller
    if (editBankName !== (customer.bank_name ?? '')) updates.bank_name = editBankName || null
    if (editBankBranch !== (customer.bank_branch ?? '')) updates.bank_branch = editBankBranch || null
    if (editBankAccountNumber !== (customer.bank_account_number ?? '')) updates.bank_account_number = editBankAccountNumber || null
    if (editBankAccountHolder !== (customer.bank_account_holder ?? '')) updates.bank_account_holder = editBankAccountHolder || null

    // Compare address by JSON serialization
    const currentAddrStr = customer.shipping_address ? JSON.stringify(customer.shipping_address) : null
    const newAddrStr = editAddress ? JSON.stringify(editAddress) : null
    if (newAddrStr !== currentAddrStr) {
      updates.shipping_address = newAddrStr
    }

    if (Object.keys(updates).length === 0) {
      setIsEditing(false)
      return
    }

    try {
      await updateMutation.mutateAsync({ id: id!, updates })
      toast.success('Customer updated')
      setIsEditing(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    }
  }

  async function handleResetPin() {
    if (!/^\d{6}$/.test(newPin)) {
      toast.error('PIN must be exactly 6 digits')
      return
    }
    try {
      await resetPinMutation.mutateAsync({ customerId: id!, newPin })
      toast.success('PIN reset successfully')
      setPinDialogOpen(false)
      setNewPin('')
      setShowPin(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PIN reset failed')
    }
  }

  async function handleVerify() {
    try {
      await verifyMutation.mutateAsync(id!)
      toast.success('Customer ID verified')
      setVerifyOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/customers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title={`${customer.last_name} ${customer.first_name ?? ''}`}
          subtitle={<CodeDisplay code={customer.customer_code} />}
        />
        <div className="ml-auto flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={cancelEdit} disabled={updateMutation.isPending}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={enterEditMode}>
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Customer Info */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isEditing ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Last Name *</Label>
                    <Input
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value.toUpperCase())}
                      className="uppercase"
                      placeholder="TANAKA"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">First Name</Label>
                    <Input
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value.toUpperCase())}
                      className="uppercase"
                      placeholder="TARO"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="customer@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <Input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(formatJapanPhone(e.target.value))}
                    placeholder="090-1234-5678"
                  />
                </div>
                <AddressForm value={editAddress} onChange={setEditAddress} />
              </>
            ) : (
              <>
                <InfoRow label="Email" value={customer.email ?? '-'} />
                <InfoRow label="Phone" value={customer.phone ?? '-'} />
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Shipping Address</span>
                  <AddressDisplay
                    address={customer.shipping_address as ShippingAddress | null}
                    format="auto"
                  />
                </div>
                <InfoRow label="Registered" value={formatDateTime(customer.created_at)} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Verification & Status</CardTitle>
            <div className="flex items-center gap-2">
              {isEditing && (
                <Button size="sm" variant="outline" onClick={() => { setPinDialogOpen(true); setNewPin(''); setShowPin(false) }}>
                  Reset PIN
                </Button>
              )}
              {!customer.id_verified && !isEditing && (
                <Button size="sm" onClick={() => setVerifyOpen(true)}>
                  <ShieldCheck className="h-4 w-4 mr-1" />
                  Verify ID
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">ID Verified</span>
              {customer.id_verified ? (
                <div className="flex items-center gap-1.5 text-green-600">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="text-sm font-medium">Verified</span>
                  {customer.id_verified_at && (
                    <span className="text-xs text-muted-foreground ml-1">
                      ({formatDate(customer.id_verified_at)})
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-600">
                  <ShieldX className="h-4 w-4" />
                  <span className="text-sm">Not verified</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Seller Status</span>
              {isEditing ? (
                <Switch checked={editIsSeller} onCheckedChange={setEditIsSeller} />
              ) : customer.is_seller ? (
                <Badge variant="secondary">Active Seller</Badge>
              ) : (
                <span className="text-sm text-muted-foreground">Buyer only</span>
              )}
            </div>
            {customer.id_document_url && (
              <div className="pt-2 border-t">
                <span className="text-sm text-muted-foreground block mb-1">ID Document:</span>
                <a
                  href={customer.id_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  View Document
                </a>
              </div>
            )}
            {isEditing ? (
              editIsSeller && (
                <div className="pt-2 border-t space-y-3">
                  <span className="text-sm font-medium">Bank Details</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Bank Name</Label>
                      <Input
                        value={editBankName}
                        onChange={(e) => setEditBankName(e.target.value)}
                        placeholder="三菱UFJ"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Branch</Label>
                      <Input
                        value={editBankBranch}
                        onChange={(e) => setEditBankBranch(e.target.value)}
                        placeholder="渋谷支店"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Account Number</Label>
                    <Input
                      value={editBankAccountNumber}
                      onChange={(e) => setEditBankAccountNumber(e.target.value)}
                      placeholder="1234567"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Account Holder</Label>
                    <Input
                      value={editBankAccountHolder}
                      onChange={(e) => setEditBankAccountHolder(e.target.value)}
                      placeholder="タナカ タロウ"
                    />
                  </div>
                </div>
              )
            ) : (
              customer.is_seller && (
                <div className="pt-2 border-t space-y-1">
                  <span className="text-sm font-medium">Bank Details</span>
                  <InfoRow label="Bank" value={customer.bank_name ?? '-'} />
                  <InfoRow label="Branch" value={customer.bank_branch ?? '-'} />
                  <InfoRow label="Account" value={customer.bank_account_number ?? '-'} />
                  <InfoRow label="Holder" value={customer.bank_account_holder ?? '-'} />
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Order History ({orders?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : !orders?.length ? (
            <EmptyState title="No orders" description="This customer has no orders." />
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  to={`/admin/orders/${order.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CodeDisplay code={order.order_code} />
                    <StatusBadge status={order.order_status} config={ORDER_STATUSES} />
                    <span className="text-xs text-muted-foreground">{formatDate(order.created_at)}</span>
                  </div>
                  <PriceDisplay price={order.total_price} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kaitori History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Kaitori History ({kaitoriRequests?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {kaitoriLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : !kaitoriRequests?.length ? (
            <EmptyState title="No Kaitori requests" description="This customer has no sell requests." />
          ) : (
            <div className="space-y-2">
              {kaitoriRequests.map((req) => (
                <Link
                  key={req.id}
                  to={`/admin/kaitori/${req.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CodeDisplay code={req.kaitori_code} />
                    <StatusBadge status={req.request_status} config={KAITORI_STATUSES} />
                    <span className="text-xs text-muted-foreground">{formatDate(req.created_at)}</span>
                  </div>
                  <PriceDisplay price={req.final_price ?? req.auto_quote_price} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verify ID Dialog */}
      <ConfirmDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        title="Verify Customer ID"
        description="Confirm that you have reviewed and verified this customer's government-issued ID. This action cannot be undone."
        confirmLabel="Verify ID"
        onConfirm={handleVerify}
        loading={verifyMutation.isPending}
      />

      {/* Reset PIN Dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Reset Customer PIN</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Set a new 6-digit PIN for this customer. They will need to use this PIN to log in.
            </p>
            <div className="space-y-1">
              <Label className="text-sm">New PIN</Label>
              <div className="relative">
                <Input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="******"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/[^\d]/g, ''))}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPin(!showPin)}
                  tabIndex={-1}
                >
                  {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinDialogOpen(false)} disabled={resetPinMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleResetPin}
              disabled={newPin.length !== 6 || resetPinMutation.isPending}
            >
              {resetPinMutation.isPending ? 'Resetting...' : 'Reset PIN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right max-w-[60%]">{value}</span>
    </div>
  )
}
