# Product Requirements Document (PRD) v2

## Inventory, Inspection & Order System
### P / PG / Config / G Architecture

---

## 1. Overview

This document defines the requirements for an inventory, inspection, repair, and selling system designed for a refurb / resale business operating through auctions, wholesalers, and **Individual Kaitori** (direct purchase from individuals).

The system prioritizes:
- per-unit traceability
- fast IT inspection workflows
- accurate condition grading
- reusable media assets
- live selling with minimal human error

---

## 2. Core Design Principles

1. **One physical item = one permanent code (P-code)**
2. **Photos describe visual identity, not condition**
3. **Specs are verified by IT, not trusted from suppliers**
4. **Condition describes quality; Status describes workflow**
5. **Selling is group-based (G-code), not unit-based**
6. **Every P-item has a QR code as its single physical identifier**

---

## 3. Tech Stack

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Data Fetching | TanStack Query |
| Forms | React Hook Form + Zod validation |
| Routing | React Router |
| QR Generation | qrcode.react (display) + qrcode (print) |

### Backend (Supabase)
| Layer | Technology |
|---|---|
| Database | PostgreSQL (Supabase hosted) |
| Auth | Supabase Auth |
| File Storage | Supabase Storage (photo group media) |
| Realtime | Supabase Realtime (live inventory updates) |
| Business Logic | Supabase Edge Functions (code generation, order processing) |

### Deployment
| Layer | Technology |
|---|---|
| Frontend | Vercel or Netlify |
| Backend | Supabase Cloud |

### Why This Stack
- **Vite over Next.js**: Customers access via shared links from live selling (no SEO needed). Vite is simpler, faster HMR, fewer abstractions.
- **Supabase handles backend**: No need for Next.js API routes. Edge Functions cover business logic.
- **TypeScript**: Catches errors in complex data model (P/PG/G codes, grades, statuses) at compile time.

---

## 4. Identifier System

| Code | Example | Meaning | Physical Label |
|---|---|---|---|
| P-code | P000417 | One physical item | QR code sticker |
| PG-code | PG000123 | Photo Group (model + color) | None |
| G-code | G000456 | Sell Group (price + grade) | None |
| KT-code | KT000789 | Kaitori Request | None |

### QR Code System
- Every P-code generates a QR code automatically on item creation
- QR encodes the P-code string (e.g., "P000417")
- QR is printed on a sticker and physically attached to the item
- QR is the **only** physical label on the item
- Scanning the QR code at any workflow stage pulls up the item record
- Used at: intake, IT inspection, repair tracking, packing/shipping verification

---

## 5. Data Model Overview

### 5.1 product_models

Stores common, shared specs for a model.

Fields:
- id (uuid, PK)
- brand
- model_name
- chipset / cpu_family
- screen_size
- ports
- year
- other_features
- model_notes
- created_at
- updated_at

---

### 5.2 config_groups

Stores spec variants that affect selling.

Fields:
- id (uuid, PK)
- product_model_id (FK → product_models)
- cpu
- ram_gb
- storage_gb
- os_family
- keyboard_layout
- has_touchscreen
- has_dedicated_gpu
- has_thunderbolt
- supports_stylus
- config_notes
- status (DRAFT / CONFIRMED)
- created_at
- updated_at

---

### 5.3 photo_groups (PG)

Stores reusable visual identity by model and color.

Fields:
- id (uuid, PK)
- photo_group_code (PG000000)
- product_model_id (FK → product_models)
- color
- status (DRAFT / ACTIVE)
- verified_by (FK → auth.users, nullable)
- verified_at (timestamp, nullable)
- created_at
- updated_at

---

### 5.4 photo_group_media

Stores photos and videos for Photo Groups.

Fields:
- id (uuid, PK)
- photo_group_id (FK → photo_groups)
- media_type (image / video)
- file_url (Supabase Storage path)
- role (hero / gallery / video)
- sort_order
- created_at

---

### 5.5 items (P)

Represents one physical unit.

Fields:
- id (uuid, PK)
- item_code (P000000, unique)
- supplier_id (FK → suppliers)
- purchase_price
- photo_group_id (FK → photo_groups, nullable)
- photo_group_verified (boolean, default false)
- config_group_id (FK → config_groups, nullable)
- condition_grade (S/A/B/C/D/J, nullable — set during inspection)
- item_status (INTAKE / AVAILABLE / REPAIR / MISSING)
- source_type (AUCTION / WHOLESALE / KAITORI — tracks where item came from)
- kaitori_request_id (FK → kaitori_requests, nullable — links to Kaitori request if applicable)
- ac_adapter_status (CORRECT / INCORRECT / MISSING)
- inspected_by (FK → auth.users, nullable)
- inspected_at (timestamp, nullable)
- specs_notes
- condition_notes
- created_at
- updated_at

All field changes on items (except id, item_code, created_at, updated_at, gallery_photo_order, hidden_product_photo_ids) are automatically recorded in item_audit_logs via a database trigger for full traceability.

---

### 5.6 sell_groups (G)

Defines how items are sold.

Fields:
- id (uuid, PK)
- sell_group_code (G000000, unique)
- photo_group_id (FK → photo_groups)
- config_group_id (FK → config_groups)
- condition_grade (S/A/B/C/D)
- base_price
- active (boolean)
- created_at
- updated_at

---

### 5.7 sell_group_items (junction table) ← NEW

Links individual P-items to their Sell Group for fulfillment tracking.

Fields:
- id (uuid, PK)
- sell_group_id (FK → sell_groups)
- item_id (FK → items, unique — one item belongs to one G at a time)
- assigned_at

---

### 5.8 suppliers

Fields:
- id (uuid, PK)
- supplier_name
- supplier_type (auction / wholesaler / individual_kaitori)
- contact_info
- notes
- created_at
- updated_at

---

### 5.9 customers ← NEW

Stores accounts for both buyers and Kaitori sellers (same person can be both).

Fields:
- id (uuid, PK)
- customer_code (CUST000000, unique)
- last_name
- first_name (nullable)
- email
- phone
- pin_hash (hashed 6-digit PIN)
- shipping_address (default address, nullable)
- is_seller (boolean, default false — set to true when they use Kaitori)
- bank_name (nullable — for Kaitori payouts)
- bank_branch (nullable)
- bank_account_number (nullable)
- bank_account_holder (nullable)
- id_verified (boolean, default false)
- id_verified_at (timestamp, nullable)
- id_document_url (Supabase Storage path, nullable — 本人確認 document)
- created_at
- updated_at

Authentication: Customers log in using **email or phone + last name + 6-digit PIN**. This is a lightweight auth system separate from Supabase Auth (which is for staff only). Returning customers can view order history. Sellers use the same account with additional bank and ID fields.

---

### 5.10 orders ← NEW

Tracks customer purchases.

Fields:
- id (uuid, PK)
- order_code (ORD000000, unique)
- customer_id (FK → customers)
- sell_group_id (FK → sell_groups)
- order_source (SHOP / LIVE_SELLING)
- shipping_address
- quantity
- total_price
- order_status (PENDING / CONFIRMED / PACKED / SHIPPED / DELIVERED / CANCELLED)
- created_at
- updated_at

---

### 5.11 order_items ← NEW

Links specific P-items to an order for shipment verification.

Fields:
- id (uuid, PK)
- order_id (FK → orders)
- item_id (FK → items, unique — one item per order)
- packed_at (timestamp, nullable — set when QR scanned at packing)
- packed_by (FK → auth.users, nullable)

---

### 5.12 kaitori_price_list ← NEW

Fixed price list for Kaitori auto-quoting. Defines what we pay for each model + condition combination.

Fields:
- id (uuid, PK)
- product_model_id (FK → product_models)
- config_group_id (FK → config_groups, nullable — for spec-specific pricing)
- battery_condition (GOOD / FAIR / POOR)
- screen_condition (GOOD / FAIR / POOR / CRACKED)
- body_condition (GOOD / FAIR / POOR / DAMAGED)
- purchase_price (integer — yen amount we pay)
- active (boolean)
- created_at
- updated_at

Notes: The combination of product_model + config + battery + screen + body determines the auto-quote price. Staff maintains this price list via admin panel.

---

### 5.13 kaitori_requests ← NEW

Tracks the full lifecycle of a Kaitori purchase request from a seller.

Fields:
- id (uuid, PK)
- kaitori_code (KT000000, unique)
- customer_id (FK → customers — the seller)
- product_model_id (FK → product_models)
- config_group_id (FK → config_groups, nullable)
- battery_condition (GOOD / FAIR / POOR)
- screen_condition (GOOD / FAIR / POOR / CRACKED)
- body_condition (GOOD / FAIR / POOR / DAMAGED)
- seller_notes (text, nullable — anything the seller wants to mention)
- auto_quote_price (integer — system-calculated price from kaitori_price_list)
- final_price (integer, nullable — may differ after staff inspection)
- price_revised (boolean, default false)
- revision_reason (text, nullable — why price changed from auto-quote)
- seller_accepted_revision (boolean, nullable — seller agrees to revised price)
- delivery_method (SHIP / WALK_IN)
- tracking_number (nullable — if shipped)
- request_status (QUOTED / ACCEPTED / SHIPPED / RECEIVED / INSPECTING / PRICE_REVISED / APPROVED / PAID / REJECTED / CANCELLED)
- payment_method (CASH / BANK_TRANSFER, nullable)
- paid_at (timestamp, nullable)
- paid_by (FK → auth.users, nullable — staff who processed payment)
- inspected_by (FK → auth.users, nullable)
- inspected_at (timestamp, nullable)
- created_at
- updated_at

---

### 5.14 kaitori_request_media ← NEW

Photos uploaded by the seller during Kaitori self-assessment.

Fields:
- id (uuid, PK)
- kaitori_request_id (FK → kaitori_requests)
- media_type (image)
- file_url (Supabase Storage path)
- role (front / back / screen / battery_info / damage / other)
- sort_order
- created_at

---

### 5.15 item_audit_logs ← NEW

Tracks all field-level changes to items for audit traceability. Populated automatically by a database trigger on the items table.

Fields:
- id (uuid, PK)
- item_id (FK → items, CASCADE on delete)
- changed_by (FK → auth.users, nullable — staff who made the change)
- field_name (text — which column changed)
- old_value (text, nullable)
- new_value (text, nullable)
- created_at

Notes: The trigger function `log_item_changes()` fires AFTER UPDATE on items and records every changed field except id, item_code, created_at, updated_at, gallery_photo_order, and hidden_product_photo_ids. RLS restricts access to read-only for staff; inserts are handled by the trigger running as SECURITY DEFINER.

---

## 6. Entity Relationships

```
┌─────────────────┐
│    suppliers    │
└────────┬────────┘
         │ 1:N
         ▼
┌─────────────────┐      N:1     ┌──────────────────┐
│     items (P)   │─────────────►│   photo_groups   │
│   P000417       │              │   (PG000123)     │
└────────┬────────┘              └────────┬─────────┘
         │                                │
         │ N:1                           │ N:1
         ▼                                ▼
┌─────────────────┐      N:1     ┌──────────────────┐
│  config_groups  │◄─────────────│  product_models  │
└─────────────────┘              └──────────────────┘
         ▲
         │ N:1
┌────────┴────────┐
│  sell_groups(G) │◄─── also references photo_groups
│   G000456       │     and condition_grade
└────────┬────────┘
         │
         │ 1:N (via sell_group_items)
         ▼
┌─────────────────┐      1:N     ┌──────────────────┐
│   customers     │──────────────│     orders       │
│  CUST000001     │              │  ORD000001       │
└─────────────────┘              └────────┬─────────┘
                                          │ 1:N
                                          ▼
                                 ┌──────────────────┐
                                 │   order_items    │
                                 │  (links P-items) │
                                 └──────────────────┘
```

---

## 7. Classification System

### 7.1 Condition Grade

| Grade | Meaning | Sellable |
|---|---|---|
| S | Brand new / open box | Yes |
| A | Very good | Yes |
| B | Good | Yes |
| C | Fair | Yes |
| D | As-is, major issues | Yes |
| J | Junk / parts | No |

---

### 7.2 Item Status

| Status | Meaning |
|---|---|
| INTAKE | Just arrived, not yet inspected |
| AVAILABLE | Inspected and ready to sell |
| REPAIR | Waiting for parts / repair |
| MISSING | Cannot be physically located |

---

## 8. SOP Summary

### 8.1 Inventory Intake

1. Items arrive from supplier
2. Each unit receives a P-code (auto-generated)
3. **QR code is generated and printed as a sticker**
4. **QR sticker is physically attached to the item**
5. Optional bulk PG assignment
6. Item status set to INTAKE
7. Item sent to IT inspection

---

### 8.2 IT Inspection

IT scans QR code to pull up item record.

IT confirms:
- photo group vs actual appearance
- specs (CPU, RAM, storage, etc.)
- physical condition
- AC adapter correctness

IT decides:
- sell as-is → AVAILABLE
- repair needed → REPAIR
- junk → grade J

IT assigns:
- condition grade (S/A/B/C/D/J)
- item status
- inspected_by / inspected_at recorded automatically

---

### 8.3 Repair Flow

- Items needing parts are marked REPAIR
- Parts are ordered (SSD, RAM, LCD, AC, etc.)
- After repair, **QR is scanned for re-inspection**
- Item re-graded and status changed to AVAILABLE

---

### 8.4 Selling Channels

The system supports two selling channels with the same checkout flow:

#### Shop Page (Browse & Buy)
1. Customer browses the public shop page
2. Products displayed in two levels:
   - **Level 1 — Product Card**: Grouped by model + config (e.g., "iPhone 12 128GB — 8 pcs — ¥14,900 ~ ¥19,900")
   - **Level 2 — Grade Breakdown**: Click to expand and see per-grade listings (Grade A: 3 pcs ¥19,900 / Grade B: 3 pcs ¥17,900 / etc.)
3. Customer selects a grade and quantity
4. Proceeds to checkout (same flow as live selling)

#### Live Selling
1. Live seller shares a direct link for a specific G-code
2. Customer clicks the link and proceeds to checkout

#### Shared Checkout Flow
1. Customer registers or logs in: **email or phone + last name + 6-digit PIN**
2. Customer enters shipping address (or uses saved default)
3. Order record created → P-items reserved via order_items
4. **Packing staff scans QR code to verify correct item**
5. packed_at / packed_by recorded on scan
6. Item shipped

#### Customer Account
- Returning customers log in with email/phone + last name + PIN
- Customers can view their **order history** and track status
- Customer accounts are shared across shop, live-selling, and Kaitori channels

---

### 8.5 Kaitori Flow (Individual Purchase)

Kaitori allows individuals to sell their phones, laptops, and tablets directly to us.

#### Step 1 — Online Self-Assessment
1. Seller logs in or registers (same customer account system)
2. Seller selects product model from a list (phones / laptops / tablets)
3. Seller selects configuration (storage, etc.) if applicable
4. Seller answers simple condition questions:
   - **Battery**: Good / Fair / Poor
   - **Screen**: Good / Fair / Poor / Cracked
   - **Body**: Good / Fair / Poor / Damaged
5. Seller uploads photos (front, back, screen, damage if any)
6. Seller adds optional notes
7. System auto-calculates quote from **kaitori_price_list**
8. Seller sees the quoted price instantly
9. Kaitori request created with status QUOTED

#### Step 2 — Seller Accepts & Ships/Walks In
1. Seller accepts the quote → status changes to ACCEPTED
2. Seller chooses delivery method:
   - **Ship**: System provides shipping instructions, seller enters tracking number → status: SHIPPED
   - **Walk-in**: Seller brings item to our location
3. Item received → status: RECEIVED

#### Step 3 — Staff Inspection
1. Staff opens the Kaitori request and inspects the physical item
2. Staff compares actual condition against seller's self-assessment
3. **If condition matches** → status: APPROVED, final_price = auto_quote_price
4. **If discrepancy found** → status: PRICE_REVISED
   - Staff enters revised price and reason
   - Seller is notified and must accept or reject the new price
   - If seller accepts → status: APPROVED
   - If seller rejects → status: CANCELLED, item returned to seller

#### Step 4 — Payment
1. Staff processes payment via seller's preferred method:
   - **Cash**: Paid on the spot (walk-in)
   - **Bank transfer**: Paid to seller's registered bank account
2. paid_at / paid_by recorded
3. Status: PAID

#### Step 5 — Item Enters Inventory
1. P-code created with `source_type = KAITORI` and linked to kaitori_request_id
2. QR code generated and attached
3. Item enters normal INTAKE → IT Inspection → AVAILABLE pipeline
4. A supplier record of type `individual_kaitori` is auto-created or linked for the seller

#### Identity Verification (本人確認)
- Required by Japanese secondhand goods law (古物営業法)
- Seller must upload government-issued ID on first Kaitori transaction
- ID document stored securely in Supabase Storage
- id_verified flag set after staff review
- Sellers cannot complete a Kaitori transaction without verified identity

---

## 9. Shop Page

### 9.1 Overview
A public-facing browsable catalog where customers can search, browse, and order items directly. No SEO required — customers arrive via shared links and social media.

### 9.2 Product Display (Two-Level Browse)

**Level 1 — Product Cards**
Products are grouped by product_model + config_group. Each card shows:
- Product name (brand + model + key specs like storage)
- Hero photo (from photo group)
- Total available quantity (sum across all grades)
- Price range ("From ¥14,900 to ¥19,900")

**Level 2 — Grade Breakdown**
Clicking a product card expands to show each available G-code as a row:
- Condition grade (A / B / C / D / S)
- Quantity available
- Price per unit
- "Add to order" action

### 9.3 Search & Filter
- Text search by brand, model name, specs
- Filter by: brand, form factor, price range, condition grade
- Sort by: price (low/high), newest, most available

### 9.4 Data Flow
The shop page queries sell_groups that are `active = true`, joined with:
- product_models + config_groups (for display name and specs)
- photo_groups + photo_group_media (for hero image)
- sell_group_items count (for available quantity)

Only G-codes with at least one AVAILABLE, unordered P-item are shown.

---

## 10. Guardrails

### Selling Guardrails
- Items with status REPAIR, MISSING, or INTAKE cannot be sold
- G-codes can only include AVAILABLE items
- Items with grade J cannot be added to sell groups
- Photo Groups must be verified by IT before selling
- P-code QR is the only physical identifier
- One item can only belong to one sell group at a time (enforced by unique constraint)
- One item can only belong to one order (enforced by unique constraint)
- Packing scan must match order_items before shipping

### Kaitori Guardrails
- Seller must have verified identity (本人確認) before completing any Kaitori transaction
- Auto-quote can only be generated if a matching kaitori_price_list entry exists
- Price revision requires a reason (revision_reason cannot be null when price_revised = true)
- Seller must explicitly accept revised price before payment can proceed
- Payment cannot be processed until request status is APPROVED
- Kaitori items enter inventory as source_type = KAITORI and are linked to the kaitori_request_id
- Bank details must be on file before bank transfer payment can be processed

---

## 11. Success Metrics

- Zero wrong-item shipments (verified by QR scan at packing)
- Reduced IT inspection time (scan-to-inspect workflow)
- Lower repair losses
- Faster intake-to-sell cycle
- Higher customer trust
- Full audit trail (who inspected, who packed, when)
- Kaitori: High quote-to-completion conversion rate
- Kaitori: Low price revision rate (accurate self-assessment questions)
- Kaitori: Fast quote-to-payment cycle
- Kaitori: 100% identity verification compliance

---

## 12. Final Principle

**Items are physical.
Photos are references.
Specs are verified.
Groups are how we sell.
Kaitori is how we buy.
QR codes tie it all together.**
