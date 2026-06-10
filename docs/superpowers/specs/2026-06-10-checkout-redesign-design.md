# Checkout Redesign — Mobile Multi-Step Flow (Design Spec)

**Date:** 2026-06-10
**Status:** Approved for planning
**Visual source of truth:** Paper file "Dealz-Order" (`01KTQMN7R5SPG1C5MQ56V97PP9`), 13 screen artboards.
**Governing rule:** **The working webapp is the source of truth.** The mockups define the *visual* target; wherever a mockup implies behavior the webapp doesn't do, the webapp wins so nothing already working is disrupted.

---

## 1. Problem

Customers order via a link we send them (`/order/:sellGroupCode`) — and via the shop buy button
(`/shop/checkout/:sellGroupId`). Both render the same `src/pages/shop/checkout.tsx`, today a
**single-page form**. Customers repeatedly ask "what do I do next?". Root causes (from the original
investigation):

1. The full product gallery is repeated *below* the action button on every step → people think the
   page ended or miss the button above it.
2. The "Next" buttons are grey (shadcn muted) → read as *disabled*.
3. Address options don't look selectable → no radio/check/selected affordance.
4. The step indicator is tiny → no sense of progress.

Additionally, the live page has two correctness gaps it inherited: it submits orders with a
**placeholder `customer_id`** (`00000000-…`) and never captures the customer's **payment method**.

## 2. Goal

Rebuild the checkout as **one decision per full screen, bottom-pinned CTA, no scrolling to reach
the action**, faithful to the mockups, while preserving all existing order-creation behavior.

## 3. Scope decisions (confirmed with user)

- **Replace both routes** with one shared multi-step flow (single source of truth).
- **Full inline auth**: build both inline sign-in and inline registration against the existing
  `customer-auth` system; logged-in users skip the Account step.
- **Money math = webapp**: no shipping fee and no payment surcharge are computed or charged at
  checkout. Persisted `total = Σ(unit_price × qty − discount) + shipping_cost`, with
  `shipping_cost = 0` (unchanged from today). The Credit-Card surcharge remains a **staff** action
  applied later as a line item (`addCreditCardSurcharge`), exactly as now.
- **Fee badges kept as informational text**: the Payment step shows `+4%` (Credit Card),
  `+5%` (PayPal), and `NO FEE` labels so customers *know* a fee applies — but these are display-only
  and do **not** affect the checkout total.
- **Brand styling extends to checkout only**: the Dealz brand (Paper bg, Ink/Umber/Ash, Signal-red
  tiny accents, Sora + Space Mono) is scoped to this route via a wrapper. Admin and the rest of the
  shop keep the default shadcn theme.

## 4. Webapp facts the build must respect (verified in code)

- `createManualOrder(input)` (`src/services/orders.ts:384`): computes `total_price` and
  `quantity` itself, marks items `RESERVED`, inserts `order_items`. It accepts `delivery_date`,
  `delivery_time_code`, `receiver_first_name/last_name/phone`, `shipping_cost`, and `items[]`.
  It does **not** currently accept `payment_method`.
- `pickAvailableItemsFromSellGroup(sellGroupId, qty)` (`orders.ts:312`): returns the line items
  (with per-item discounts) to pass to `createManualOrder`. Reuse as-is.
- Customer auth: `useCustomerAuth()` / `useCustomerAuthProvider()` (`src/hooks/use-customer-auth.ts`)
  expose `customer`, `isAuthenticated`, `login(lastName, emailOrPhone, pin)`,
  `register({ last_name, first_name?, email?, phone?, pin, shipping_address? })`, `logout`.
- Saved addresses: `getCustomerAddresses(customerId)` (`src/services/customer-addresses.ts`);
  `customer_addresses` rows carry `address` (JSON), `label`, `is_default`,
  `receiver_first_name/last_name/phone`.
- Address entry: existing `AddressForm` (`src/components/shared/address-form.tsx`) already does JP
  postal-code lookup (`src/services/postal-codes.ts`), PH, and international. Reuse it inside the
  add-address sheet rather than rebuilding.
- Product media: `useSellGroupByCode` / `useSellGroup` return `product_models.product_media`
  with `file_url`, `media_type` (`image`|`video`), `role` (`hero`|`gallery`|`video`), `sort_order`.
- Order fields available for the new steps already exist on `orders`: `delivery_date`,
  `delivery_time_code`, `payment_method`, `receiver_*`.

## 5. Screen flow

A media-first **Landing (Item)** screen, then **5 numbered steps**, then a **Confirmed** screen.

### Landing — Item (not numbered)
Media-first: large swipeable gallery built from `product_media` with **Photos(n) / Videos(n)** tabs,
counter + thumbnail strip, "TESTED LIVE" tag on video. Prominent P-code chip (copy icon), grade
badge (soft taupe), price (Space Mono), short spec line, 30-day warranty. Optional quantity stepper
(preserves the webapp's quantity capability; defaults to 1). CTA: **"Proceed to order · ¥price ▸"**.

### Step 1 — Account
- If `isAuthenticated`: step shows **complete** and is skipped; a "Signed in as … / Log out" banner
  renders on subsequent steps.
- Else: "Create account" (inline register: last name + first name + email/phone + 6-digit PIN) and
  "I already have an account" (inline sign-in: last name + email/phone + PIN), both via
  `useCustomerAuth`. On success, advance to Step 2.

### Step 2 — Address ("Where should we ship?")
- Saved-address cards from `getCustomerAddresses(customer.id)`, labeled **"Address 1 / Address 2"**
  (numbered, never Home/Work). Each card shows English (primary) + smaller kanji line (secondary),
  **both in Japanese big→small order**: `〒postal → prefecture → ward → town → chōme-banchi-gō →
  building → Japan`.
- Selected state uses the **selected-card recipe** (see §7). "+ Add new address" opens the
  `AddressForm` (JP postal lookup) in an add-address view; Save/Cancel.
- **Receiver** choice at the bottom: "Me (account holder)" vs "Someone else" → reveals First/Last
  name + Phone, persisted to `receiver_*`.
- CTA disabled (Ash) until an address is selected; then Ink "Continue to schedule ▸".

### Step 3 — Schedule ("When do you want it?")
- `delivery_date` field + Yamato **time-slot chips** mapped to `delivery_time_code`. Helper note
  "Orders after 4PM JST ship the next business day."
- CTA disabled until a time slot is chosen; then "Continue to payment ▸".

### Step 4 — Payment ("How will you pay?")
- Method cards: Bank Transfer (振込), Cash on Delivery (代引き), Credit Card (VISA·MASTER·JCB),
  Konbini (コンビニ), PayPal. Selecting one sets the chosen **`payment_method`** (preference only).
- **Informational fee badges**: `NO FEE`, `+4%` (Credit Card), `+5%` (PayPal) — display-only, do
  not change the total.
- CTA "Review order ▸".

### Step 5 — Review & Confirm ("Quick check before you order")
- Summary lines (Ship to / Delivery / Payment), each with an **Edit** affordance that jumps back to
  the relevant step. Item line + **real total = item × qty** (no fabricated shipping/surcharge
  lines). CTA "Confirm order · ¥total ▸".
- On confirm: `pickAvailableItemsFromSellGroup` → `createManualOrder` with the **real `customer_id`**,
  `order_source` (`LIVE_SELLING` for the code route, `SHOP` otherwise), `shipping_address`,
  `delivery_date`, `delivery_time_code`, `receiver_*`, `payment_method`, `shipping_cost: 0`.

### Order Confirmed
Branded success: ink check mark with red dot, "Order confirmed", ORD code chip (Space Mono),
"we'll message you on Messenger to arrange …" copy, "Track your order" + "Back to shop".

## 6. Component architecture

New feature folder `src/components/checkout/` with a barrel `index.ts`:

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `CheckoutFlow` (in `pages/shop/checkout.tsx`) | Orchestrator: resolves sell group, drives step state, renders the active step + shell | `useCheckoutFlow`, `useSellGroup*` |
| `useCheckoutFlow` | Step index + collected data (account/address/receiver/schedule/payment/quantity); per-step CTA gating; skip-Account-when-authed | `useCustomerAuth` |
| `CheckoutShell` | Top bar (‹ Back · `dealz.` wordmark · help), brand-scoped wrapper | brand tokens |
| `StepProgress` | 5-segment bar + "STEP n OF 5" + step name | — |
| `ProductChip` | Compact thumb + name + price; tappable → opens `PhotoSheet` (preserves step) | `MediaGallery` |
| `PhotoSheet` | Bottom-sheet overlay of photos/videos over current step; dismiss returns to exact step | `MediaGallery` |
| `MediaGallery` | Photos/Videos tabs, swipe, counter, thumbnail strip, TESTED LIVE tag | `product_media` |
| `SelectableCard` | Reusable selectable row (selected recipe, signal radio + check) | — |
| `StickyCta` | Bottom-pinned CTA; Ink when enabled, Ash when disabled; names next step | — |
| `AddressCard` | Saved-address card (EN + kanji, big→small order) | — |
| Step views | `ItemStep`, `AccountStep`, `AddressStep`, `ScheduleStep`, `PaymentStep`, `ReviewStep`, `ConfirmedStep` | the primitives above |

Reuse existing `AddressForm`, `PhoneInput`. Time-slot options come from the existing Yamato slot
constants used elsewhere in the app.

## 7. Brand & selected-state recipe (from mockups + BRAND.md)

- Palette: Paper `#F3F1EC` bg · Ink `#16140F` · Umber `#4A463E` · Ash `#A39E92` · Signal `#FF2D16`
  (tiny accents only). Fonts: Sora (`font-brand`) for text/buttons; Space Mono (`font-data`)
  UPPERCASE for prices, grades, labels, "STEP n OF 5".
- **Selected card** (do *not* use dark borders): warm cream fill `#FAF4EA` + faint border `#EADFCB`
  + soft lift `box-shadow: 0 8px 22px rgba(22,20,15,0.09)`, meaning carried by the **Signal-red
  radio dot + red check + small red "SELECTED" label**. Active media thumbnail = 2px `#FF2D16` ring.
- Grade badge = soft taupe `#ECE7DC` chip. P-code = prominent white code-chip with copy icon.
- Build with font *tokens* (`font-brand` / `font-data`) so brand-font changes in `src/index.css`
  `@theme` propagate automatically.
- Accessibility: touch ≥44px, contrast ≥4.5:1, selection never conveyed by color alone
  (radio + check + border), one primary CTA per screen.

## 8. Backend change (single, additive, non-disruptive)

Extend `createManualOrder` (and `useCreateManualOrder`) to accept and persist `payment_method`
(string; column already exists on `orders`). No change to totals, shipping, reservation, or any
other order behavior. The placeholder `customer_id` is replaced by the real authenticated
`customer.id`.

## 9. Build sequence

1. Brand-scoped `CheckoutShell` + `useCheckoutFlow` + shared primitives
   (`StepProgress`, `SelectableCard`, `StickyCta`, `ProductChip`, `MediaGallery`, `PhotoSheet`,
   `AddressCard`).
2. Landing (Item) screen.
3. Account step (auth integration; skip-when-authed).
4. Address step (saved cards + add-address `AddressForm` + receiver).
5. Schedule step.
6. Payment step (preference capture + informational fee badges).
7. Review step + wire `createManualOrder` (real `customer_id`, `payment_method`).
8. Confirmed screen.

Each step is independently reviewable against its Paper artboard.

## 10. Verification

- Every step: CTA is reachable without scrolling, bottom-pinned, Ink when enabled / Ash when
  disabled, and names the next step. Selected vs unselected is unmistakable on
  address/schedule/payment. The full gallery appears only on the Landing + photo sheet.
- Order creation: a confirmed order persists the **real customer_id**, the chosen `payment_method`,
  `delivery_date`, `delivery_time_code`, receiver fields, and `total = item × qty` — verified
  against an existing admin order view.
- Both `/order/:sellGroupCode` and `/shop/checkout/:sellGroupId` drive the new flow.
- Brand palette/fonts applied; red used only as a tiny accent.
