import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import {
  adminCreateCustomerSchema,
  type AdminCreateCustomerFormValues,
} from '@/validators/customer'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { AddressForm } from '@/components/shared'
import type { ShippingAddress } from '@/lib/address-types'

/** Format Japan phone number with dashes: 09012345678 → 090-1234-5678 */
function formatJapanPhone(value: string): string {
  const digits = value.replace(/[^\d]/g, '')
  // Mobile: 090/080/070/050 → XXX-XXXX-XXXX
  if (/^0[5789]0/.test(digits)) {
    if (digits.length <= 3) return digits
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`
  }
  // Landline: 03/06/etc → XX-XXXX-XXXX
  if (/^0[1-9]/.test(digits)) {
    if (digits.length <= 2) return digits
    if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`
  }
  return digits
}

interface CustomerFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loading?: boolean
  onSubmit: (values: AdminCreateCustomerFormValues, address: ShippingAddress | null) => void
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  loading = false,
  onSubmit,
}: CustomerFormDialogProps) {
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null)
  const [showPin, setShowPin] = useState(false)

  const form = useForm<AdminCreateCustomerFormValues>({
    resolver: zodResolver(adminCreateCustomerSchema),
    defaultValues: {
      last_name: '',
      first_name: '',
      email: '',
      phone: '',
      pin: '',
      is_seller: false,
      bank_name: '',
      bank_branch: '',
      bank_account_number: '',
      bank_account_holder: '',
    },
  })

  const isSeller = form.watch('is_seller')

  function handleSubmit(values: AdminCreateCustomerFormValues) {
    onSubmit(values, shippingAddress)
  }

  // Reset form when dialog closes
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset()
      setShippingAddress(null)
      setShowPin(false)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Customer</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Name fields */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="TARO"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        className="uppercase"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="TANAKA"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        className="uppercase"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Contact fields */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="customer@example.com" {...field} />
                  </FormControl>
                  <FormDescription>Email or phone is required</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="090-1234-5678"
                      {...field}
                      onChange={(e) => field.onChange(formatJapanPhone(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* PIN */}
            <FormField
              control={form.control}
              name="pin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PIN (6 digits) *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="******"
                        {...field}
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
                  </FormControl>
                  <FormDescription>Customer uses this to log in</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Shipping Address */}
            <AddressForm value={shippingAddress} onChange={setShippingAddress} />

            <Separator />

            {/* Seller toggle */}
            <FormField
              control={form.control}
              name="is_seller"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-sm font-medium">Seller Account</FormLabel>
                    <FormDescription className="text-xs">
                      Enable if this customer will sell items (Kaitori)
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Bank details (shown only if seller) */}
            {isSeller && (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm font-medium text-muted-foreground">Bank Details (for payouts)</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="bank_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank Name</FormLabel>
                        <FormControl>
                          <Input placeholder="三菱UFJ" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bank_branch"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Branch</FormLabel>
                        <FormControl>
                          <Input placeholder="渋谷支店" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="bank_account_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Number</FormLabel>
                      <FormControl>
                        <Input placeholder="1234567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bank_account_holder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Holder</FormLabel>
                      <FormControl>
                        <Input placeholder="タナカ タロウ" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Customer'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
