import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Check, ShoppingBag } from 'lucide-react'
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
import { AddressForm } from '@/components/shared'
import type { ShippingAddress } from '@/lib/address-types'
import { useSellGroup } from '@/hooks/use-sell-groups'
import { useSellGroupByCode } from '@/hooks/use-shop'
import { useCreateOrder } from '@/hooks/use-orders'
import { CONDITION_GRADES } from '@/lib/constants'
import { formatPrice, cn } from '@/lib/utils'

// Simple checkout form schema (customer creates account inline)
const checkoutSchema = z.object({
  last_name: z.string().min(1, 'Last name is required'),
  first_name: z.string().optional().or(z.literal('')),
  email: z.string().email('Valid email required'),
  phone: z.string().optional().or(z.literal('')),
  quantity: z.coerce.number().int().min(1, 'At least 1'),
})

type CheckoutFormValues = z.infer<typeof checkoutSchema>

// This page works for both /shop/checkout/:sellGroupId and /order/:sellGroupCode
export default function CheckoutPage() {
  const { sellGroupId, sellGroupCode } = useParams<{ sellGroupId?: string; sellGroupCode?: string }>()
  const navigate = useNavigate()

  // Use id-based or code-based lookup depending on route
  const { data: sgById } = useSellGroup(sellGroupId ?? '')
  const { data: sgByCode } = useSellGroupByCode(sellGroupCode ?? '')
  const sg = sgById ?? sgByCode

  const createOrderMutation = useCreateOrder()
  const [orderCreated, setOrderCreated] = useState<{ orderCode: string } | null>(null)
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null)

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      last_name: '',
      first_name: '',
      email: '',
      phone: '',
      quantity: 1,
    },
  })

  if (!sg) {
    if (sellGroupId || sellGroupCode) {
      return (
        <div className="text-center py-16">
          <p className="text-lg text-muted-foreground">Loading product...</p>
        </div>
      )
    }
    return (
      <div className="text-center py-16">
        <p className="text-lg text-muted-foreground">Product not found.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/shop">Back to Shop</Link>
        </Button>
      </div>
    )
  }

  const pm = sg.product_models as {
    brand: string; model_name: string
    cpu: string | null; ram_gb: number | null; storage_gb: number | null
  } | null
  const gradeInfo = CONDITION_GRADES.find(g => g.value === sg.condition_grade)
  const stockCount = (sg as { sell_group_items?: { count: number }[] }).sell_group_items?.[0]?.count ?? 0

  const watchQuantity = form.watch('quantity')
  const totalPrice = Number(sg.base_price) * (watchQuantity || 1)

  // Order success view
  if (orderCreated) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold">Order Placed!</h2>
        <p className="text-muted-foreground">
          Your order <span className="font-mono font-medium">{orderCreated.orderCode}</span> has been received.
        </p>
        <p className="text-sm text-muted-foreground">
          We'll confirm your order shortly. You can track your order status in My Account.
        </p>
        <Button asChild>
          <Link to="/shop">Continue Shopping</Link>
        </Button>
      </div>
    )
  }

  async function handleSubmit(values: CheckoutFormValues) {
    if (!shippingAddress) {
      toast.error('Shipping address is required')
      return
    }
    // For this MVP, we create the order directly without a separate customer auth flow.
    // In production, the customer-auth Edge Function would handle login/registration.
    // Here we create a placeholder order that admin can process.
    createOrderMutation.mutate(
      {
        customer_id: '00000000-0000-0000-0000-000000000000', // Placeholder — real flow uses customer-auth
        sell_group_id: sg!.id,
        order_source: sellGroupCode ? 'LIVE_SELLING' : 'SHOP',
        shipping_address: JSON.stringify(shippingAddress),
        quantity: values.quantity,
        total_price: Number(sg!.base_price) * values.quantity,
      },
      {
        onSuccess: (order) => {
          setOrderCreated({ orderCode: order.order_code })
        },
        onError: (err) => toast.error(`Order failed: ${err.message}`),
      },
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      <h1 className="text-2xl font-bold flex items-center gap-2">
        <ShoppingBag className="h-6 w-6" />
        Checkout
      </h1>

      {/* Product Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h3 className="font-semibold">
                {pm ? `${pm.brand} ${pm.model_name}` : sg.sell_group_code}
              </h3>
              <p className="text-sm text-muted-foreground">
                {pm?.short_description ?? ''}
              </p>
            </div>
            <div className="text-right">
              {gradeInfo && (
                <Badge variant="outline" className={cn('text-xs', gradeInfo.color)}>
                  Grade {gradeInfo.value}
                </Badge>
              )}
              <p className="text-lg font-bold mt-1">{formatPrice(Number(sg.base_price))}</p>
              <p className="text-xs text-muted-foreground">{stockCount} in stock</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Checkout Form */}
      <Card>
        <CardHeader>
          <CardTitle>Your Details</CardTitle>
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

              <AddressForm value={shippingAddress} onChange={setShippingAddress} required />

              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={stockCount || 1}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Order Summary */}
              <div className="border border-primary/20 bg-primary/5 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Unit price</span>
                  <span>{formatPrice(Number(sg.base_price))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Quantity</span>
                  <span>&times; {watchQuantity || 1}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total</span>
                  <span>{formatPrice(totalPrice)}</span>
                </div>
              </div>

              {stockCount === 0 && (
                <p className="text-sm text-destructive text-center">
                  This item is currently out of stock and cannot be ordered.
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={createOrderMutation.isPending || stockCount === 0}
              >
                {createOrderMutation.isPending ? 'Placing Order...' : `Place Order — ${formatPrice(totalPrice)}`}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
