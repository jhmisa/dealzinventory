import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import {
  customerProfileSchema,
  changePinSchema,
  type CustomerProfileFormValues,
  type ChangePinFormValues,
} from '@/validators/customer'
import * as customersService from '@/services/customers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { AddressForm } from '@/components/shared'
import type { ShippingAddress } from '@/lib/address-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'
import { Separator } from '@/components/ui/separator'

export default function CustomerSettingsPage() {
  const { customer, refreshCustomer } = useCustomerAuth()

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Account Settings</h1>

      <ProfileSection />
      <Separator />
      <PinSection />

      {customer?.is_seller && (
        <>
          <Separator />
          <BankSection />
        </>
      )}
    </div>
  )
}

function ProfileSection() {
  const { customer, refreshCustomer } = useCustomerAuth()
  const [saving, setSaving] = useState(false)
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(
    (customer?.shipping_address as ShippingAddress | null) ?? null
  )

  const form = useForm<CustomerProfileFormValues>({
    resolver: zodResolver(customerProfileSchema),
    defaultValues: {
      last_name: customer?.last_name ?? '',
      first_name: customer?.first_name ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      is_seller: customer?.is_seller ?? false,
      bank_name: customer?.bank_name ?? '',
      bank_branch: customer?.bank_branch ?? '',
      bank_account_number: customer?.bank_account_number ?? '',
      bank_account_holder: customer?.bank_account_holder ?? '',
    },
  })

  async function onSubmit(values: CustomerProfileFormValues) {
    if (!customer) return
    setSaving(true)
    try {
      await customersService.updateCustomer(customer.id, {
        last_name: values.last_name,
        first_name: values.first_name || null,
        email: values.email || null,
        phone: values.phone || null,
        shipping_address: shippingAddress as unknown as string, // JSONB stored as-is by Supabase
        is_seller: values.is_seller,
      })
      await refreshCustomer()
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your personal information and shipping address.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
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
                    <Input type="tel" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <AddressForm value={shippingAddress} onChange={setShippingAddress} />

            <FormField
              control={form.control}
              name="is_seller"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-base">Seller Mode</FormLabel>
                    <FormDescription>
                      Enable to sell devices and receive payments.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

function PinSection() {
  const { customer } = useCustomerAuth()
  const [saving, setSaving] = useState(false)

  const form = useForm<ChangePinFormValues>({
    resolver: zodResolver(changePinSchema),
    defaultValues: { current_pin: '', new_pin: '', confirm_pin: '' },
  })

  async function onSubmit(values: ChangePinFormValues) {
    if (!customer) return
    setSaving(true)
    try {
      await customersService.customerChangePin(customer.id, values.current_pin, values.new_pin)
      toast.success('PIN changed successfully')
      form.reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change PIN')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change PIN</CardTitle>
        <CardDescription>Update your 6-digit login PIN.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="current_pin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current PIN</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="------"
                      className="text-center tracking-[0.5em] font-mono max-w-[200px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4 max-w-[420px]">
              <FormField
                control={form.control}
                name="new_pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New PIN</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="------"
                        className="text-center tracking-[0.5em] font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirm_pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm PIN</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="------"
                        className="text-center tracking-[0.5em] font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Changing...' : 'Change PIN'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

function BankSection() {
  const { customer, refreshCustomer } = useCustomerAuth()
  const [saving, setSaving] = useState(false)

  const form = useForm({
    defaultValues: {
      bank_name: customer?.bank_name ?? '',
      bank_branch: customer?.bank_branch ?? '',
      bank_account_number: customer?.bank_account_number ?? '',
      bank_account_holder: customer?.bank_account_holder ?? '',
    },
  })

  async function onSubmit(values: Record<string, string>) {
    if (!customer) return
    setSaving(true)
    try {
      await customersService.updateCustomer(customer.id, {
        bank_name: values.bank_name || null,
        bank_branch: values.bank_branch || null,
        bank_account_number: values.bank_account_number || null,
        bank_account_holder: values.bank_account_holder || null,
      })
      await refreshCustomer()
      toast.success('Bank details updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update bank details')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank Details</CardTitle>
        <CardDescription>Required for receiving Kaitori payments via bank transfer.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Bank Name</label>
              <Input {...form.register('bank_name')} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Branch</label>
              <Input {...form.register('bank_branch')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Account Number</label>
              <Input {...form.register('bank_account_number')} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Account Holder</label>
              <Input {...form.register('bank_account_holder')} />
            </div>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Bank Details'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
