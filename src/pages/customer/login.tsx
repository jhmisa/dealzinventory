import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { customerLoginSchema, type CustomerLoginFormValues } from '@/validators/customer'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { ShoppingBag } from 'lucide-react'

export default function CustomerLoginPage() {
  const navigate = useNavigate()
  const { login } = useCustomerAuth()
  const [error, setError] = useState<string | null>(null)

  const form = useForm<CustomerLoginFormValues>({
    resolver: zodResolver(customerLoginSchema),
    defaultValues: { last_name: '', email_or_phone: '', pin: '' },
  })

  async function onSubmit(values: CustomerLoginFormValues) {
    try {
      setError(null)
      await login(values.last_name, values.email_or_phone, values.pin)
      navigate('/account', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <ShoppingBag className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">My Account</CardTitle>
          <CardDescription>Sign in with your name, email/phone, and PIN</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Tanaka" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email_or_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email or Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="tanaka@example.com or 090-1234-5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>6-Digit PIN</FormLabel>
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
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground text-center">
            Don't have an account?{' '}
            <Link to="/account/register" className="text-primary hover:underline font-medium">
              Register
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
