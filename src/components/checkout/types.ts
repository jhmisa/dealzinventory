import type { ShippingAddress } from '@/lib/address-types'

// 'item' is the pre-step landing (no number). account→review are STEP 1..5. 'confirmed' is terminal.
export type CheckoutStep =
  | 'item'
  | 'account'
  | 'address'
  | 'schedule'
  | 'payment'
  | 'review'
  | 'confirmed'

// The 5 numbered steps, in order, for the progress bar.
export const NUMBERED_STEPS: CheckoutStep[] = ['account', 'address', 'schedule', 'payment', 'review']

export const STEP_LABELS: Record<CheckoutStep, string> = {
  item: 'Item',
  account: 'Account',
  address: 'Shipping',
  schedule: 'Schedule',
  payment: 'Payment',
  review: 'Review',
  confirmed: 'Confirmed',
}

export interface CheckoutData {
  quantity: number
  selectedAddressId: string | null
  selectedAddressLabel: string | null
  shippingAddress: ShippingAddress | null
  receiverMode: 'me' | 'other'
  receiverFirstName: string
  receiverLastName: string
  receiverPhone: string
  deliveryDate: string | null // 'YYYY-MM-DD'
  deliveryTimeCode: string | null // a YAMATO_TIME_SLOTS code
  paymentMethod: string | null // a SHOP_PAYMENT_METHODS code
}

export const INITIAL_CHECKOUT_DATA: CheckoutData = {
  quantity: 1,
  selectedAddressId: null,
  selectedAddressLabel: null,
  shippingAddress: null,
  receiverMode: 'me',
  receiverFirstName: '',
  receiverLastName: '',
  receiverPhone: '',
  deliveryDate: null,
  deliveryTimeCode: null,
  paymentMethod: null,
}
