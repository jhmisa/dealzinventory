# Copy Order Summary for Messages

**Date:** 2026-05-04
**Status:** Approved

## Problem

Agents in Admin Messages currently have to open the Orders page, screenshot the order, annotate it, and send the image to customers for confirmation. This is slow and clunky.

## Solution

Add a "Copy Invoice" button that copies a plain-text order summary to the clipboard, optimized for pasting into FB Messenger (plain text only, no HTML/rich text).

## Button Placement

Two locations:

1. **Customer Panel sidebar** — small clipboard icon on each order card in the Orders section
2. **Order Detail Dialog** — a "Copy Invoice" button in the header/actions area

Both use the same text generation logic.

## Text Format

```
📦 Order: ORD000474
📅 Delivery: 2026-04-29 (Sat 2-4pm)
👤 C000564 — Joesel Mercado Opeña
📍 123-4567 Tokyo-to, Shibuya-ku, Jingumae 1-2-3, Apt 101

Items:
1x MacBook Air M1 — ¥45,000
1x iPhone 13 128GB — ¥25,000

🚚 Delivery Fee: ¥1,000
💰 Total: ¥71,000

🚚 Tracking: 1234-5678-9012
https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number=1234567890123
```

## Conditional Fields

- **Delivery date/time** — shows "TBD" if not yet set
- **Delivery day** — day of week abbreviation (Mon, Tue, Wed, Thu, Fri, Sat, Sun) derived from delivery_date
- **Time slot** — converted from code (e.g., "14-16") to human-readable (e.g., "2-4pm")
- **Delivery Fee** — only shown if `shipping_cost > 0`
- **Tracking number** — only shown if `tracking_number` exists
- **Tracking URL** — Yamato URL auto-generated for Yamato shipments; non-Yamato shows tracking number only (no URL)

## Carrier Detection

- Database has a `carrier` field on orders
- If `carrier` is null or `"yamato"` — generate Yamato tracking URL: `https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number={tracking_number}`
- If `carrier` is any other value (e.g., `"sagawa"`, international carriers) — show tracking number only, no URL

## Time Slot Mapping

| Code | Display |
|------|---------|
| 08-12 | 8am-12pm |
| 12-14 | 12-2pm |
| 14-16 | 2-4pm |
| 16-18 | 4-6pm |
| 18-20 | 6-8pm |
| 20-21 | 8-9pm |

## Behavior

1. Click copy button → text copied to clipboard via `navigator.clipboard.writeText()`
2. Toast notification: "Copied to clipboard"
3. Agent pastes into Messenger text area and sends to customer

## Files to Modify

- `src/components/messaging/customer-panel.tsx` — add copy icon button on order cards
- `src/components/orders/order-detail-content.tsx` — add "Copy Invoice" button
- New utility: `src/lib/format-order-summary.ts` — shared function to generate the plain-text summary

## No New Dependencies

Uses existing `navigator.clipboard.writeText()` pattern already in the codebase.
