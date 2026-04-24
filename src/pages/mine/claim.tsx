import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle, Check, LogIn, ShoppingBag, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { ShippingStep } from '@/components/orders/shipping-step'
import { CustomerAuthContext, useCustomerAuthProvider } from '@/hooks/use-customer-auth'
import { useClaimableByCode, useClaimMine } from '@/hooks/use-mine'
import { ImageGallery } from '@/components/shared/image-gallery'
import { CodeInput } from '@/components/mine/code-input'
import { CONDITION_GRADES, PAYMENT_METHODS } from '@/lib/constants'
import { formatPrice, cn, formatCustomerName } from '@/lib/utils'
import type { ShippingAddress } from '@/lib/address-types'
import type { Customer } from '@/lib/types'

// --- Auth Step Types ---

type AuthStep = 'choose' | 'login' | 'register'

// --- Login Form ---

const loginSchema = z.object({
  last_name: z.string().min(1, 'Last name is required'),
  email_or_phone: z.string().min(1, 'Email or phone is required'),
  pin: z.string().length(6, 'PIN must be 6 digits'),
})
type LoginFormValues = z.infer<typeof loginSchema>

function LoginForm({ onSuccess, onBack, isLoading, onLogin }: {
  onSuccess: () => void
  onBack: () => void
  isLoading: boolean
  onLogin: (lastName: string, emailOrPhone: string, pin: string) => Promise<void>
}) {
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { last_name: '', email_or_phone: '', pin: '' },
  })

  async function handleSubmit(values: LoginFormValues) {
    try {
      await onLogin(values.last_name, values.email_or_phone, values.pin)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LogIn className="h-5 w-5" />
          Log In
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                    <Input placeholder="you@example.com" {...field} />
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
                      placeholder="••••••"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? 'Logging in...' : 'Log In'}
              </Button>
              <Button type="button" variant="outline" onClick={onBack}>
                Back
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

// --- Register Form ---

const registerSchema = z.object({
  last_name: z.string().min(1, 'Last name is required'),
  first_name: z.string().optional().or(z.literal('')),
  email: z.string().email('Valid email required'),
  phone: z.string().optional().or(z.literal('')),
  pin: z.string().length(6, 'PIN must be 6 digits'),
  pin_confirm: z.string().length(6, 'Confirm your PIN'),
}).refine(d => d.pin === d.pin_confirm, {
  message: 'PINs do not match',
  path: ['pin_confirm'],
})
type RegisterFormValues = z.infer<typeof registerSchema>

function RegisterForm({ onSuccess, onBack, isLoading, onRegister }: {
  onSuccess: () => void
  onBack: () => void
  isLoading: boolean
  onRegister: (params: {
    last_name: string; first_name?: string; email?: string; phone?: string; pin: string
  }) => Promise<void>
}) {
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { last_name: '', first_name: '', email: '', phone: '', pin: '', pin_confirm: '' },
  })

  async function handleSubmit(values: RegisterFormValues) {
    try {
      await onRegister({
        last_name: values.last_name,
        first_name: values.first_name || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
        pin: values.pin,
      })
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Create an Account
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@example.com" {...field} />
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
            </div>
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
                        placeholder="••••••"
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
                        placeholder="••••••"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? 'Creating account...' : 'Create Account'}
              </Button>
              <Button type="button" variant="outline" onClick={onBack}>
                Back
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

// --- Main Mine Claim Page ---

function MineClaimInner() {
  const { code: urlCode } = useParams<{ code: string }>()
  const navigate = useNavigate()

  const [codeInput, setCodeInput] = useState(urlCode ?? '')
  const activeCode = urlCode ?? ''
  const { data: product, isLoading, error } = useClaimableByCode(activeCode)
  const claimMine = useClaimMine()

  const authState = useCustomerAuthProvider()
  const { customer, isAuthenticated, isLoading: authLoading, login, register, logout } = authState

  const [showClaimFlow, setShowClaimFlow] = useState(false)
  const [authStep, setAuthStep] = useState<AuthStep>('choose')
  const [selectedAddress, setSelectedAddress] = useState<{ address: ShippingAddress; careOf?: string | null } | null>(null)
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null)
  const [deliveryTimeCode, setDeliveryTimeCode] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null)
  const [orderCreated, setOrderCreated] = useState<{ orderCode: string } | null>(null)

  // Handle code input completion
  function handleCodeChange(newCode: string) {
    setCodeInput(newCode)
    if (newCode.length === 7) {
      navigate(`/mine/${newCode}`, { replace: true })
    }
  }

  // Order success view
  if (orderCreated) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold">Order Confirmed!</h2>
        <p className="text-muted-foreground">
          Your order <span className="font-mono font-medium">{orderCreated.orderCode}</span> has been placed.
        </p>
        <p className="text-sm text-muted-foreground">
          We'll be in touch to arrange payment and delivery.
        </p>
      </div>
    )
  }

  // Code entry view (no code or invalid)
  if (!activeCode || activeCode.length !== 7) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 space-y-8 px-4">
        <Link to="/shop" className="flex items-center justify-center gap-2 font-bold text-lg">
          <ShoppingBag className="h-5 w-5" />
          Dealz
        </Link>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Enter your product code</h1>
          <p className="text-muted-foreground">Enter the code shared by our staff to view and claim your product.</p>
        </div>
        <div className="flex justify-center">
          <CodeInput value={codeInput} onChange={handleCodeChange} />
        </div>
      </div>
    )
  }

  // Loading
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-lg text-muted-foreground">Loading product...</p>
      </div>
    )
  }

  // Not found
  if (error || !product) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <X className="h-12 w-12 text-muted-foreground mx-auto" />
        <h2 className="text-2xl font-bold">Product Not Found</h2>
        <p className="text-muted-foreground">The code "{activeCode}" doesn't match any product in our system.</p>
        <Button variant="outline" onClick={() => navigate('/mine')}>
          Try Another Code
        </Button>
      </div>
    )
  }

  const gradeInfo = product.grade ? CONDITION_GRADES.find(g => g.value === product.grade) : null

  function handleConfirmOrder() {
    if (!selectedAddress) {
      toast.error('Please select a shipping address')
      return
    }

    const addressStr = JSON.stringify(selectedAddress.address)

    claimMine.mutate(
      {
        code: activeCode,
        customerId: customer!.id,
        shippingAddress: addressStr,
        deliveryDate,
        deliveryTimeCode,
        paymentMethod: paymentMethod ?? undefined,
      },
      {
        onSuccess: (data) => {
          setOrderCreated({ orderCode: data.order_code })
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  return (
    <CustomerAuthContext.Provider value={authState}>
      <div className="min-h-screen bg-background flex flex-col">
        <div className="container max-w-2xl mx-auto space-y-6 py-8 px-4 flex-1">
          {/* Logo */}
          <div className="flex justify-center">
            <Link to="/shop" className="flex items-center gap-2 font-bold text-lg">
              <ShoppingBag className="h-5 w-5" />
              Dealz
            </Link>
          </div>

          {/* Header */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold">{product.title}</h1>
            <p className="text-sm text-muted-foreground font-mono">{product.code}</p>
          </div>

          {/* Product Media */}
          {product.media.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <ImageGallery images={product.media} columns={3} />
              </CardContent>
            </Card>
          )}

          {/* Product Details */}
          <Card>
            <CardContent className="p-4 space-y-3">
              {product.subtitle && (
                <p className="text-sm text-muted-foreground">{product.subtitle}</p>
              )}
              <div className="flex items-center gap-2">
                {gradeInfo && (
                  <Badge variant="outline" className={cn('text-sm', gradeInfo.color)}>
                    Grade {gradeInfo.value}
                  </Badge>
                )}
                {product.type === 'sell_group' && product.stockCount !== undefined && (
                  <span className="text-sm text-muted-foreground">
                    {product.stockCount} available
                  </span>
                )}
                {product.type === 'accessory' && product.stockCount !== undefined && (
                  <span className="text-sm text-muted-foreground">
                    {product.stockCount} in stock
                  </span>
                )}
              </div>
              {product.conditionNotes && (
                <p className="text-sm text-muted-foreground">{product.conditionNotes}</p>
              )}
              {!product.available && (
                <div className="border border-red-300 bg-red-50 rounded-lg p-3 flex items-center gap-2 text-sm text-red-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                  <span>This product is currently unavailable.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Price */}
          <div className="border border-primary/20 bg-primary/5 rounded-lg p-4">
            <div className="flex justify-between font-bold text-lg">
              <span>Price</span>
              <span>{formatPrice(product.price)}</span>
            </div>
          </div>

          {/* Claim / Auth / Checkout Flow */}
          {!product.available ? (
            <Button className="w-full" size="lg" disabled>
              Unavailable
            </Button>
          ) : !isAuthenticated && !showClaimFlow ? (
            <Button
              className="w-full text-lg font-bold py-6"
              size="lg"
              onClick={() => setShowClaimFlow(true)}
            >
              <ShoppingBag className="h-5 w-5 mr-2" />
              Claim Now
            </Button>
          ) : !isAuthenticated ? (
            <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
              {authStep === 'choose' && (
                <Card>
                  <CardContent className="p-6 space-y-3">
                    <p className="text-sm text-muted-foreground text-center">
                      Log in to use a saved address, or create an account to get started.
                    </p>
                    <div className="flex gap-3">
                      <Button
                        className="flex-1"
                        variant="outline"
                        onClick={() => setAuthStep('login')}
                      >
                        <LogIn className="h-4 w-4 mr-2" />
                        I have an account
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => setAuthStep('register')}
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Create an Account
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              {authStep === 'login' && (
                <LoginForm
                  onSuccess={() => {}}
                  onBack={() => setAuthStep('choose')}
                  isLoading={authLoading}
                  onLogin={login}
                />
              )}
              {authStep === 'register' && (
                <RegisterForm
                  onSuccess={() => {}}
                  onBack={() => setAuthStep('choose')}
                  isLoading={authLoading}
                  onRegister={register}
                />
              )}
            </div>
          ) : (
            <>
              {/* Logged-in indicator */}
              <div className="flex items-center justify-between text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                <span className="text-green-800">
                  Logged in as <span className="font-medium">{formatCustomerName(customer!)}</span>
                  {customer!.email && <span className="text-green-600 ml-1">({customer!.email})</span>}
                </span>
                <Button variant="ghost" size="sm" className="text-green-700 hover:text-green-900 h-auto py-1" onClick={logout}>
                  Log out
                </Button>
              </div>

              {/* Shipping Step */}
              <ShippingStep
                customer={customer as Customer}
                orderSource="FB"
                selectedAddress={selectedAddress}
                onAddressSelect={(addr, careOf) => setSelectedAddress({ address: addr, careOf })}
                deliveryDate={deliveryDate}
                onDeliveryDateChange={setDeliveryDate}
                deliveryTimeCode={deliveryTimeCode}
                onDeliveryTimeCodeChange={setDeliveryTimeCode}
              />

              {/* Payment Method */}
              <Card>
                <CardHeader>
                  <CardTitle>Payment Method</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {PAYMENT_METHODS.map((pm) => (
                    <label
                      key={pm.value}
                      className={cn(
                        'flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors',
                        paymentMethod === pm.value
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <input
                        type="radio"
                        name="payment_method"
                        value={pm.value}
                        checked={paymentMethod === pm.value}
                        onChange={() => setPaymentMethod(pm.value)}
                        className="accent-primary"
                      />
                      <span className="text-sm font-medium">{pm.label}</span>
                    </label>
                  ))}
                </CardContent>
              </Card>

              {/* Validation Feedback */}
              {(() => {
                const missing: string[] = []
                if (!selectedAddress) missing.push('Please select a shipping address')
                if (!paymentMethod) missing.push('Please choose a payment method')
                if (missing.length === 0) return null
                return (
                  <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 space-y-1">
                    {missing.map((msg) => (
                      <div key={msg} className="flex items-center gap-2 text-sm text-amber-800">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                        <span>{msg}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* Confirm Button */}
              <Button
                className="w-full"
                size="lg"
                onClick={handleConfirmOrder}
                disabled={claimMine.isPending || !selectedAddress || !paymentMethod}
              >
                {claimMine.isPending ? 'Confirming...' : `Confirm Order — ${formatPrice(product.price)}`}
              </Button>
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="py-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Dealz K.K.
        </footer>
      </div>
    </CustomerAuthContext.Provider>
  )
}

// --- Exported Page Component ---

export default function MineClaimPage() {
  return <MineClaimInner />
}
