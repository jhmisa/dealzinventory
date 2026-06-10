# Checkout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-page customer checkout (`src/pages/shop/checkout.tsx`, served at both `/order/:sellGroupCode` and `/shop/checkout/:sellGroupId`) with a mobile, brand-styled, one-decision-per-screen multi-step flow faithful to the Paper "Dealz-Order" mockups, without changing any existing order-creation behavior.

**Architecture:** `checkout.tsx` becomes a thin orchestrator that mounts a `CustomerAuthProvider` and a `useCheckoutFlow` state machine, rendering one step view at a time inside a brand-scoped shell. Shared primitives (`StepProgress`, `SelectableCard`, `StickyCta`, `ProductChip`, `MediaGallery`, `PhotoSheet`, `AddressCard`) live in `src/components/checkout/`. The only backend change is additive: persist `payment_method` on order creation. Money math, shipping, and item reservation are untouched (the working webapp is the source of truth).

**Tech Stack:** React 18 + TypeScript (strict), Vite, Tailwind v4 (brand tokens already in `src/index.css` `@theme`), TanStack Query, existing `useCustomerAuth`, `AddressForm`, `createManualOrder`.

**Verification model:** This project has **no test runner** — verification per task is `npm run build` (tsc typecheck) + `npm run lint`, plus visual comparison against the named Paper artboard. Do **not** invent a test framework.

**Design spec:** `docs/superpowers/specs/2026-06-10-checkout-redesign-design.md` (read it first).
**Visual source of truth:** Paper file `01KTQMN7R5SPG1C5MQ56V97PP9` ("Dealz-Order"), artboards named per step. Match layout/spacing/colors to the artboards; the design spec §7 lists the exact selected-state recipe and palette.

---

## File Structure

| Path | Responsibility | New/Modify |
|------|----------------|-----------|
| `src/lib/constants.ts` | Add `SHOP_PAYMENT_METHODS` constant | Modify |
| `src/services/orders.ts` | Add `payment_method` to `ManualOrderInput` + insert | Modify |
| `src/components/checkout/types.ts` | `CheckoutStep`, `CheckoutData` types | New |
| `src/components/checkout/use-checkout-flow.ts` | Step state machine + collected data + CTA gating | New |
| `src/components/checkout/checkout-shell.tsx` | Brand top bar + Paper background wrapper | New |
| `src/components/checkout/step-progress.tsx` | 5-segment progress bar + "STEP n OF 5" | New |
| `src/components/checkout/selectable-card.tsx` | Reusable selectable row (selected recipe) | New |
| `src/components/checkout/sticky-cta.tsx` | Bottom-pinned CTA (ink/ash) | New |
| `src/components/checkout/media-gallery.tsx` | Photos/Videos tabs + swipe + thumbnails | New |
| `src/components/checkout/product-chip.tsx` | Compact product chip → opens PhotoSheet | New |
| `src/components/checkout/photo-sheet.tsx` | Bottom-sheet media overlay over a step | New |
| `src/components/checkout/address-card.tsx` | Saved-address card (EN + kanji, big→small) | New |
| `src/components/checkout/steps/item-step.tsx` | Landing / product showcase | New |
| `src/components/checkout/steps/account-step.tsx` | Inline sign-in + register | New |
| `src/components/checkout/steps/address-step.tsx` | Saved addresses + add-new + receiver | New |
| `src/components/checkout/steps/schedule-step.tsx` | Date + Yamato time slots | New |
| `src/components/checkout/steps/payment-step.tsx` | Payment method cards + info fee badges | New |
| `src/components/checkout/steps/review-step.tsx` | Summary + confirm → createManualOrder | New |
| `src/components/checkout/steps/confirmed-step.tsx` | Branded success screen | New |
| `src/components/checkout/index.ts` | Barrel export | New |
| `src/pages/shop/checkout.tsx` | Thin orchestrator (rewrite) | Modify |

**Convention reminders (from CLAUDE.md):** kebab-case files, PascalCase components, no `any`, no inline styles (Tailwind only — arbitrary values like `bg-[#FAF4EA]` are allowed where a token doesn't exist), functional components, barrel `index.ts` per folder.

---

## Task 1: Add payment method constant + persist `payment_method` on orders

**Files:**
- Modify: `src/lib/constants.ts` (append near `YAMATO_TIME_SLOTS`, ~line 171)
- Modify: `src/services/orders.ts:363-411` (`ManualOrderInput` + insert in `createManualOrder`)

- [ ] **Step 1: Add the payment methods constant**

Append to `src/lib/constants.ts` after the `YAMATO_TIME_SLOTS` block:

```ts
// Shop checkout payment methods. `fee` is INFORMATIONAL ONLY — surcharges are not
// computed at checkout; staff apply the CC surcharge later (see orders.addCreditCardSurcharge).
export const SHOP_PAYMENT_METHODS = [
  { code: 'BANK_TRANSFER', label: 'Bank Transfer', sublabel: '振込', fee: 'NO FEE' },
  { code: 'COD', label: 'Cash on Delivery', sublabel: '代引き', fee: 'NO FEE' },
  { code: 'CREDIT_CARD', label: 'Credit Card', sublabel: 'VISA · MASTER · JCB', fee: '+4%' },
  { code: 'KONBINI', label: 'Konbini', sublabel: 'コンビニ', fee: 'NO FEE' },
  { code: 'PAYPAL', label: 'PayPal', sublabel: 'PAY IN USD / JPY', fee: '+5%' },
] as const

export type ShopPaymentMethodCode = (typeof SHOP_PAYMENT_METHODS)[number]['code']
```

- [ ] **Step 2: Add `payment_method` to `ManualOrderInput`**

In `src/services/orders.ts`, in `interface ManualOrderInput` (starts line 363), add after `receiver_phone?`:

```ts
  payment_method?: string | null
```

- [ ] **Step 3: Persist it in the insert**

In `createManualOrder`, in the `.insert({ ... })` object (around line 396-411), add after `receiver_phone:`:

```ts
      payment_method: input.payment_method ?? null,
```

- [ ] **Step 4: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: build succeeds, no new lint errors. (`useCreateManualOrder` in `src/hooks/use-orders.ts` passes input straight through, so no hook change is needed.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/constants.ts src/services/orders.ts
git commit -m "feat(checkout): persist payment_method on manual orders + add payment method constant"
```

---

## Task 2: Checkout types + flow state machine

**Files:**
- Create: `src/components/checkout/types.ts`
- Create: `src/components/checkout/use-checkout-flow.ts`

- [ ] **Step 1: Create `types.ts`**

```ts
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
  shippingAddress: null,
  receiverMode: 'me',
  receiverFirstName: '',
  receiverLastName: '',
  receiverPhone: '',
  deliveryDate: null,
  deliveryTimeCode: null,
  paymentMethod: null,
}
```

- [ ] **Step 2: Create `use-checkout-flow.ts`**

```ts
import { useCallback, useMemo, useState } from 'react'
import type { CheckoutData, CheckoutStep } from './types'
import { INITIAL_CHECKOUT_DATA, NUMBERED_STEPS } from './types'

interface UseCheckoutFlow {
  step: CheckoutStep
  data: CheckoutData
  /** 1-based index for the progress bar (0 on the 'item' landing). */
  stepNumber: number
  totalSteps: number
  setData: (patch: Partial<CheckoutData>) => void
  goTo: (step: CheckoutStep) => void
  /** Advance to the next step in the canonical order, skipping 'account' when authed. */
  next: () => void
  back: () => void
}

const ORDER: CheckoutStep[] = ['item', 'account', 'address', 'schedule', 'payment', 'review', 'confirmed']

export function useCheckoutFlow(isAuthenticated: boolean): UseCheckoutFlow {
  const [step, setStep] = useState<CheckoutStep>('item')
  const [data, setRawData] = useState<CheckoutData>(INITIAL_CHECKOUT_DATA)
  const [history, setHistory] = useState<CheckoutStep[]>([])

  const setData = useCallback((patch: Partial<CheckoutData>) => {
    setRawData((prev) => ({ ...prev, ...patch }))
  }, [])

  const goTo = useCallback((target: CheckoutStep) => {
    setStep((current) => {
      setHistory((h) => [...h, current])
      return target
    })
  }, [])

  const next = useCallback(() => {
    setStep((current) => {
      const idx = ORDER.indexOf(current)
      let nextStep = ORDER[Math.min(idx + 1, ORDER.length - 1)]
      // Logged-in users skip the Account step entirely.
      if (nextStep === 'account' && isAuthenticated) nextStep = 'address'
      setHistory((h) => [...h, current])
      return nextStep
    })
  }, [isAuthenticated])

  const back = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      setStep(prev)
      return h.slice(0, -1)
    })
  }, [])

  const stepNumber = useMemo(() => {
    const i = NUMBERED_STEPS.indexOf(step)
    return i === -1 ? 0 : i + 1
  }, [step])

  return { step, data, stepNumber, totalSteps: NUMBERED_STEPS.length, setData, goTo, next, back }
}
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS. (Files are not yet imported anywhere; this confirms they compile.)

- [ ] **Step 4: Commit**

```bash
git add src/components/checkout/types.ts src/components/checkout/use-checkout-flow.ts
git commit -m "feat(checkout): add checkout flow types and step state machine"
```

---

## Task 3: Shared primitive — StepProgress

**Files:**
- Create: `src/components/checkout/step-progress.tsx`

Artboard reference: the bar + "STEP n OF 5 · NAME" line under the product chip on steps 2–5.

- [ ] **Step 1: Create the component**

```tsx
import { cn } from '@/lib/utils'

interface StepProgressProps {
  /** 1-based current step number (1..total). */
  current: number
  total: number
  /** UPPERCASE step name, e.g. "SHIPPING". */
  label: string
}

export function StepProgress({ current, total, label }: StepProgressProps) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => {
          const index = i + 1
          const filled = index < current
          const isCurrent = index === current
          return (
            <div
              key={index}
              className={cn(
                'h-1 flex-1 rounded-full',
                filled && 'bg-brand-ink',
                isCurrent && 'bg-brand-ink',
                !filled && !isCurrent && 'bg-brand-ash/35',
              )}
            />
          )
        })}
      </div>
      <p className="font-data text-[11px] uppercase tracking-[0.12em] text-brand-umber">
        <span className="text-brand-signal">●</span> Step {current} of {total} · {label}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/checkout/step-progress.tsx
git commit -m "feat(checkout): add StepProgress primitive"
```

---

## Task 4: Shared primitive — SelectableCard

**Files:**
- Create: `src/components/checkout/selectable-card.tsx`

Implements the spec §7 selected-state recipe: cream fill `#FAF4EA`, faint border `#EADFCB`, soft lift, signal-red radio dot + check + "SELECTED" label. No dark borders.

- [ ] **Step 1: Create the component**

```tsx
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SelectableCardProps {
  selected: boolean
  onSelect: () => void
  /** Show the small red "SELECTED" label + check when selected (default true). */
  showSelectedLabel?: boolean
  className?: string
  children: React.ReactNode
}

export function SelectableCard({
  selected,
  onSelect,
  showSelectedLabel = true,
  className,
  children,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition',
        'min-h-[44px]',
        selected
          ? 'border-[#EADFCB] bg-[#FAF4EA] shadow-[0_8px_22px_rgba(22,20,15,0.09)]'
          : 'border-brand-ash/40 bg-white hover:border-brand-ash/70',
        className,
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-brand-signal' : 'border-brand-ash',
        )}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand-signal" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {selected && showSelectedLabel && (
        <span className="ml-auto flex shrink-0 items-center gap-1 text-brand-signal">
          <Check className="h-4 w-4" />
        </span>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/checkout/selectable-card.tsx
git commit -m "feat(checkout): add SelectableCard primitive"
```

---

## Task 5: Shared primitive — StickyCta

**Files:**
- Create: `src/components/checkout/sticky-cta.tsx`

Bottom-pinned CTA. Ink fill when enabled, Ash fill when disabled (never ambiguous grey-on-grey). Optional secondary text button underneath (e.g. "Cancel", "I already have an account").

- [ ] **Step 1: Create the component**

```tsx
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StickyCtaProps {
  label: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  showArrow?: boolean
  /** Optional secondary action rendered as a plain text button below the CTA. */
  secondary?: { label: string; onClick: () => void }
}

export function StickyCta({
  label,
  onClick,
  disabled = false,
  loading = false,
  showArrow = true,
  secondary,
}: StickyCtaProps) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-6 bg-gradient-to-t from-brand-paper via-brand-paper to-transparent px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className={cn(
          'flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl font-brand text-base font-semibold transition',
          disabled
            ? 'cursor-not-allowed bg-brand-ash text-white/90'
            : 'bg-brand-ink text-brand-paper hover:opacity-95',
        )}
      >
        {loading ? 'Please wait…' : label}
        {!loading && showArrow && !disabled && <ArrowRight className="h-4 w-4" />}
      </button>
      {secondary && (
        <button
          type="button"
          onClick={secondary.onClick}
          className="mt-2 h-11 w-full font-brand text-sm font-medium text-brand-umber hover:text-brand-ink"
        >
          {secondary.label}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/checkout/sticky-cta.tsx
git commit -m "feat(checkout): add StickyCta primitive"
```

---

## Task 6: Shared primitive — MediaGallery

**Files:**
- Create: `src/components/checkout/media-gallery.tsx`

Photos/Videos tabs, large viewer, counter, thumbnail strip, active-thumb red ring, "TESTED LIVE" tag on video. Consumes a normalized media list.

- [ ] **Step 1: Define the media item shape + component**

```tsx
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageIcon, Play, Video as VideoIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CheckoutMedia {
  url: string
  type: 'image' | 'video'
}

interface MediaGalleryProps {
  media: CheckoutMedia[]
  /** Compact = used inside the photo sheet; full = used on the Item landing. */
  variant?: 'full' | 'sheet'
}

export function MediaGallery({ media, variant = 'full' }: MediaGalleryProps) {
  const [tab, setTab] = useState<'photos' | 'videos'>('photos')
  const photos = useMemo(() => media.filter((m) => m.type === 'image'), [media])
  const videos = useMemo(() => media.filter((m) => m.type === 'video'), [media])
  const list = tab === 'photos' ? photos : videos
  const [index, setIndex] = useState(0)
  const active = list[index] ?? list[0]

  const switchTab = (t: 'photos' | 'videos') => {
    setTab(t)
    setIndex(0)
  }

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-2 rounded-2xl bg-brand-ash/15 p-1">
        <button
          type="button"
          onClick={() => switchTab('photos')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-2 font-brand text-sm font-semibold transition',
            tab === 'photos' ? 'bg-white text-brand-ink shadow-sm' : 'text-brand-umber',
          )}
        >
          <ImageIcon className="h-4 w-4" /> Photos <span className="font-data text-xs">{photos.length}</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab('videos')}
          disabled={videos.length === 0}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-2 font-brand text-sm font-semibold transition disabled:opacity-40',
            tab === 'videos' ? 'bg-white text-brand-ink shadow-sm' : 'text-brand-umber',
          )}
        >
          <VideoIcon className="h-4 w-4" /> Videos <span className="font-data text-xs">{videos.length}</span>
        </button>
      </div>

      {/* Viewer */}
      <div className={cn('relative overflow-hidden rounded-2xl bg-brand-ash/15', variant === 'full' ? 'aspect-square' : 'aspect-[4/3]')}>
        {tab === 'videos' && (
          <span className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 font-data text-[10px] uppercase tracking-wider text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-signal" /> Tested Live
          </span>
        )}
        {active ? (
          active.type === 'image' ? (
            <img src={active.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="relative h-full w-full">
              <video src={active.url} className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/85">
                  <Play className="h-6 w-6 fill-brand-ink text-brand-ink" />
                </span>
              </span>
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-brand-ash">No media</div>
        )}

        {list.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + list.length) % list.length)}
              className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow"
            >
              <ChevronLeft className="h-4 w-4 text-brand-ink" />
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % list.length)}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow"
            >
              <ChevronRight className="h-4 w-4 text-brand-ink" />
            </button>
            <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 font-data text-[11px] text-white">
              <ImageIcon className="h-3 w-3" /> {index + 1} / {list.length}
            </span>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {list.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map((m, i) => (
            <button
              key={`${m.url}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                'h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-brand-ash/20',
                i === index ? 'ring-2 ring-brand-signal' : 'ring-1 ring-brand-ash/30',
              )}
            >
              {m.type === 'image' ? (
                <img src={m.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Play className="h-4 w-4 fill-brand-ink text-brand-ink" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/checkout/media-gallery.tsx
git commit -m "feat(checkout): add MediaGallery primitive"
```

---

## Task 7: Shared primitives — ProductChip + PhotoSheet

**Files:**
- Create: `src/components/checkout/photo-sheet.tsx`
- Create: `src/components/checkout/product-chip.tsx`

PhotoSheet overlays the current step (preserves progress); ProductChip is the tappable compact summary shown on steps 2–5 that opens it.

- [ ] **Step 1: Create `photo-sheet.tsx`**

```tsx
import { X } from 'lucide-react'
import { MediaGallery, type CheckoutMedia } from './media-gallery'

interface PhotoSheetProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string // e.g. "P000315 · GRADE B · ¥16,900"
  media: CheckoutMedia[]
  backLabel: string // e.g. "Back to shipping"
}

export function PhotoSheet({ open, onClose, title, subtitle, media, backLabel }: PhotoSheetProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[88vh] overflow-y-auto rounded-t-3xl bg-brand-paper px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-brand-ash/40" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-brand text-lg font-bold text-brand-ink">{title}</h2>
            <p className="font-data text-xs uppercase tracking-wider text-brand-umber">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-ash/20"
          >
            <X className="h-4 w-4 text-brand-ink" />
          </button>
        </div>
        <MediaGallery media={media} variant="sheet" />
        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-[52px] w-full rounded-2xl bg-brand-ink font-brand text-base font-semibold text-brand-paper"
        >
          {backLabel}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `product-chip.tsx`**

```tsx
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProductChipProps {
  thumbnailUrl: string | null
  name: string
  metaLine: string // e.g. "¥16,900 · QTY 1 · GRADE B"
  onOpen: () => void
}

export function ProductChip({ thumbnailUrl, name, metaLine, onOpen }: ProductChipProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm"
    >
      <span className={cn('h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-brand-ash/20')}>
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-brand text-sm font-semibold text-brand-ink">{name}</span>
        <span className="block truncate font-data text-xs uppercase tracking-wider text-brand-umber">
          {metaLine}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-brand-ash" />
    </button>
  )
}
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/checkout/photo-sheet.tsx src/components/checkout/product-chip.tsx
git commit -m "feat(checkout): add ProductChip + PhotoSheet primitives"
```

---

## Task 8: Shared primitive — AddressCard + CheckoutShell

**Files:**
- Create: `src/components/checkout/address-card.tsx`
- Create: `src/components/checkout/checkout-shell.tsx`

AddressCard renders a saved `CustomerAddress` using the existing `serializeAddress` helper (EN primary + kanji secondary, both already big→small). CheckoutShell is the brand top bar + Paper background.

- [ ] **Step 1: Create `address-card.tsx`**

```tsx
import type { CustomerAddress } from '@/lib/types'
import type { ShippingAddress } from '@/lib/address-types'
import { serializeAddress } from '@/lib/address-types'
import { SelectableCard } from './selectable-card'

interface AddressCardProps {
  address: CustomerAddress
  /** Display label, e.g. "Address 1" (computed by the caller from list order). */
  displayLabel: string
  selected: boolean
  onSelect: () => void
}

export function AddressCard({ address, displayLabel, selected, onSelect }: AddressCardProps) {
  // `address.address` is the structured ShippingAddress stored as JSON.
  const addr = address.address as unknown as ShippingAddress
  const en = serializeAddress(addr, 'en')
  const ja = serializeAddress(addr, 'ja')
  return (
    <SelectableCard selected={selected} onSelect={onSelect}>
      <span className="mb-1 flex items-center gap-2">
        <span className="font-brand text-base font-bold text-brand-ink">{displayLabel}</span>
        {selected && (
          <span className="font-data text-[10px] uppercase tracking-wider text-brand-signal">Selected</span>
        )}
      </span>
      <span className="block whitespace-pre-line font-brand text-sm leading-snug text-brand-umber">{en}</span>
      <span className="mt-1 block whitespace-pre-line font-data text-xs leading-snug text-brand-ash">{ja}</span>
    </SelectableCard>
  )
}
```

> Note: `SelectableCard` already renders the radio + check; here we also surface a "Selected" word to match the artboard. Keep `showSelectedLabel` default — the check at the row's trailing edge plus this word both appear, exactly as in the "2 · Address" artboard.

- [ ] **Step 2: Create `checkout-shell.tsx`**

```tsx
import { ChevronLeft, HelpCircle } from 'lucide-react'
import { DealzWordmark } from '@/components/marketing/dealz-logo'

interface CheckoutShellProps {
  onBack?: () => void
  children: React.ReactNode
}

export function CheckoutShell({ onBack, children }: CheckoutShellProps) {
  return (
    <div className="min-h-dvh bg-brand-paper font-brand text-brand-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col px-5">
        <header className="flex items-center justify-between py-3">
          <button
            type="button"
            onClick={onBack}
            disabled={!onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm disabled:opacity-0"
          >
            <ChevronLeft className="h-5 w-5 text-brand-ink" />
          </button>
          <DealzWordmark className="text-xl" />
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
            <HelpCircle className="h-5 w-5 text-brand-ash" />
          </span>
        </header>
        <main className="flex flex-1 flex-col pb-2">{children}</main>
      </div>
    </div>
  )
}
```

> Before writing Step 2, open `src/components/marketing/dealz-logo.tsx` to confirm the export name (`DealzWordmark`) and that it accepts a `className`. If the prop differs, adapt the usage; do not change the logo component.

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS. If `DealzWordmark` import fails, fix the import per the logo component's actual export and re-run.

- [ ] **Step 4: Commit**

```bash
git add src/components/checkout/address-card.tsx src/components/checkout/checkout-shell.tsx
git commit -m "feat(checkout): add AddressCard + CheckoutShell"
```

---

## Task 9: Barrel export + selectable helpers

**Files:**
- Create: `src/components/checkout/index.ts`

- [ ] **Step 1: Create the barrel**

```ts
export { useCheckoutFlow } from './use-checkout-flow'
export * from './types'
export { CheckoutShell } from './checkout-shell'
export { StepProgress } from './step-progress'
export { SelectableCard } from './selectable-card'
export { StickyCta } from './sticky-cta'
export { MediaGallery, type CheckoutMedia } from './media-gallery'
export { ProductChip } from './product-chip'
export { PhotoSheet } from './photo-sheet'
export { AddressCard } from './address-card'
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/checkout/index.ts
git commit -m "feat(checkout): add checkout components barrel"
```

---

## Task 10: Derive a shared sell-group view model

**Files:**
- Create: `src/components/checkout/use-sell-group-view.ts`

A single hook the orchestrator and steps share to extract the display fields and media from a sell group, so the extraction logic isn't duplicated. This wraps the existing data (it does not fetch).

- [ ] **Step 1: Inspect the source shape**

Read `src/hooks/use-shop.ts` (`useSellGroupByCode`, ~line 43) and `src/hooks/use-sell-groups.ts` (`useSellGroup`). Confirm the selected columns include, on `product_models`: `brand, model_name, short_description` and `product_media(file_url, media_type, role, sort_order)`; and on `sell_group_items.items`: `item_code, item_status, condition_grade, selling_price`. **If `product_media` is missing `media_type`, or `items.item_code` is absent, extend the `.select(...)` string in that hook to include them** (additive only — do not remove fields). Re-run `npm run build` after any select change.

- [ ] **Step 2: Create the view-model hook**

```ts
import { useMemo } from 'react'
import type { CheckoutMedia } from './media-gallery'
import { CONDITION_GRADES } from '@/lib/constants'

// Loose shapes — the sell group comes from a generated Supabase type; we read defensively.
interface SgLike {
  sell_group_code?: string
  condition_grade?: string | null
  discount_amount?: number | null
  product_models?: {
    brand?: string
    model_name?: string
    short_description?: string | null
    product_media?: Array<{ file_url: string; media_type?: string | null; role?: string | null; sort_order?: number | null }>
  } | null
  sell_group_items?: Array<{
    items: { item_code?: string; item_status?: string; condition_grade?: string | null; selling_price?: number | null } | null
  }>
}

export interface SellGroupView {
  name: string
  shortDescription: string
  grade: string | null
  gradeLabel: string
  unitPrice: number
  discountAmount: number
  effectiveUnitPrice: number
  stockCount: number
  primaryItemCode: string
  media: CheckoutMedia[]
  thumbnailUrl: string | null
}

export function useSellGroupView(sg: unknown | null | undefined): SellGroupView | null {
  return useMemo(() => {
    if (!sg) return null
    const s = sg as SgLike
    const pm = s.product_models ?? null
    const name = pm ? `${pm.brand ?? ''} ${pm.model_name ?? ''}`.trim() : s.sell_group_code ?? 'Item'
    const items = s.sell_group_items ?? []
    const available = items.filter(
      (i) => i.items?.item_status === 'AVAILABLE' && i.items?.condition_grade !== 'J',
    )
    const stockCount = available.length
    const unitPrice = Number(items.map((i) => i.items?.selling_price).find((p) => p != null) ?? 0)
    const discountAmount = Number(s.discount_amount ?? 0)
    const grade = s.condition_grade ?? null
    const gradeLabel = CONDITION_GRADES.find((g) => g.value === grade)?.value ?? (grade ?? '—')
    const primaryItemCode = available[0]?.items?.item_code ?? s.sell_group_code ?? ''

    const media: CheckoutMedia[] = (pm?.product_media ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((m) => ({ url: m.file_url, type: m.media_type === 'video' || m.role === 'video' ? 'video' : 'image' }))
    const thumbnailUrl = media.find((m) => m.type === 'image')?.url ?? null

    return {
      name,
      shortDescription: pm?.short_description ?? '',
      grade,
      gradeLabel,
      unitPrice,
      discountAmount,
      effectiveUnitPrice: Math.max(0, unitPrice - discountAmount),
      stockCount,
      primaryItemCode,
      media,
      thumbnailUrl,
    }
  }, [sg])
}
```

- [ ] **Step 3: Add to barrel**

In `src/components/checkout/index.ts` add:

```ts
export { useSellGroupView, type SellGroupView } from './use-sell-group-view'
```

- [ ] **Step 4: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/checkout/use-sell-group-view.ts src/components/checkout/index.ts
git commit -m "feat(checkout): add shared sell-group view-model hook"
```

---

## Task 11: ItemStep (landing / product showcase)

**Files:**
- Create: `src/components/checkout/steps/item-step.tsx`

Artboards: "1 · Item — Confirm", "1b · Item — Videos". Media-first; full gallery here only.

- [ ] **Step 1: Create the component**

```tsx
import { Copy, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { MediaGallery } from '../media-gallery'
import { StickyCta } from '../sticky-cta'
import type { SellGroupView } from '../use-sell-group-view'
import { formatPrice } from '@/lib/utils'

interface ItemStepProps {
  view: SellGroupView
  quantity: number
  onQuantityChange: (q: number) => void
  onProceed: () => void
}

export function ItemStep({ view, quantity, onQuantityChange, onProceed }: ItemStepProps) {
  const total = view.effectiveUnitPrice * quantity
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mb-2 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">{view.name}</h1>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(view.primaryItemCode)
            toast.success('Code copied')
          }}
          className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 font-data text-sm font-bold text-brand-ink shadow-sm"
        >
          {view.primaryItemCode} <Copy className="h-3.5 w-3.5 text-brand-ash" />
        </button>
        {view.grade && (
          <span className="rounded-lg bg-[#ECE7DC] px-2.5 py-1 font-data text-xs uppercase tracking-wider text-brand-umber">
            Grade {view.gradeLabel}
          </span>
        )}
        <span className="rounded-lg bg-[#ECE7DC] px-2.5 py-1 font-data text-xs uppercase tracking-wider text-brand-umber">
          30-Day Warranty
        </span>
      </div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="font-data text-3xl font-bold text-brand-ink">{formatPrice(view.effectiveUnitPrice)}</span>
        {view.discountAmount > 0 && (
          <span className="font-data text-sm text-brand-ash line-through">{formatPrice(view.unitPrice)}</span>
        )}
        <span className="font-brand text-sm text-brand-ash">tax incl.</span>
      </div>
      {view.shortDescription && (
        <p className="mb-4 font-brand text-sm leading-snug text-brand-umber">{view.shortDescription}</p>
      )}

      <MediaGallery media={view.media} variant="full" />

      <div className="mt-4 flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm">
        <span className="font-brand text-sm font-semibold text-brand-ink">Quantity</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-ash/15"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-6 text-center font-data text-base font-bold">{quantity}</span>
          <button
            type="button"
            onClick={() => onQuantityChange(Math.min(view.stockCount || 1, quantity + 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-ash/15"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {view.stockCount === 0 ? (
        <p className="mt-4 text-center font-brand text-sm text-brand-signal">Out of stock — cannot be ordered.</p>
      ) : null}

      <StickyCta
        label={`Proceed to order · ${formatPrice(total)}`}
        onClick={onProceed}
        disabled={view.stockCount === 0}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/checkout/steps/item-step.tsx
git commit -m "feat(checkout): add ItemStep landing screen"
```

---

## Task 12: AccountStep (inline sign-in + register)

**Files:**
- Create: `src/components/checkout/steps/account-step.tsx`

Artboard: "1 · Account — sign in". Two modes: choice → register form OR login form. Uses `useCustomerAuth`.

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/shared/phone-input'
import { StickyCta } from '../sticky-cta'

interface AccountStepProps {
  onAuthed: () => void
}

type Mode = 'choice' | 'login' | 'register'

export function AccountStep({ onAuthed }: AccountStepProps) {
  const { login, register, isLoading } = useCustomerAuth()
  const [mode, setMode] = useState<Mode>('choice')
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [emailOrPhone, setEmailOrPhone] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')

  const handleLogin = async () => {
    try {
      await login(lastName.trim(), emailOrPhone.trim(), pin.trim())
      onAuthed()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not sign in')
    }
  }

  const handleRegister = async () => {
    try {
      const isEmail = emailOrPhone.includes('@')
      await register({
        last_name: lastName.trim(),
        first_name: firstName.trim() || undefined,
        email: isEmail ? emailOrPhone.trim() : undefined,
        phone: !isEmail ? emailOrPhone.trim() : phone.trim() || undefined,
        pin: pin.trim(),
      })
      onAuthed()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create account')
    }
  }

  if (mode === 'choice') {
    return (
      <div className="flex flex-1 flex-col">
        <h1 className="mb-1 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">
          Let's set up your order
        </h1>
        <p className="mb-6 font-brand text-sm leading-snug text-brand-umber">
          Sign in to use a saved address — or create an account.
        </p>
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <p className="font-brand text-sm text-brand-ink">✓ Use your saved shipping addresses</p>
          <p className="font-brand text-sm text-brand-ink">✓ Track your order &amp; delivery</p>
          <p className="font-brand text-sm text-brand-ink">✓ One account to buy &amp; to sell (kaitori)</p>
        </div>
        <StickyCta
          label="Create an account"
          showArrow={false}
          onClick={() => setMode('register')}
          secondary={{ label: 'I already have an account', onClick: () => setMode('login') }}
        />
      </div>
    )
  }

  const title = mode === 'login' ? 'Welcome back' : 'Create your account'
  const cta = mode === 'login' ? 'Sign in' : 'Create account'
  const canSubmit =
    lastName.trim() && emailOrPhone.trim() && pin.trim().length === 6
  const submit = mode === 'login' ? handleLogin : handleRegister

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mb-1 flex items-center gap-2 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">
        {mode === 'login' ? <LogIn className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />} {title}
      </h1>
      <p className="mb-5 font-brand text-sm text-brand-umber">Last name + email/phone + 6-digit PIN.</p>
      <div className="space-y-3">
        <Input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        {mode === 'register' && (
          <Input placeholder="First name (optional)" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        )}
        <Input placeholder="Email or phone" value={emailOrPhone} onChange={(e) => setEmailOrPhone(e.target.value)} />
        {mode === 'register' && !emailOrPhone.includes('@') ? null : mode === 'register' ? (
          <PhoneInput value={phone} onChange={setPhone} />
        ) : null}
        <Input
          placeholder="6-digit PIN"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </div>
      <StickyCta
        label={cta}
        showArrow={false}
        onClick={submit}
        disabled={!canSubmit}
        loading={isLoading}
        secondary={{
          label: mode === 'login' ? 'Create an account instead' : 'I already have an account',
          onClick: () => setMode(mode === 'login' ? 'register' : 'login'),
        }}
      />
    </div>
  )
}
```

> Before finalizing, open `src/hooks/use-customer-auth.ts` (already reviewed) to confirm `login(lastName, emailOrPhone, pin)` and `register({ last_name, first_name?, email?, phone?, pin })` signatures match this usage. They do as of this plan; if the edge function requires additional fields, surface them here.

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/checkout/steps/account-step.tsx
git commit -m "feat(checkout): add AccountStep inline sign-in + register"
```

---

## Task 13: AddressStep (saved addresses + add new + receiver)

**Files:**
- Create: `src/components/checkout/steps/address-step.tsx`

Artboards: "2 · Address", "2a · none selected", "2c · add new", "2 · different receiver". Uses `getCustomerAddresses`, `createCustomerAddress`, and the existing `AddressForm`.

- [ ] **Step 1: Create the component**

```tsx
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { getCustomerAddresses, createCustomerAddress } from '@/services/customer-addresses'
import type { ShippingAddress } from '@/lib/address-types'
import { uppercaseAddress } from '@/lib/address-types'
import { AddressForm } from '@/components/shared'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/shared/phone-input'
import { AddressCard } from '../address-card'
import { SelectableCard } from '../selectable-card'
import { StickyCta } from '../sticky-cta'
import type { CheckoutData } from '../types'

interface AddressStepProps {
  data: CheckoutData
  setData: (patch: Partial<CheckoutData>) => void
  onContinue: () => void
}

export function AddressStep({ data, setData, onContinue }: AddressStepProps) {
  const { customer } = useCustomerAuth()
  const queryClient = useQueryClient()
  const customerId = customer?.id ?? ''

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['customer-addresses', customerId],
    queryFn: () => getCustomerAddresses(customerId),
    enabled: !!customerId,
  })

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<ShippingAddress | null>(null)
  const [saving, setSaving] = useState(false)

  const canContinue = useMemo(() => {
    if (!data.selectedAddressId || !data.shippingAddress) return false
    if (data.receiverMode === 'other') {
      return !!(data.receiverFirstName.trim() && data.receiverLastName.trim() && data.receiverPhone.trim())
    }
    return true
  }, [data])

  const selectAddress = (id: string, addr: ShippingAddress) => {
    setData({ selectedAddressId: id, shippingAddress: addr })
  }

  const handleSave = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const saved = await createCustomerAddress({
        customer_id: customerId,
        address: uppercaseAddress(draft) as unknown as CustomerAddressInsertAddress,
      } as Parameters<typeof createCustomerAddress>[0])
      await queryClient.invalidateQueries({ queryKey: ['customer-addresses', customerId] })
      selectAddress(saved.id, saved.address as unknown as ShippingAddress)
      setAdding(false)
      setDraft(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save address')
    } finally {
      setSaving(false)
    }
  }

  if (adding) {
    return (
      <div className="flex flex-1 flex-col">
        <h1 className="mb-1 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">Add a new address</h1>
        <p className="mb-4 font-brand text-sm text-brand-umber">Enter your postal code — we'll fill the rest.</p>
        <AddressForm value={draft} onChange={setDraft} required />
        <StickyCta
          label="Save address"
          showArrow={false}
          onClick={handleSave}
          disabled={!draft}
          loading={saving}
          secondary={{ label: 'Cancel', onClick: () => { setAdding(false); setDraft(null) } }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mb-1 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">Where should we ship?</h1>
      <p className="mb-4 font-brand text-sm text-brand-umber">Tap an address to choose it.</p>

      {isLoading ? (
        <p className="font-brand text-sm text-brand-ash">Loading addresses…</p>
      ) : (
        <div className="space-y-3">
          {addresses.map((a, i) => (
            <AddressCard
              key={a.id}
              address={a}
              displayLabel={a.label ?? `Address ${i + 1}`}
              selected={data.selectedAddressId === a.id}
              onSelect={() => selectAddress(a.id, a.address as unknown as ShippingAddress)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-ash/60 py-3 font-brand text-sm font-semibold text-brand-ink"
      >
        <Plus className="h-4 w-4" /> Add new address
      </button>

      {/* Receiver */}
      <p className="mb-2 mt-6 font-data text-[11px] uppercase tracking-[0.12em] text-brand-umber">Receiver</p>
      <div className="grid grid-cols-2 gap-3">
        <SelectableCard
          selected={data.receiverMode === 'me'}
          onSelect={() => setData({ receiverMode: 'me' })}
          showSelectedLabel={false}
        >
          <span className="block font-brand text-sm font-semibold text-brand-ink">Me</span>
          <span className="block font-brand text-xs text-brand-umber">
            {[customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'Account holder'}
          </span>
        </SelectableCard>
        <SelectableCard
          selected={data.receiverMode === 'other'}
          onSelect={() => setData({ receiverMode: 'other' })}
          showSelectedLabel={false}
        >
          <span className="block font-brand text-sm font-semibold text-brand-ink">Someone else</span>
        </SelectableCard>
      </div>

      {data.receiverMode === 'other' && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Input
            placeholder="First name"
            value={data.receiverFirstName}
            onChange={(e) => setData({ receiverFirstName: e.target.value })}
          />
          <Input
            placeholder="Last name"
            value={data.receiverLastName}
            onChange={(e) => setData({ receiverLastName: e.target.value })}
          />
          <div className="col-span-2">
            <PhoneInput value={data.receiverPhone} onChange={(v) => setData({ receiverPhone: v })} />
          </div>
        </div>
      )}

      <StickyCta label="Continue to schedule" onClick={onContinue} disabled={!canContinue} />
    </div>
  )
}

// Local helper type: the `address` column is JSON in the generated insert type.
type CustomerAddressInsertAddress = NonNullable<Parameters<typeof createCustomerAddress>[0]>['address']
```

> Note on the `createCustomerAddress` call: the generated `CustomerAddressInsert.address` is a `Json` type. Cast the structured `ShippingAddress` to it as shown. If tsc complains about the cast form, simplify to `address: uppercaseAddress(draft) as never` — the runtime payload is identical. Do not change the service.

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS. Resolve the `address` cast typing if tsc objects (see note).

- [ ] **Step 3: Commit**

```bash
git add src/components/checkout/steps/address-step.tsx
git commit -m "feat(checkout): add AddressStep with saved addresses, add-new, and receiver"
```

---

## Task 14: ScheduleStep

**Files:**
- Create: `src/components/checkout/steps/schedule-step.tsx`

Artboards: "3 · Schedule", "3a · no time". Native date input + Yamato time-slot chips.

- [ ] **Step 1: Create the component**

```tsx
import { Calendar } from 'lucide-react'
import { YAMATO_TIME_SLOTS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { StickyCta } from '../sticky-cta'
import type { CheckoutData } from '../types'

interface ScheduleStepProps {
  data: CheckoutData
  setData: (patch: Partial<CheckoutData>) => void
  onContinue: () => void
}

export function ScheduleStep({ data, setData, onContinue }: ScheduleStepProps) {
  const todayStr = new Date().toISOString().split('T')[0]
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mb-1 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">When do you want it?</h1>
      <p className="mb-5 font-brand text-sm text-brand-umber">Choose a delivery date, then a time.</p>

      <p className="mb-2 font-data text-[11px] uppercase tracking-[0.12em] text-brand-umber">Delivery date</p>
      <label className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <Calendar className="h-5 w-5 text-brand-ash" />
        <input
          type="date"
          min={todayStr}
          value={data.deliveryDate ?? ''}
          onChange={(e) => setData({ deliveryDate: e.target.value || null })}
          className="flex-1 bg-transparent font-brand text-base font-semibold text-brand-ink outline-none"
        />
      </label>
      <p className="mt-2 font-brand text-xs text-brand-ash">Orders after 4PM JST ship the next business day.</p>

      <p className="mb-2 mt-6 font-data text-[11px] uppercase tracking-[0.12em] text-brand-umber">Delivery time</p>
      <div className="grid grid-cols-2 gap-3">
        {YAMATO_TIME_SLOTS.map((slot) => {
          const selected = data.deliveryTimeCode === slot.code
          return (
            <button
              key={slot.code}
              type="button"
              onClick={() => setData({ deliveryTimeCode: slot.code })}
              className={cn(
                'flex items-center gap-2 rounded-2xl border p-4 font-brand text-sm font-semibold transition',
                selected
                  ? 'border-[#EADFCB] bg-[#FAF4EA] text-brand-ink shadow-[0_8px_22px_rgba(22,20,15,0.09)]'
                  : 'border-brand-ash/40 bg-white text-brand-ink',
              )}
            >
              {selected && <span className="h-2 w-2 rounded-full bg-brand-signal" />}
              {slot.label_en}
            </button>
          )
        })}
      </div>

      <StickyCta
        label="Continue to payment"
        onClick={onContinue}
        disabled={!data.deliveryDate || !data.deliveryTimeCode}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/checkout/steps/schedule-step.tsx
git commit -m "feat(checkout): add ScheduleStep with Yamato time slots"
```

---

## Task 15: PaymentStep

**Files:**
- Create: `src/components/checkout/steps/payment-step.tsx`

Artboard: "4 · Payment". Method cards with **informational** fee badges. Selecting sets `paymentMethod`.

- [ ] **Step 1: Create the component**

```tsx
import { SHOP_PAYMENT_METHODS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { SelectableCard } from '../selectable-card'
import { StickyCta } from '../sticky-cta'
import type { CheckoutData } from '../types'

interface PaymentStepProps {
  data: CheckoutData
  setData: (patch: Partial<CheckoutData>) => void
  onContinue: () => void
}

export function PaymentStep({ data, setData, onContinue }: PaymentStepProps) {
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mb-1 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">How will you pay?</h1>
      <p className="mb-5 font-brand text-sm text-brand-umber">Pick a payment method — pay after we confirm.</p>

      <div className="space-y-3">
        {SHOP_PAYMENT_METHODS.map((m) => {
          const isFee = m.fee !== 'NO FEE'
          return (
            <SelectableCard
              key={m.code}
              selected={data.paymentMethod === m.code}
              onSelect={() => setData({ paymentMethod: m.code })}
              showSelectedLabel={false}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-brand text-base font-semibold text-brand-ink">{m.label}</span>
                  <span className="block font-data text-xs uppercase tracking-wider text-brand-umber">{m.sublabel}</span>
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-md px-2 py-1 font-data text-[10px] uppercase tracking-wider',
                    isFee ? 'bg-brand-signal/10 text-brand-signal' : 'bg-[#E6EDE6] text-[#3F6B4A]',
                  )}
                >
                  {m.fee}
                </span>
              </span>
            </SelectableCard>
          )
        })}
      </div>
      <p className="mt-3 font-brand text-xs text-brand-ash">
        Card &amp; PayPal fees are confirmed by our team before you pay — not charged here.
      </p>

      <StickyCta label="Review order" onClick={onContinue} disabled={!data.paymentMethod} />
    </div>
  )
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/checkout/steps/payment-step.tsx
git commit -m "feat(checkout): add PaymentStep with informational fee badges"
```

---

## Task 16: ReviewStep (summary + confirm)

**Files:**
- Create: `src/components/checkout/steps/review-step.tsx`

Artboard: "5 · Review & Confirm". Summary rows with Edit, real total = item × qty, confirm → `createManualOrder`.

- [ ] **Step 1: Create the component**

```tsx
import { CreditCard, MapPin, Truck } from 'lucide-react'
import { serializeAddress } from '@/lib/address-types'
import { SHOP_PAYMENT_METHODS, YAMATO_TIME_SLOTS } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'
import { StickyCta } from '../sticky-cta'
import type { CheckoutData, CheckoutStep } from '../types'
import type { SellGroupView } from '../use-sell-group-view'

interface ReviewStepProps {
  view: SellGroupView
  data: CheckoutData
  addressLabel: string
  onEdit: (step: CheckoutStep) => void
  onConfirm: () => void
  placing: boolean
}

function SummaryRow({
  icon,
  label,
  value,
  onEdit,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  onEdit: () => void
}) {
  return (
    <div className="flex items-start gap-3 border-b border-brand-ash/20 px-4 py-3 last:border-b-0">
      <span className="mt-0.5 text-brand-ash">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-data text-[10px] uppercase tracking-wider text-brand-ash">{label}</p>
        <div className="font-brand text-sm leading-snug text-brand-ink">{value}</div>
      </div>
      <button type="button" onClick={onEdit} className="font-brand text-sm font-semibold text-brand-ink underline-offset-2 hover:underline">
        Edit
      </button>
    </div>
  )
}

export function ReviewStep({ view, data, addressLabel, onEdit, onConfirm, placing }: ReviewStepProps) {
  const total = view.effectiveUnitPrice * data.quantity
  const slot = YAMATO_TIME_SLOTS.find((s) => s.code === data.deliveryTimeCode)
  const payment = SHOP_PAYMENT_METHODS.find((m) => m.code === data.paymentMethod)
  const addrEn = data.shippingAddress ? serializeAddress(data.shippingAddress, 'en') : ''

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mb-1 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">Quick check before you order</h1>
      <p className="mb-4 font-brand text-sm text-brand-umber">Tap any line to edit.</p>

      <div className="rounded-2xl bg-white shadow-sm">
        <SummaryRow
          icon={<MapPin className="h-4 w-4" />}
          label={`Ship to · ${addressLabel}`}
          value={<span className="whitespace-pre-line">{addrEn}</span>}
          onEdit={() => onEdit('address')}
        />
        <SummaryRow
          icon={<Truck className="h-4 w-4" />}
          label="Delivery"
          value={`${data.deliveryDate ?? '—'}${slot ? ` · ${slot.label_en}` : ''}`}
          onEdit={() => onEdit('schedule')}
        />
        <SummaryRow
          icon={<CreditCard className="h-4 w-4" />}
          label="Payment"
          value={payment ? `${payment.label} · ${payment.sublabel}` : '—'}
          onEdit={() => onEdit('payment')}
        />
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between font-brand text-sm text-brand-umber">
          <span>{`Item · ${view.name} × ${data.quantity}`}</span>
          <span className="font-data">{formatPrice(total)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-brand-ash/20 pt-3">
          <span className="font-brand text-base font-bold text-brand-ink">Total</span>
          <span className="font-data text-xl font-bold text-brand-ink">{formatPrice(total)}</span>
        </div>
      </div>

      <StickyCta label={`Confirm order · ${formatPrice(total)}`} onClick={onConfirm} loading={placing} />
    </div>
  )
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/checkout/steps/review-step.tsx
git commit -m "feat(checkout): add ReviewStep summary screen"
```

---

## Task 17: ConfirmedStep

**Files:**
- Create: `src/components/checkout/steps/confirmed-step.tsx`

Artboard: "6 · Order Confirmed".

- [ ] **Step 1: Create the component**

```tsx
import { Check } from 'lucide-react'

interface ConfirmedStepProps {
  orderCode: string
  firstName: string | null
  onTrack: () => void
  onBackToShop: () => void
}

export function ConfirmedStep({ orderCode, firstName, onTrack, onBackToShop }: ConfirmedStepProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="relative mb-6">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-ink">
          <Check className="h-11 w-11 text-brand-paper" />
        </div>
        <span className="absolute right-1 top-1 h-3 w-3 rounded-full bg-brand-signal" />
      </div>
      <h1 className="mb-3 font-brand text-3xl font-extrabold tracking-tight text-brand-ink">Order confirmed</h1>
      <span className="mb-5 rounded-lg bg-white px-3 py-1.5 font-data text-base font-bold text-brand-ink shadow-sm">
        {orderCode}
      </span>
      <p className="max-w-[280px] font-brand text-sm leading-relaxed text-brand-umber">
        Thanks{firstName ? `, ${firstName}` : ''}. We've got your order and we'll message you on Messenger to arrange
        payment and delivery.
      </p>

      <div className="mt-auto w-full space-y-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-8">
        <button
          type="button"
          onClick={onTrack}
          className="h-[52px] w-full rounded-2xl bg-brand-ink font-brand text-base font-semibold text-brand-paper"
        >
          Track your order
        </button>
        <button
          type="button"
          onClick={onBackToShop}
          className="h-[52px] w-full rounded-2xl bg-white font-brand text-base font-semibold text-brand-ink shadow-sm"
        >
          Back to shop
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 3: Add steps to barrel + commit**

In `src/components/checkout/index.ts` append:

```ts
export { ItemStep } from './steps/item-step'
export { AccountStep } from './steps/account-step'
export { AddressStep } from './steps/address-step'
export { ScheduleStep } from './steps/schedule-step'
export { PaymentStep } from './steps/payment-step'
export { ReviewStep } from './steps/review-step'
export { ConfirmedStep } from './steps/confirmed-step'
```

```bash
git add src/components/checkout/steps/confirmed-step.tsx src/components/checkout/index.ts
git commit -m "feat(checkout): add ConfirmedStep and export all step components"
```

---

## Task 18: Orchestrator — rewrite `checkout.tsx`

**Files:**
- Modify: `src/pages/shop/checkout.tsx` (full rewrite)

Mounts the auth provider, resolves the sell group, drives the flow, shows the ProductChip + StepProgress on steps 2–5, renders the active step, and submits via `createManualOrder`.

- [ ] **Step 1: Replace the file contents**

```tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CustomerAuthContext, useCustomerAuthProvider, useCustomerAuth } from '@/hooks/use-customer-auth'
import { useSellGroup } from '@/hooks/use-sell-groups'
import { useSellGroupByCode } from '@/hooks/use-shop'
import { useCreateManualOrder } from '@/hooks/use-orders'
import { pickAvailableItemsFromSellGroup } from '@/services/orders'
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
  const createOrder = useCreateManualOrder()
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

  const selectedAddress = flow.data.selectedAddressId
  const addressLabel = selectedAddress ? 'Selected address' : ''
  const total = view.effectiveUnitPrice * flow.data.quantity

  const handleConfirm = async () => {
    if (!customer || !flow.data.shippingAddress) {
      toast.error('Missing account or address')
      return
    }
    setPlacing(true)
    try {
      const items = await pickAvailableItemsFromSellGroup(
        (sg as { id: string }).id,
        flow.data.quantity,
      )
      const isOther = flow.data.receiverMode === 'other'
      createOrder.mutate(
        {
          customer_id: customer.id,
          order_source: isCode ? 'LIVE_SELLING' : 'SHOP',
          shipping_address: JSON.stringify(flow.data.shippingAddress),
          shipping_cost: 0,
          delivery_date: flow.data.deliveryDate,
          delivery_time_code: flow.data.deliveryTimeCode,
          payment_method: flow.data.paymentMethod,
          receiver_first_name: isOther ? flow.data.receiverFirstName : null,
          receiver_last_name: isOther ? flow.data.receiverLastName : null,
          receiver_phone: isOther ? flow.data.receiverPhone : null,
          items,
        },
        {
          onSuccess: (order) => {
            setOrderCode(order.order_code)
            flow.goTo('confirmed')
          },
          onError: (e) => toast.error(`Order failed: ${e.message}`),
          onSettled: () => setPlacing(false),
        },
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reserve items')
      setPlacing(false)
    }
  }

  // Confirmed screen has its own full-bleed layout (no chip/progress).
  if (flow.step === 'confirmed' && orderCode) {
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
        <div className="mb-4 space-y-3">
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
          addressLabel={addressLabel || 'Address'}
          onEdit={flow.goTo}
          onConfirm={handleConfirm}
          placing={placing}
        />
      )}

      <PhotoSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={view.name}
        subtitle={`${view.primaryItemCode} · GRADE ${view.gradeLabel} · ${formatPrice(view.effectiveUnitPrice)}`}
        media={view.media}
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
```

> The `addressLabel` shown on Review is generic ("Address") because the selected address's positional label lives in the AddressStep list. If you want the exact "Address 1" label on Review, store it into `CheckoutData` when selecting (add an optional `selectedAddressLabel` field in Task 2's type and set it in `AddressStep.selectAddress`). This is a nice-to-have; the artboard shows "ADDRESS 1". Implement it if straightforward.

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS. The provider wraps `CheckoutInner` so `useCustomerAuth()` resolves.

- [ ] **Step 3: Commit**

```bash
git add src/pages/shop/checkout.tsx
git commit -m "feat(checkout): wire multi-step orchestrator into checkout page"
```

---

## Task 19: Polish the Review "Address N" label (optional, from Task 18 note)

**Files:**
- Modify: `src/components/checkout/types.ts`, `src/components/checkout/steps/address-step.tsx`, `src/components/checkout/steps/review-step.tsx`, `src/pages/shop/checkout.tsx`

- [ ] **Step 1: Add the field to `CheckoutData`**

In `types.ts` `CheckoutData` add `selectedAddressLabel: string | null` and in `INITIAL_CHECKOUT_DATA` add `selectedAddressLabel: null`.

- [ ] **Step 2: Set it on selection**

In `address-step.tsx`, change `selectAddress` to accept and store the label:

```ts
  const selectAddress = (id: string, addr: ShippingAddress, label: string) => {
    setData({ selectedAddressId: id, shippingAddress: addr, selectedAddressLabel: label })
  }
```

Update the `AddressCard.onSelect` call to `() => selectAddress(a.id, a.address as unknown as ShippingAddress, a.label ?? `Address ${i + 1}`)` and the post-save `selectAddress(saved.id, saved.address as unknown as ShippingAddress, saved.label ?? 'New address')`.

- [ ] **Step 3: Use it on Review**

In `checkout.tsx`, pass `addressLabel={flow.data.selectedAddressLabel ?? 'Address'}`.

- [ ] **Step 4: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/checkout/types.ts src/components/checkout/steps/address-step.tsx src/pages/shop/checkout.tsx
git commit -m "feat(checkout): show selected address label on review"
```

---

## Task 20: Visual QA pass against the artboards

**Files:** none (manual verification)

- [ ] **Step 1: Run the dev server**

Run: `npm run dev` and open a known checkout URL. To find a live sell-group code, ask the user or use an existing `/order/:sellGroupCode` link. For a logged-out walkthrough, the Account step should appear; for a logged-in one (a `dealz_customer` in localStorage), it should be skipped.

- [ ] **Step 2: Walk each screen and compare to its Paper artboard**

Using the design spec §10 checklist, confirm for every step:
- CTA is bottom-pinned, Ink when enabled / Ash when disabled, names the next step, and is reachable without scrolling past content.
- Selected vs unselected is unmistakable on Address / Schedule / Payment (cream fill + red radio/check).
- The full gallery appears only on the Item landing and inside the PhotoSheet.
- Brand palette + Sora/Space Mono applied; red used only as a tiny accent.
- The product chip opens the PhotoSheet and dismissing returns to the same step.

Capture before/after screenshots if helpful. Fix discrepancies in the relevant component, re-running `npm run build && npm run lint` after each fix, committing with `fix(checkout): …` messages.

- [ ] **Step 3: Confirm an end-to-end order persists correctly**

Place a test order (logged in). In the admin order view, confirm the new order shows: the real customer (not the `00000000…` placeholder), the chosen `payment_method`, `delivery_date`, `delivery_time_code`, receiver fields when "Someone else" was used, and `total = item × qty`. If anything is missing, trace it to the `createManualOrder` call in `checkout.tsx` and fix.

- [ ] **Step 4: Final commit (if any QA fixes were made)**

```bash
git add -A
git commit -m "fix(checkout): visual QA adjustments against mockups"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** Routing/shell (Task 18, 8) · media-first Landing (Task 11, 6) · Account skip-when-authed + inline login/register (Task 12, 2) · Address saved cards + add-new + receiver (Task 13, 8) · Schedule (Task 14) · Payment preference + informational fee badges (Task 15, 1) · Review real total (Task 16) · Confirmed (Task 17) · payment_method persistence + real customer_id (Task 1, 18) · brand-scoped styling (Task 8) · selected-state recipe (Task 4) · both routes (Task 18). All spec sections map to a task.

**Placeholder scan:** No "TBD"/"implement later". Where a generated Supabase JSON type may reject a cast, the exact fallback (`as never`) is given (Task 13). Where an export name must be confirmed (`DealzWordmark`), an explicit "open the file and adapt" instruction is given (Task 8) rather than a guess.

**Type consistency:** `CheckoutData`/`CheckoutStep`/`SellGroupView`/`CheckoutMedia` names and fields are used identically across tasks. `useCheckoutFlow(isAuthenticated)` signature matches its call in Task 18. `createManualOrder` input gains `payment_method` (Task 1) and is supplied in Task 18.

**Known verification dependencies (flagged in-task, not placeholders):** Task 10 Step 1 (confirm/extend the sell-group `.select` to include `media_type` + `item_code`) and Task 8 Step 2 (confirm `DealzWordmark` export). Both are concrete inspect-and-adapt steps an engineer can complete without further design input.
