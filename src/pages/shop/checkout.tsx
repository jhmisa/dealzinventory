import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CustomerAuthContext, useCustomerAuthProvider, useCustomerAuth } from '@/hooks/use-customer-auth'
import { useSellGroup } from '@/hooks/use-sell-groups'
import { useSellGroupByCode } from '@/hooks/use-shop'
import { placeShopOrder } from '@/services/orders'
import { formatPrice } from '@/lib/utils'
import {
  CheckoutShell,
  StepProgress,
  ProductChip,
  PhotoSheet,
  useCheckoutFlow,
  useSellGroupView,
  STEP_LABELS,
  ItemStep,
  AccountStep,
  AddressStep,
  ScheduleStep,
  PaymentStep,
  ReviewStep,
  ConfirmedStep,
} from '@/components/checkout'

function CheckoutInner({ sg, isCode }: { sg: unknown; isCode: boolean }) {
  const navigate = useNavigate()
  const { customer, isAuthenticated } = useCustomerAuth()
  const flow = useCheckoutFlow(isAuthenticated)
  const view = useSellGroupView(sg)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [orderCode, setOrderCode] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)

  if (!view) {
    return (
      <CheckoutShell>
        <p className="py-16 text-center font-brand text-brand-ash">Loading product…</p>
      </CheckoutShell>
    )
  }

  const handleConfirm = async () => {
    if (placing) return
    if (!customer || !flow.data.shippingAddress) {
      toast.error('Missing account or address')
      return
    }
    setPlacing(true)
    try {
      const isOther = flow.data.receiverMode === 'other'
      const result = await placeShopOrder({
        customer_id: customer.id,
        order_source: isCode ? 'LIVE_SELLING' : 'SHOP',
        sell_group_id: (sg as { id: string }).id,
        quantity: flow.data.quantity,
        shipping_address: JSON.stringify(flow.data.shippingAddress),
        delivery_date: flow.data.deliveryDate,
        delivery_time_code: flow.data.deliveryTimeCode,
        payment_method: flow.data.paymentMethod,
        receiver_first_name: isOther ? flow.data.receiverFirstName : null,
        receiver_last_name: isOther ? flow.data.receiverLastName : null,
        receiver_phone: isOther ? flow.data.receiverPhone : null,
      })
      setOrderCode(result.order_code)
      flow.goTo('confirmed')
    } catch (e) {
      toast.error(`Order failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setPlacing(false)
    }
  }

  // Confirmed screen has its own full-bleed layout (no chip/progress).
  // Gate on orderCode alone so a successful order always lands here, even if the
  // step-state update is ever scheduled separately from setOrderCode.
  if (orderCode) {
    return (
      <CheckoutShell>
        <ConfirmedStep
          orderCode={orderCode}
          firstName={customer?.first_name ?? null}
          onTrack={() => navigate('/account/orders')}
          onBackToShop={() => navigate('/shop')}
        />
      </CheckoutShell>
    )
  }

  const showChrome = flow.step !== 'item'
  const chipMeta = `${formatPrice(view.effectiveUnitPrice)} · QTY ${flow.data.quantity}${view.grade ? ` · GRADE ${view.gradeLabel}` : ''}`

  return (
    <CheckoutShell onBack={flow.step === 'item' ? () => navigate(-1) : flow.back}>
      {showChrome && (
        <div className="mb-4 shrink-0 space-y-3">
          <ProductChip
            thumbnailUrl={view.thumbnailUrl}
            name={view.name}
            metaLine={chipMeta}
            onOpen={() => setSheetOpen(true)}
          />
          <StepProgress current={flow.stepNumber} total={flow.totalSteps} label={STEP_LABELS[flow.step].toUpperCase()} />
        </div>
      )}

      {flow.step === 'item' && (
        <ItemStep
          view={view}
          quantity={flow.data.quantity}
          onQuantityChange={(q) => flow.setData({ quantity: q })}
          onProceed={flow.next}
        />
      )}
      {flow.step === 'account' && <AccountStep onAuthed={flow.next} />}
      {flow.step === 'address' && <AddressStep data={flow.data} setData={flow.setData} onContinue={flow.next} />}
      {flow.step === 'schedule' && <ScheduleStep data={flow.data} setData={flow.setData} onContinue={flow.next} />}
      {flow.step === 'payment' && <PaymentStep data={flow.data} setData={flow.setData} onContinue={flow.next} />}
      {flow.step === 'review' && (
        <ReviewStep
          view={view}
          data={flow.data}
          addressLabel={flow.data.selectedAddressLabel ?? 'Address'}
          receiverName={
            flow.data.receiverMode === 'other'
              ? [flow.data.receiverFirstName, flow.data.receiverLastName].filter(Boolean).join(' ')
              : [customer?.first_name, customer?.last_name].filter(Boolean).join(' ')
          }
          onEdit={flow.goTo}
          onConfirm={handleConfirm}
          placing={placing}
        />
      )}

      <PhotoSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        view={view}
        quantity={flow.data.quantity}
        onQuantityChange={(q) => flow.setData({ quantity: q })}
        backLabel={`Back to ${STEP_LABELS[flow.step].toLowerCase()}`}
      />
    </CheckoutShell>
  )
}

// This page serves both /shop/checkout/:sellGroupId and /order/:sellGroupCode.
export default function CheckoutPage() {
  const { sellGroupId, sellGroupCode } = useParams<{ sellGroupId?: string; sellGroupCode?: string }>()
  const authState = useCustomerAuthProvider()
  const { data: sgById } = useSellGroup(sellGroupId ?? '')
  const { data: sgByCode } = useSellGroupByCode(sellGroupCode ?? '')
  const sg = sgById ?? sgByCode

  return (
    <CustomerAuthContext.Provider value={authState}>
      <CheckoutInner sg={sg ?? null} isCode={!!sellGroupCode} />
    </CustomerAuthContext.Provider>
  )
}
