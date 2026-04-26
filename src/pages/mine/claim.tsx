import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, ChevronLeft, ChevronRight, LogIn, Play, ShoppingBag, UserPlus, Video, X } from 'lucide-react'
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
import { CodeInput } from '@/components/mine/code-input'
import { CONDITION_GRADES, PAYMENT_METHODS } from '@/lib/constants'
import { formatPrice, cn, formatCustomerName } from '@/lib/utils'
import type { ShippingAddress } from '@/lib/address-types'
import type { Customer } from '@/lib/types'
import type { GalleryImage } from '@/components/shared/image-gallery'

// --- Product Media Gallery ---

type MediaTab = 'photos' | 'videos'

function ProductMediaGallery({ media }: { media: GalleryImage[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [activeTab, setActiveTab] = useState<MediaTab>('photos')
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const photos = useMemo(() => media.filter(m => m.mediaType !== 'video'), [media])
  const videos = useMemo(() => media.filter(m => m.mediaType === 'video'), [media])
  const hasVideos = videos.length > 0

  const displayed = activeTab === 'photos' ? photos : videos
  const current = displayed[selectedIndex] ?? displayed[0]

  function selectMedia(index: number) {
    setSelectedIndex(index)
  }

  function navigate(dir: 'prev' | 'next') {
    setSelectedIndex(i => {
      if (dir === 'prev') return i > 0 ? i - 1 : displayed.length - 1
      return i < displayed.length - 1 ? i + 1 : 0
    })
  }

  function switchTab(tab: MediaTab) {
    setActiveTab(tab)
    setSelectedIndex(0)
  }

  if (media.length === 0) return null

  return (
    <>
      <div className="space-y-3">
        {/* Tabs */}
        {hasVideos && (
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => switchTab('photos')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                activeTab === 'photos'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Camera className="h-3.5 w-3.5" />
              Photos ({photos.length})
            </button>
            <button
              onClick={() => switchTab('videos')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                activeTab === 'videos'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Video className="h-3.5 w-3.5" />
              Videos ({videos.length})
            </button>
          </div>
        )}

        {/* Hero Image */}
        {current && (
          <div
            className="relative aspect-square rounded-xl overflow-hidden bg-muted cursor-pointer group"
            onClick={() => setLightboxOpen(true)}
          >
            {current.mediaType === 'video' ? (
              <video
                key={current.id}
                src={current.url}
                className="w-full h-full object-contain bg-black"
                controls
                muted
                preload="metadata"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                src={current.url}
                alt={current.alt ?? ''}
                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
              />
            )}
            {/* Nav arrows */}
            {displayed.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate('prev') }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate('next') }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
            {/* Counter pill */}
            {displayed.length > 1 && (
              <div className="absolute bottom-2 right-2 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full">
                {selectedIndex + 1} / {displayed.length}
              </div>
            )}
          </div>
        )}

        {/* Thumbnail strip */}
        {displayed.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {displayed.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => selectMedia(idx)}
                className={cn(
                  'relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all',
                  idx === selectedIndex
                    ? 'border-primary ring-1 ring-primary/30'
                    : 'border-transparent opacity-60 hover:opacity-100'
                )}
              >
                {item.mediaType === 'video' ? (
                  <>
                    <video src={item.url} className="w-full h-full object-cover" muted preload="metadata" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play className="h-3 w-3 text-white fill-white" />
                    </div>
                  </>
                ) : (
                  <img src={item.url} alt="" className="w-full h-full object-cover" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && current && current.mediaType !== 'video' && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(false) }}
          >
            <X className="h-6 w-6" />
          </Button>
          {displayed.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); navigate('prev') }}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); navigate('next') }}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}
          <img
            src={current.url}
            alt={current.alt ?? ''}
            className="max-h-[85vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-4 text-white text-sm">
            {selectedIndex + 1} / {displayed.length}
          </div>
        </div>
      )}
    </>
  )
}

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
  const [loginError, setLoginError] = useState<string | null>(null)
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { last_name: '', email_or_phone: '', pin: '' },
  })

  async function handleSubmit(values: LoginFormValues) {
    setLoginError(null)
    try {
      await onLogin(values.last_name, values.email_or_phone, values.pin)
      onSuccess()
    } catch {
      setLoginError('Wrong email or PIN')
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
            {loginError && (
              <p className="text-sm font-medium text-red-600 text-center">
                Wrong email or PIN. Please try again.
              </p>
            )}
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
  const [registerError, setRegisterError] = useState<string | null>(null)
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { last_name: '', first_name: '', email: '', phone: '', pin: '', pin_confirm: '' },
  })

  async function handleSubmit(values: RegisterFormValues) {
    setRegisterError(null)
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
      const msg = err instanceof Error ? err.message : 'Registration failed'
      setRegisterError(msg)
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
            {registerError && (
              <p className="text-sm font-medium text-red-600 text-center">
                {registerError}
              </p>
            )}
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
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3 | 4>(1)
  const [selectedAddress, setSelectedAddress] = useState<{ address: ShippingAddress; receiverFirstName?: string | null; receiverLastName?: string | null; receiverPhone?: string | null } | null>(null)
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
        <div className="container max-w-2xl mx-auto space-y-5 py-6 px-4 flex-1">
          {/* Logo */}
          <div className="flex justify-center">
            <Link to="/shop" className="flex items-center gap-2 font-bold text-lg">
              <ShoppingBag className="h-5 w-5" />
              Dealz
            </Link>
          </div>

          {/* Product Info + Price + CTA — all up top */}
          <div className="space-y-4">
            {/* Title row */}
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-xl font-bold leading-tight">{product.title}</h1>
                  {product.subtitle && (
                    <p className="text-sm text-muted-foreground mt-0.5">{product.subtitle}</p>
                  )}
                </div>
                <span className="text-xl font-bold shrink-0">{formatPrice(product.price)}</span>
              </div>

              {/* Meta row: code + grade + stock */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground font-mono">{product.code}</span>
                {gradeInfo && (
                  <Badge variant="outline" className={cn('text-xs py-0', gradeInfo.color)}>
                    Grade {gradeInfo.value}
                  </Badge>
                )}
                {product.type === 'sell_group' && product.stockCount !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {product.stockCount} available
                  </span>
                )}
                {product.type === 'accessory' && product.stockCount !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {product.stockCount} in stock
                  </span>
                )}
              </div>
            </div>

            {/* Condition notes */}
            {product.conditionNotes && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">{product.conditionNotes}</p>
            )}

            {/* Unavailable warning */}
            {!product.available && (
              <div className="border border-red-300 bg-red-50 rounded-lg p-3 flex items-center gap-2 text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                <span>This product is currently unavailable.</span>
              </div>
            )}

            {/* Buy Now CTA — only when wizard not started */}
            {!product.available ? (
              <Button className="w-full" size="lg" disabled>
                Unavailable
              </Button>
            ) : !showClaimFlow ? (
              <Button
                className="w-full text-xl font-bold py-7 rounded-xl"
                size="lg"
                onClick={() => {
                  setShowClaimFlow(true)
                  // If already logged in, skip to step 2
                  if (isAuthenticated) setCheckoutStep(2)
                }}
              >
                <ShoppingBag className="h-6 w-6 mr-2" />
                Buy Now — {formatPrice(product.price)}
              </Button>
            ) : null}
          </div>

          {/* Multi-step checkout wizard */}
          {product.available && showClaimFlow && (
            <>
              {/* Step indicator */}
              <div className="flex items-center gap-2">
                {[
                  { step: 1 as const, label: 'Login' },
                  { step: 2 as const, label: 'Address' },
                  { step: 3 as const, label: 'Schedule' },
                  { step: 4 as const, label: 'Payment' },
                ].map(({ step, label }, idx) => {
                  const isCompleted = isAuthenticated
                    ? (step === 1 || step < checkoutStep)
                    : step < checkoutStep
                  const isCurrent = isAuthenticated
                    ? (step === 1 ? false : step === checkoutStep)
                    : step === checkoutStep
                  return (
                    <div key={step} className="flex items-center gap-2 flex-1">
                      <button
                        onClick={() => {
                          if (step === 1 && isAuthenticated) return
                          if (isCompleted && step > 1) setCheckoutStep(step)
                        }}
                        className={cn(
                          'flex items-center gap-1.5 text-sm font-medium transition-colors',
                          isCurrent
                            ? 'text-primary'
                            : isCompleted
                              ? 'text-green-600 cursor-pointer hover:text-green-700'
                              : 'text-muted-foreground'
                        )}
                      >
                        <span className={cn(
                          'flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border-2 transition-colors',
                          isCurrent
                            ? 'border-primary bg-primary text-primary-foreground'
                            : isCompleted
                              ? 'border-green-500 bg-green-500 text-white'
                              : 'border-muted-foreground/30 text-muted-foreground'
                        )}>
                          {isCompleted ? <Check className="h-3 w-3" /> : step}
                        </span>
                        <span className="hidden sm:inline">{label}</span>
                      </button>
                      {idx < 3 && (
                        <div className={cn(
                          'flex-1 h-0.5 rounded-full',
                          isCompleted ? 'bg-green-500' : 'bg-muted'
                        )} />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Step 1: Login / Register */}
              {checkoutStep === 1 && !isAuthenticated && (
                <div className="space-y-4 animate-in fade-in duration-200">
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
                      onSuccess={() => setCheckoutStep(2)}
                      onBack={() => setAuthStep('choose')}
                      isLoading={authLoading}
                      onLogin={login}
                    />
                  )}
                  {authStep === 'register' && (
                    <RegisterForm
                      onSuccess={() => setCheckoutStep(2)}
                      onBack={() => setAuthStep('choose')}
                      isLoading={authLoading}
                      onRegister={register}
                    />
                  )}
                </div>
              )}

              {/* Logged-in indicator (steps 2-4) */}
              {isAuthenticated && checkoutStep >= 2 && (
                <div className="flex items-center justify-between text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                  <span className="text-green-800">
                    Logged in as <span className="font-medium">{formatCustomerName(customer!)}</span>
                    {customer!.email && <span className="text-green-600 ml-1">({customer!.email})</span>}
                  </span>
                  <Button variant="ghost" size="sm" className="text-green-700 hover:text-green-900 h-auto py-1" onClick={logout}>
                    Log out
                  </Button>
                </div>
              )}

              {/* Step 2: Address */}
              {checkoutStep === 2 && isAuthenticated && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <ShippingStep
                    customer={customer as Customer}
                    orderSource="FB"
                    selectedAddress={selectedAddress}
                    onAddressSelect={(addr, receiver) => setSelectedAddress({ address: addr, ...receiver })}
                    deliveryDate={deliveryDate}
                    onDeliveryDateChange={setDeliveryDate}
                    deliveryTimeCode={deliveryTimeCode}
                    onDeliveryTimeCodeChange={setDeliveryTimeCode}
                    hideScheduling
                  />
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => setCheckoutStep(3)}
                    disabled={!selectedAddress}
                  >
                    Next — Select Schedule
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}

              {/* Step 3: Schedule */}
              {checkoutStep === 3 && isAuthenticated && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <ShippingStep
                    customer={customer as Customer}
                    orderSource="FB"
                    selectedAddress={selectedAddress}
                    onAddressSelect={(addr, receiver) => setSelectedAddress({ address: addr, ...receiver })}
                    deliveryDate={deliveryDate}
                    onDeliveryDateChange={setDeliveryDate}
                    deliveryTimeCode={deliveryTimeCode}
                    onDeliveryTimeCodeChange={setDeliveryTimeCode}
                    hideAddress
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setCheckoutStep(2)}
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      className="flex-1"
                      size="lg"
                      onClick={() => setCheckoutStep(4)}
                    >
                      Next — Payment
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: Payment */}
              {checkoutStep === 4 && isAuthenticated && (
                <div className="space-y-4 animate-in fade-in duration-200">
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

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setCheckoutStep(3)}
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      className="flex-1"
                      size="lg"
                      onClick={handleConfirmOrder}
                      disabled={claimMine.isPending || !paymentMethod}
                    >
                      {claimMine.isPending ? 'Confirming...' : `Confirm Order — ${formatPrice(product.price)}`}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Media Gallery */}
          {product.media.length > 0 && (
            <ProductMediaGallery media={product.media} />
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
