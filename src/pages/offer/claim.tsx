import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Check, Clock, LogIn, Plus, ShoppingBag, Trash2, UserPlus, X } from 'lucide-react'
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
import { useOfferByCode, useClaimOffer, useAddItemByCode, useAddCustomOfferItem, useRemoveOfferItem } from '@/hooks/use-offers'
import { CONDITION_GRADES } from '@/lib/constants'
import { formatPrice, cn } from '@/lib/utils'
import { serializeAddress } from '@/lib/address-types'
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

// --- Main Claim Page (inner, with auth context available) ---

function OfferClaimInner() {
  const { offerCode } = useParams<{ offerCode: string }>()
  const { data: offer, isLoading, error } = useOfferByCode(offerCode ?? '')
  const claimOffer = useClaimOffer()
  const addItemByCode = useAddItemByCode()
  const addCustomItem = useAddCustomOfferItem()
  const removeItem = useRemoveOfferItem()

  const authState = useCustomerAuthProvider()
  const { customer, isAuthenticated, isLoading: authLoading, login, register, logout } = authState

  const [authStep, setAuthStep] = useState<AuthStep>('choose')
  const [selectedAddress, setSelectedAddress] = useState<{ address: ShippingAddress; careOf?: string | null } | null>(null)
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null)
  const [deliveryTimeCode, setDeliveryTimeCode] = useState<string | null>(null)
  const [orderCreated, setOrderCreated] = useState<{ orderCode: string } | null>(null)
  const [itemCode, setItemCode] = useState('')
  const [showCustomItem, setShowCustomItem] = useState(false)
  const [customDescription, setCustomDescription] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [customQty, setCustomQty] = useState('1')

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

  function handleAddItem() {
    if (!itemCode.trim()) return
    addItemByCode.mutate(
      { offerId: offer!.id, code: itemCode.trim() },
      {
        onSuccess: () => {
          setItemCode('')
          toast.success('Item added!')
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleAddCustomItem() {
    if (!customDescription.trim() || !customPrice) return
    addCustomItem.mutate(
      {
        offerId: offer!.id,
        item: {
          description: customDescription.trim(),
          unit_price: Number(customPrice),
          quantity: Number(customQty) || 1,
        },
        addedBy: 'customer',
      },
      {
        onSuccess: () => {
          setCustomDescription('')
          setCustomPrice('')
          setCustomQty('1')
          setShowCustomItem(false)
          toast.success('Custom item added!')
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleRemoveItem(offerItemId: string) {
    removeItem.mutate(offerItemId, {
      onSuccess: () => toast.success('Item removed'),
      onError: (err) => toast.error(err.message),
    })
  }

  function handleConfirmOrder() {
    if (!selectedAddress) {
      toast.error('Please select a shipping address')
      return
    }

    const addressStr = customer
      ? `${customer.last_name} ${customer.first_name ?? ''}\n${customer.email ?? ''}${customer.phone ? `\n${customer.phone}` : ''}\n${serializeAddress(selectedAddress.address)}`
      : serializeAddress(selectedAddress.address)

    claimOffer.mutate(
      {
        offerId: offer!.id,
        customerId: customer?.id,
        shippingAddress: addressStr,
        deliveryDate: deliveryDate,
        deliveryTimeCode: deliveryTimeCode,
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
      <div className="max-w-2xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingBag className="h-6 w-6" />
              Your Offer — {offer.offer_code}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">from {offer.fb_name}</p>
          </div>
          <CountdownTimer expiresAt={offer.expires_at} />
        </div>

        {/* Items List */}
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {offerItems.map((oi) => {
              const pm = oi.items?.product_models
              const heroMedia = pm?.product_media
                ?.filter(m => m.role === 'hero')
                .sort((a, b) => a.sort_order - b.sort_order)[0]
              const gradeInfo = oi.items ? CONDITION_GRADES.find(g => g.value === oi.items!.condition_grade) : null

              return (
                <div key={oi.id} className="flex items-center gap-4 p-3 border rounded-lg">
                  {heroMedia ? (
                    <img
                      src={heroMedia.file_url}
                      alt={oi.description}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs">
                      No img
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{oi.description}</p>
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
                  <div className="text-right flex items-center gap-2">
                    <span className="font-medium">{formatPrice(Number(oi.unit_price) * oi.quantity)}</span>
                    {oi.added_by === 'customer' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-red-600"
                        onClick={() => handleRemoveItem(oi.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Add item by code */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Input
                placeholder="Add item by P-code or G-code..."
                value={itemCode}
                onChange={e => setItemCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                disabled={addItemByCode.isPending || !itemCode.trim()}
              >
                {addItemByCode.isPending ? '...' : 'Add'}
              </Button>
            </div>

            {/* Add custom item */}
            {showCustomItem ? (
              <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                <Input
                  placeholder="Description (e.g., Mouse 1X)"
                  value={customDescription}
                  onChange={e => setCustomDescription(e.target.value)}
                />
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Price (JPY)"
                    value={customPrice}
                    onChange={e => setCustomPrice(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder="Qty"
                    value={customQty}
                    onChange={e => setCustomQty(e.target.value)}
                    className="w-20"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddCustomItem} disabled={addCustomItem.isPending}>
                    Add Custom Item
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCustomItem(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCustomItem(true)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add custom item
              </button>
            )}
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

            {/* Confirm Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleConfirmOrder}
              disabled={claimOffer.isPending || offerItems.length === 0 || !selectedAddress}
            >
              {claimOffer.isPending ? 'Confirming...' : `Confirm Order — ${formatPrice(total)}`}
            </Button>
          </>
        )}
      </div>
    </CustomerAuthContext.Provider>
  )
}

// --- Exported Page Component ---

export default function OfferClaimPage() {
  return <OfferClaimInner />
}
