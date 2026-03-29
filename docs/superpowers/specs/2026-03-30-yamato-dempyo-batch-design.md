# Yamato Dempyo Batch & Invoice Batch Printing

**Date:** 2026-03-30
**Status:** Approved

## Overview

Add batch invoice printing and Yamato dempyo (shipping label) xlsx generation for CONFIRMED orders. Both operations track print timestamps per order, support reprinting, and handle multi-box shipments.

## Database Changes

### New columns on `orders`

| Column | Type | Default | Purpose |
|---|---|---|---|
| `invoice_printed_at` | timestamptz | NULL | When this order's invoice was last batch-printed |
| `dempyo_printed_at` | timestamptz | NULL | When this order was last included in a dempyo xlsx |
| `delivery_box_count` | integer | 1 | Number of shipping boxes for this order |

### New table: `system_settings`

Key-value store for configurable business values.

| Key | Value | Type | Purpose |
|---|---|---|---|
| `credit_card_surcharge_pct` | `4` | numeric | % surcharge added as a line item for credit card COD orders |

## Credit Card Surcharge

- When an order's payment_method = CREDIT_CARD, a visible line item "Credit Card Fee" is added to the order
- Amount = subtotal × (surcharge_pct / 100)
- This line item is included in `total_price` via the existing `recalculateOrderTotal()` flow
- The surcharge % is configurable in the admin Settings page
- The dempyo generator does NOT calculate any surcharge — it uses `total_price` as-is

## UI Changes

### Orders Page — Confirmed Tab

**Toolbar buttons:**

1. **"Print Invoices (N)"** — N = count of CONFIRMED orders where `invoice_printed_at IS NULL`
   - Disabled when N = 0
   - Generates single HTML document with all unprinted invoices, page-break between each
   - Opens browser print dialog via iframe (same technique as existing single-invoice print)
   - After print dialog closes, stamps `invoice_printed_at = now()` on all included orders

2. **"Print Dempyo (N)"** — N = count of CONFIRMED orders where `dempyo_printed_at IS NULL` AND shipping address is JP
   - Disabled when N = 0
   - Validates required fields, shows warnings for invalid orders (excluded from batch)
   - Generates and downloads xlsx file
   - Stamps `dempyo_printed_at = now()` on all included orders

**Table row indicators:**

- Invoice printed: checkmark icon if `invoice_printed_at` is set, dash otherwise
- Dempyo printed: checkmark icon if `dempyo_printed_at` is set, dash otherwise

### Order Detail Page

- Display `invoice_printed_at` and `dempyo_printed_at` timestamps in order metadata section
- New **"Delivery Boxes"** number input (default 1), editable before dempyo generation
- Existing single-order "Print Invoice" button also stamps `invoice_printed_at`

### Admin Settings Page

- **Credit Card Surcharge %** — numeric input, default 4, stored in `system_settings`

## Print Invoices Flow

1. Fetch all CONFIRMED orders where `invoice_printed_at IS NULL`
2. For each order, generate invoice HTML using existing `invoice-pdf.ts` template
3. Concatenate all invoices into a single HTML document with `page-break-after: always` between each
4. Render via hidden iframe, trigger `window.print()`
5. On completion, update `invoice_printed_at = now()` for all included orders

## Print Dempyo Flow

### Step 1 — Select eligible orders

Query all CONFIRMED orders where:
- `dempyo_printed_at IS NULL`
- `shipping_address` is a JP address (non-JP silently excluded)

### Step 2 — Validate required fields

For each order, check:
- Recipient name (customer first_name + last_name)
- Postal code (from shipping_address)
- Payment method

Orders missing required fields are flagged with warnings and excluded from the batch. The UI shows which orders were skipped and why.

### Step 3 — Address length warning

After removing spaces from the full JP address, warn if total length > 48 characters (would be truncated on the printed waybill). These orders are still included but flagged.

### Step 4 — Generate Sheet 2 data

For each valid order, write one or more rows to Sheet 2:

#### Column mapping

| Sheet 2 Col | Field | Source |
|---|---|---|
| D | Recipient name | `customer.first_name + " " + customer.last_name` |
| F | Phone | `customer.phone` (with hyphens as stored) |
| H | English address (reference only) | `prefecture_en + " " + city_en + " " + town_en + " " + address_line_1` |
| M | Postal code | `shipping_address.postal_code` |
| P | Full JP address | `prefecture_ja + " " + city_ja + " " + town_ja + " " + address_line_1 [ + " " + address_line_2]` |
| U | Postal code (reference duplicate) | Same as M |
| AF | COD amount | `total_price` when payment is COD or CREDIT_CARD; empty for prepaid |
| AN | Payment method text | `"Cash on Delivery"` for COD/CREDIT_CARD; `"Bank"` for BANK; `"Konbini"` for KONBINI; `"Cash"` for CASH |
| AV | Delivery time slot | `delivery_time_code` as number: '01'→1, '14'→14, '16'→16, '04'→4; blank if none |
| AW | Delivery date | `delivery_date` formatted as YYYYMMDD; blank if none |
| AZ | Item description | Item codes/descriptions joined with ` / ` (e.g., `P000001 / P000006 / mouse`) |
| BC | Order reference | `order_code` (e.g., ORD000001) |
| AL | Print count (発行枚数) | Box count for prepaid multi-box only; blank otherwise |
| AM | Multi-box flag (個数口表示フラグ) | `3` if multi-box; blank if single box |
| BV | Grouping key (複数口くくりキー) | Order code for multi-box only; blank if single box |

#### Multi-box rules

**Single box (`delivery_box_count = 1`, default):**
- 1 row in Sheet 2
- AL, AM, BV left blank

**Multi-box, prepaid (Bank/Konbini/Cash):**
- 1 row in Sheet 2
- AL = `delivery_box_count`
- AM = 3 (prints "1/N", "2/N", etc. on each waybill)
- BV = order code

**Multi-box, COD (COD/Credit Card):**
- N rows in Sheet 2 (one per box), all with identical recipient details
- AM = 3 on every row
- BV = order code on every row
- AF (COD amount) = `total_price` on row 1 only; blank on rows 2+
- AL must be left blank (not available for COD)

#### Sheet 1 address auto-splitting

Sheet 1 formulas take col P, remove all half-width spaces, and split at fixed character positions:
- L (chars 1–16): Main address (prefecture + city + town + street)
- M (chars 17–32): Apartment/building name
- N (chars 33–48): Company/dept

This is a line-break for the printed waybill — L+M+N print as consecutive address lines. Even imperfect splits are readable by the delivery driver.

#### Sheet 1 auto-populated fields (no action needed)

- Shipment date (出荷予定日) → TODAY()
- Sender: 株式会社Dealz, 東京都足立区中央本町3-5-3, 03-5851-7740
- Billing customer code: 035851774001
- Freight management number: 01
- Invoice type: derived from col AN ("Cash on Delivery" → 2, anything else → 0)
- COD tax (内消費税額等): auto-calculated from col AF
- Delivery date/time: derived from cols AW/AV

### Step 5 — Generate xlsx file

1. Load template from `public/templates/yamato-template.xlsx` using SheetJS
2. Clear all existing data from Sheet 2
3. Write rows starting at row 1 (no header row)
4. Do NOT modify Sheet 1 (contains formulas) except for AL/AM/BV pass-through formulas (one-time template setup)
5. Trigger browser download

### Step 6 — Save file

Filename: `YYYY-MM-DD-HH-MM-yamato.xlsx` (current date/time at generation)

### Step 7 — Mark orders

Update `dempyo_printed_at = now()` on all orders included in this batch.

## Template Modification (One-time)

Add pass-through formulas to Sheet 1 for columns AL, AM, BV (rows 2–310) that read from corresponding Sheet 2 cells:
- `AL2 = データ貼付!AL1`
- `AM2 = データ貼付!AM1`
- `BV2 = データ貼付!BV1`
- (repeat through row 310)

These columns currently have no formulas — only header text in row 1.

## Reprint Flow

- To reprint an order: set `dempyo_printed_at = NULL` (or `invoice_printed_at = NULL`) → order appears in the next batch automatically
- Single-order invoice reprint from order detail page is also supported (existing Print Invoice button)
- Alternatively, a single-order dempyo can be generated on request

## Validation Summary

| Condition | Action |
|---|---|
| Non-JP shipping address | Silently skip (handled manually by team) |
| Missing recipient name | Warn, exclude from batch |
| Missing postal code | Warn, exclude from batch |
| Missing payment method | Warn, exclude from batch |
| Address > 48 chars (no spaces) | Warn but still include |

## Dependencies

- **SheetJS (`xlsx`)** — npm package for client-side xlsx read/write
- Template file at `public/templates/yamato-template.xlsx`

## Delivery Time Slot Mapping

Our `delivery_time_code` values map to Sheet 2 col AV as numbers (strip leading zero):

| Our code | AV value | Yamato code | Time |
|---|---|---|---|
| '01' | 1 | 0812 | 午前中 (9AM–12PM) |
| '14' | 14 | 1416 | 14:00–16:00 |
| '16' | 16 | 1618 | 16:00–18:00 |
| '04' | 4 | 1820 | 18:00–20:00 |

## Payment Method → Yamato Mapping

| Payment Method | col AN text | col AF | Yamato invoice type |
|---|---|---|---|
| COD | `"Cash on Delivery"` | `total_price` | 2 (コレクト) |
| CREDIT_CARD | `"Cash on Delivery"` | `total_price` (includes surcharge line item) | 2 (コレクト) |
| BANK | `"Bank"` | (empty) | 0 (発払い) |
| KONBINI | `"Konbini"` | (empty) | 0 (発払い) |
| CASH | `"Cash"` | (empty) | 0 (発払い) |
