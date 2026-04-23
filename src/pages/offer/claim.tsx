import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle, Check, Clock, LogIn, Plus, Search, ShoppingBag, UserPlus, X } from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ShippingStep } from '@/components/orders/shipping-step'
import { CustomerAuthContext, useCustomerAuthProvider } from '@/hooks/use-customer-auth'
import { useOfferByCode, useClaimOffer, useOfferRealtimeSync, useAddItemByCode } from '@/hooks/use-offers'
import { useAvailableAccessories } from '@/hooks/use-accessories'
import { ImageGallery } from '@/components/shared/image-gallery'
import type { GalleryImage } from '@/components/shared/image-gallery'
import { CONDITION_GRADES, PAYMENT_METHODS } from '@/lib/constants'
import { formatPrice, cn } from '@/lib/utils'
import type { ShippingAddress } from '@/lib/address-types'
import type { Customer } from '@/lib/types'

// --- Countdown Timer ---

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const now = new Date()
  const expires = new Date(expiresAt)
  const diffMs = expires.getTime() - now.getTime()

  if (diffMs <= 0) return <span className="text-red-600 font-medium">Expired</span>

  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

  return (
    <span className={cn('font-medium', hours < 6 ? 'text-red-600' : 'text-muted-foreground')}>
      <Clock className="h-4 w-4 inline mr-1" />
      {hours}h {minutes}m remaining
    </span>
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

// --- Offer Item Row Type ---

type OfferItemRow = {
  id: string
  item_id: string | null
  description: string
  unit_price: number
  quantity: number
  added_by: string
  items: {
    id: string
    item_code: string
    condition_grade: string
    product_models: {
      brand: string
      model_name: string
      color: string | null
      product_media: { file_url: string; role: string; sort_order: number }[]
    } | null
  } | null
}

// --- Add Products Dialog ---

function AddProductsDialog({ offerId, addItemByCode }: {
  offerId: string
  addItemByCode: ReturnType<typeof useAddItemByCode>
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data: results, isLoading } = useAvailableAccessories(debouncedSearch)

  const handleAdd = useCallback((code: string) => {
    addItemByCode.mutate(
      { offerId, code },
      {
        onSuccess: () => toast.success(`Added ${code}`),
        onError: (err) => toast.error(err.message),
      },
    )
  }, [offerId, addItemByCode])

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSearch(''); setDebouncedSearch('') } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add More Products
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Products</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or enter an A-code directly"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {!debouncedSearch && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Search by name or enter an A-code directly
              </p>
            )}
            {debouncedSearch && isLoading && (
              <p className="text-sm text-muted-foreground text-center py-4">Searching...</p>
            )}
            {debouncedSearch && !isLoading && results?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No products found</p>
            )}
            {results?.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-2 border rounded-md">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{item.accessory_code}</span>
                    <span>{formatPrice(item.price)}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={addItemByCode.isPending}
                  onClick={() => handleAdd(item.accessory_code)}
                >
                  Add
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// --- Main Claim Page (inner, with auth context available) ---

function OfferClaimInner() {
  const { offerCode } = useParams<{ offerCode: string }>()
  const { data: offer, isLoading, error } = useOfferByCode(offerCode ?? '')
  const claimOffer = useClaimOffer()
  const addItemByCode = useAddItemByCode()

  const authState = useCustomerAuthProvider()
  const { customer, isAuthenticated, isLoading: authLoading, login, register, logout } = authState

  const [authStep, setAuthStep] = useState<AuthStep>('choose')
  const [selectedAddress, setSelectedAddress] = useState<{ address: ShippingAddress; careOf?: string | null } | null>(null)
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null)
  const [deliveryTimeCode, setDeliveryTimeCode] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null)
  const [orderCreated, setOrderCreated] = useState<{ orderCode: string } | null>(null)

  // Subscribe to realtime changes so staff edits appear instantly
  useOfferRealtimeSync(offer?.id)

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-lg text-muted-foreground">Loading offer...</p>
      </div>
    )
  }

  // Error states
  if (error || !offer) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <X className="h-12 w-12 text-muted-foreground mx-auto" />
        <h2 className="text-2xl font-bold">Offer Not Found</h2>
        <p className="text-muted-foreground">This offer link is invalid or no longer exists.</p>
        <Button asChild variant="outline">
          <Link to="/shop">Browse Shop</Link>
        </Button>
      </div>
    )
  }

  if (offer.offer_status === 'EXPIRED') {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <Clock className="h-12 w-12 text-muted-foreground mx-auto" />
        <h2 className="text-2xl font-bold">Offer Expired</h2>
        <p className="text-muted-foreground">This offer has expired. Please contact the seller for a new link.</p>
      </div>
    )
  }

  if (offer.offer_status === 'CLAIMED') {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <Check className="h-12 w-12 text-green-600 mx-auto" />
        <h2 className="text-2xl font-bold">Already Claimed</h2>
        <p className="text-muted-foreground">This offer has already been confirmed as an order.</p>
      </div>
    )
  }

  if (offer.offer_status === 'CANCELLED') {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <X className="h-12 w-12 text-red-600 mx-auto" />
        <h2 className="text-2xl font-bold">Offer Cancelled</h2>
        <p className="text-muted-foreground">This offer has been cancelled by the seller.</p>
      </div>
    )
  }

  if (new Date(offer.expires_at) < new Date()) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <Clock className="h-12 w-12 text-muted-foreground mx-auto" />
        <h2 className="text-2xl font-bold">Offer Expired</h2>
        <p className="text-muted-foreground">This offer has expired. Please contact the seller for a new link.</p>
      </div>
    )
  }

  const offerItems = (offer.offer_items ?? []) as OfferItemRow[]
  const total = offerItems.reduce((sum, oi) => sum + Number(oi.unit_price) * oi.quantity, 0)

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

  function handleConfirmOrder() {
    if (!selectedAddress) {
      toast.error('Please select a shipping address')
      return
    }

    const addressStr = JSON.stringify(selectedAddress.address)

    claimOffer.mutate(
      {
        offerId: offer!.id,
        customerId: customer?.id,
        shippingAddress: addressStr,
        deliveryDate: deliveryDate,
        deliveryTimeCode: deliveryTimeCode,
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                Your Offer — {offer.offer_code}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">from {offer.fb_name}</p>
            </div>
            <CountdownTimer expiresAt={offer.expires_at} />
          </div>

        {/* Items List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Items</CardTitle>
            {offer.offer_status === 'PENDING' && (
              <AddProductsDialog offerId={offer.id} addItemByCode={addItemByCode} />
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {offerItems.map((oi) => {
              const pm = oi.items?.product_models
              const sortedMedia = pm?.product_media
                ?.slice()
                .sort((a, b) => a.sort_order - b.sort_order) ?? []
              const heroMedia = sortedMedia.find(m => m.role === 'hero') ?? sortedMedia[0] ?? null
              const galleryImages: GalleryImage[] = sortedMedia.map(m => ({
                id: m.id,
                url: m.file_url,
                mediaType: m.media_type === 'video' ? 'video' : 'image',
              }))
              const gradeInfo = oi.items ? CONDITION_GRADES.find(g => g.value === oi.items!.condition_grade) : null

              return (
                <div key={oi.id} className="space-y-2 p-3 border rounded-lg">
                  <div className="flex items-center gap-4">
                    {heroMedia ? (
                      <button
                        type="button"
                        className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-primary transition-all"
                        onClick={() => {
                          const dialog = document.getElementById(`lightbox-${oi.id}`) as HTMLDialogElement | null
                          dialog?.showModal()
                        }}
                      >
                        <img
                          src={heroMedia.file_url}
                          alt={oi.description}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs flex-shrink-0">
                        No img
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{oi.description}</p>
                      {pm?.short_description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{pm.short_description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        {oi.items && (
                          <span className="text-xs text-muted-foreground font-mono">{oi.items.item_code}</span>
                        )}
                        {gradeInfo && (
                          <Badge variant="outline" className={cn('text-xs', gradeInfo.color)}>
                            {gradeInfo.value}
                          </Badge>
                        )}
                        {oi.quantity > 1 && (
                          <span className="text-xs text-muted-foreground">&times;{oi.quantity}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-medium">{formatPrice(Number(oi.unit_price) * oi.quantity)}</span>
                    </div>
                  </div>

                  {/* Lightbox dialog */}
                  {galleryImages.length > 0 && (
                    <dialog
                      id={`lightbox-${oi.id}`}
                      className="fixed inset-0 z-50 bg-transparent backdrop:bg-black/80 p-0 m-auto max-w-[95vw] max-h-[95vh] overflow-visible"
                      onClick={(e) => {
                        if (e.target === e.currentTarget) {
                          (e.target as HTMLDialogElement).close()
                        }
                      }}
                    >
                      <div className="relative bg-background rounded-lg p-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 z-10"
                          onClick={() => {
                            const dialog = document.getElementById(`lightbox-${oi.id}`) as HTMLDialogElement | null
                            dialog?.close()
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <ImageGallery images={galleryImages} columns={3} />
                      </div>
                    </dialog>
                  )}
                </div>
              )
            })}

          </CardContent>
        </Card>


        {/* Staff Notes */}
        {offer.notes && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{offer.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Order Summary (always visible) */}
        <div className="border border-primary/20 bg-primary/5 rounded-lg p-4 space-y-2">
          {offerItems.map(oi => (
            <div key={oi.id} className="flex justify-between text-sm">
              <span className="truncate mr-2">{oi.description}{oi.quantity > 1 ? ` ×${oi.quantity}` : ''}</span>
              <span className="shrink-0">{formatPrice(Number(oi.unit_price) * oi.quantity)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-lg border-t pt-2">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>

        {/* Auth + Shipping Flow */}
        {!isAuthenticated ? (
          <>
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
          </>
        ) : (
          <>
            {/* Logged-in indicator */}
            <div className="flex items-center justify-between text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <span className="text-green-800">
                Logged in as <span className="font-medium">{customer!.last_name} {customer!.first_name ?? ''}</span>
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
              if (offerItems.length === 0) missing.push('No items in this offer')
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
              disabled={claimOffer.isPending || offerItems.length === 0 || !selectedAddress || !paymentMethod}
            >
              {claimOffer.isPending ? 'Confirming...' : `Confirm Order — ${formatPrice(total)}`}
            </Button>
          </>
        )}
        </div>

        {/* Footer */}
        <footer className="py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Dealz K.K.
        </footer>
      </div>
    </CustomerAuthContext.Provider>
  )
}

// --- Exported Page Component ---

export default function OfferClaimPage() {
  return <OfferClaimInner />
}
