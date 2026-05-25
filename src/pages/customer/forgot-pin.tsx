import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  forgotPinRequestSchema,
  forgotPinCompleteSchema,
  type ForgotPinRequestFormValues,
  type ForgotPinCompleteFormValues,
} from '@/validators/customer'
import { requestCustomerPinReset, completeCustomerPinReset } from '@/services/customers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { ShoppingBag } from 'lucide-react'

type Step = 'request' | 'verify'

export default function CustomerForgotPinPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('request')
  const [identity, setIdentity] = useState<{ last_name: string; email: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const requestForm = useForm<ForgotPinRequestFormValues>({
    resolver: zodResolver(forgotPinRequestSchema),
    defaultValues: { last_name: '', email: '' },
  })

  const verifyForm = useForm<ForgotPinCompleteFormValues>({
    resolver: zodResolver(forgotPinCompleteSchema),
    defaultValues: { code: '', new_pin: '', confirm_pin: '' },
  })

  async function onRequest(values: ForgotPinRequestFormValues) {
    setError(null)
    try {
      await requestCustomerPinReset(values.last_name, values.email)
    } catch (err) {
      // Server side errors don't block the privacy-preserving step advance.
      console.error(err)
    }
    setIdentity({ last_name: values.last_name, email: values.email })
    setStep('verify')
  }

  async function onVerify(values: ForgotPinCompleteFormValues) {
    if (!identity) return
    setError(null)
    try {
      await completeCustomerPinReset(identity.last_name, identity.email, values.code, values.new_pin)
      toast.success('PIN updated. You can now sign in with your new PIN.')
      navigate('/account/login', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset PIN')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <ShoppingBag className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">Forgot your PIN?</CardTitle>
          <CardDescription>
            {step === 'request'
              ? "Enter your last name and email — we'll send a 6-digit code."
              : `Check ${identity?.email} for a 6-digit code, then set a new PIN.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'request' ? (
            <Form {...requestForm}>
              <form onSubmit={requestForm.handleSubmit(onRequest)} className="space-y-4">
                <FormField
                  control={requestForm.control}
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
                  control={requestForm.control}
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
                <Button type="submit" className="w-full" disabled={requestForm.formState.isSubmitting}>
                  {requestForm.formState.isSubmitting ? 'Sending...' : 'Send Reset Code'}
                </Button>
              </form>
            </Form>
          ) : (
            <Form {...verifyForm}>
              <form onSubmit={verifyForm.handleSubmit(onVerify)} className="space-y-4">
                {error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <FormField
                  control={verifyForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>6-Digit Code</FormLabel>
                      <FormControl>
                        <Input
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
                  control={verifyForm.control}
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
                  control={verifyForm.control}
                  name="confirm_pin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New PIN</FormLabel>
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
                <Button type="submit" className="w-full" disabled={verifyForm.formState.isSubmitting}>
                  {verifyForm.formState.isSubmitting ? 'Setting new PIN...' : 'Set New PIN'}
                </Button>
                <button
                  type="button"
                  onClick={() => { setStep('request'); setError(null); verifyForm.reset() }}
                  className="w-full text-sm text-muted-foreground hover:text-foreground"
                >
                  Use a different email
                </button>
              </form>
            </Form>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Link to="/account/login" className="text-sm text-muted-foreground hover:text-foreground">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
