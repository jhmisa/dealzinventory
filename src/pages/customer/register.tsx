import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { customerRegisterSchema, type CustomerRegisterFormValues } from '@/validators/customer'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { ShoppingBag } from 'lucide-react'
import { AddressForm } from '@/components/shared'
import type { ShippingAddress } from '@/lib/address-types'

export default function CustomerRegisterPage() {
  const navigate = useNavigate()
  const { register: registerCustomer } = useCustomerAuth()
  const [error, setError] = useState<string | null>(null)
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null)

  const form = useForm<CustomerRegisterFormValues>({
    resolver: zodResolver(customerRegisterSchema),
    defaultValues: {
      last_name: '',
      first_name: '',
      email: '',
      phone: '',
      pin: '',
      pin_confirm: '',
    },
  })

  async function onSubmit(values: CustomerRegisterFormValues) {
    try {
      setError(null)
      await registerCustomer({
        last_name: values.last_name,
        first_name: values.first_name || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
        pin: values.pin,
        shipping_address: shippingAddress ?? undefined,
      })
      navigate('/account', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <ShoppingBag className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>Register to track orders and sell your devices</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Tanaka" {...field} />
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
                        <Input placeholder="Taro" {...field} />
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
                      <Input type="email" placeholder="tanaka@example.com" {...field} />
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
                      <Input type="tel" placeholder="090-1234-5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <p className="text-xs text-muted-foreground">
                Email or phone is required for login.
              </p>

              <AddressForm value={shippingAddress} onChange={setShippingAddress} />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="pin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>6-Digit PIN *</FormLabel>
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
                  name="pin_confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm PIN *</FormLabel>
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

              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground text-center">
            Already have an account?{' '}
            <Link to="/account/login" className="text-primary hover:underline font-medium">
              Sign In
            </Link>
          </p>
          <Link to="/shop" className="text-sm text-muted-foreground hover:text-foreground">
            Back to shop
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
