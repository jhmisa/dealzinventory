# Plan: Customer Returns / Claims System

## Context

Customers who receive items that are faulty, damaged, or not as described need a way to initiate a return from the customer portal. Currently there is no returns flow — once an item is SOLD and DELIVERED, the customer has no self-service option.

## Goals

1. Customer can report a problem on any SHIPPED or DELIVERED order from the portal
2. Customer provides: which item(s), issue category, description, photos/videos
3. Staff reviews on admin side, approves/rejects, coordinates return shipping
4. Returned items re-enter inventory at INTAKE status for re-inspection
5. Full audit trail of return lifecycle

---

## Data Model

### New table: `return_requests`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| return_code | text UNIQUE | `RET000001` format |
| order_id | uuid FK → orders | The original order |
| customer_id | uuid FK → customers | |
| return_status | text | See status flow below |
| reason_category | text | `DEFECTIVE`, `WRONG_ITEM`, `DAMAGED_IN_TRANSIT`, `NOT_AS_DESCRIBED`, `OTHER` |
| customer_description | text | Free-text from customer |
| staff_notes | text | Internal notes |
| resolution | text | `REFUND`, `REPLACE`, `REPAIR`, `REJECTED` (set at resolution) |
| resolution_notes | text | Explanation to customer |
| refund_amount | integer | Nullable, set when resolved |
| created_at | timestamptz | |
| approved_at | timestamptz | |
| received_at | timestamptz | When item arrives back |
| resolved_at | timestamptz | |
| updated_at | timestamptz | |

### New table: `return_request_items`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| return_request_id | uuid FK → return_requests | |
| order_item_id | uuid FK → order_items | Which line item is being returned |
| item_id | uuid FK → items | The physical item (nullable for custom items) |
| reason_note | text | Item-specific issue note |

### New table: `return_request_media`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| return_request_id | uuid FK → return_requests | |
| file_url | text | Storage path |
| media_type | text | `image` or `video` |
| sort_order | integer | |
| uploaded_at | timestamptz | |

### New Supabase Storage bucket: `return-media`
- Public read (customer and staff both need to view)

### New sequence: `ret_code_seq` for generating RET codes

---

## Return Status Flow

```
SUBMITTED → APPROVED → SHIPPED_BACK → RECEIVED → INSPECTING → RESOLVED
                                                              → REJECTED
         → REJECTED (staff can reject immediately)
         → CANCELLED (customer can cancel before SHIPPED_BACK)
```

| Status | Who sets it | Meaning |
|--------|------------|---------|
| SUBMITTED | Customer | Customer filed the return request |
| APPROVED | Staff | Staff approved, customer can ship back |
| SHIPPED_BACK | Customer | Customer marked as shipped (or staff for walk-in) |
| RECEIVED | Staff | Item arrived at warehouse |
| INSPECTING | Staff | Staff is inspecting the returned item |
| RESOLVED | Staff | Return complete — refund/replace/repair decided |
| REJECTED | Staff | Return denied (with explanation) |
| CANCELLED | Customer | Customer cancelled before shipping |

---

## Item Status Integration

When a return is **APPROVED**:
- Item status stays SOLD (item is still with customer)

When item is **RECEIVED**:
- Item status changes: SOLD → INTAKE
- Item is now unlocked for editing (re-inspection)

When **RESOLVED** with `REFUND` or `REPLACE`:
- Item goes through normal inspection flow (INTAKE → AVAILABLE or REPAIR)

When **REJECTED**:
- Item status reverts to SOLD (customer keeps it)

---

## Implementation Steps

### Part 1: Database (migration + RLS)

- [ ] Create `return_requests`, `return_request_items`, `return_request_media` tables
- [ ] Create `ret_code_seq` sequence and register with `generate_code` RPC
- [ ] Create `return-media` storage bucket
- [ ] RLS policies:
  - Customers can SELECT their own return requests
  - Customers can INSERT return requests for their own orders
  - Customers can INSERT media for their own return requests
  - Staff can SELECT/UPDATE all return requests
  - Staff cannot DELETE return requests (audit trail)

### Part 2: Edge Function — `create-return-request`

Needed because the customer portal runs with anon key (like claim-offer).

**Input:** `{ order_id, customer_id, reason_category, description, items: [{ order_item_id, reason_note }] }`

**Steps:**
1. Validate order belongs to customer, status is SHIPPED or DELIVERED
2. Validate items belong to the order
3. Check no existing open return for same items
4. Generate RET code
5. Insert return_request + return_request_items
6. Return `{ return_code, return_request_id }`

Media upload happens separately via direct Supabase Storage upload from client.

### Part 3: Service Layer

**New file:** `src/services/returns.ts`
- `createReturnRequest()` — calls Edge Function
- `getCustomerReturns(customerId)` — for customer portal
- `getReturnRequest(id)` — detail view
- `getReturnRequests(filters)` — admin list
- `updateReturnStatus(id, status, notes?)` — admin status progression
- `resolveReturn(id, resolution, refundAmount?, notes?)` — final resolution
- `uploadReturnMedia(returnRequestId, file)` — upload to storage
- `getReturnMedia(returnRequestId)` — list media

### Part 4: Customer Portal

**New pages:**

#### Return Request Form (`src/pages/customer/return-request.tsx`)
- Accessible from order detail page via "Report a Problem" button
- Only shown when order status is SHIPPED or DELIVERED
- Step 1: Select which item(s) have issues (checkboxes of order_items)
- Step 2: Pick reason category (dropdown), describe the problem (textarea)
- Step 3: Upload photos/videos (drag & drop or file picker, max 5 files)
- Step 4: Review and submit

#### Return Status Page (`src/pages/customer/return-detail.tsx`)
- Shows return code, status tracker (like order status tracker)
- Shows submitted photos/videos
- Shows customer's description
- Shows staff resolution notes (when resolved)
- Shows refund amount (when applicable)

#### Returns List (`src/pages/customer/returns.tsx`)
- List of all return requests with status badges
- Linked from customer dashboard

**Modified pages:**
- `src/pages/customer/order-detail.tsx` — add "Report a Problem" button
- `src/pages/customer/dashboard.tsx` — add recent returns section
- `src/components/layout/customer-layout.tsx` — add "Returns" nav link

### Part 5: Admin Portal

**New pages:**

#### Returns List (`src/pages/admin/returns.tsx`)
- Table with: return code, order code, customer name, reason category, status, date
- Filters: status, reason category, search
- Click to view detail

#### Return Detail (`src/pages/admin/return-detail.tsx`)
- Customer info + order link
- Returned item(s) with photos from original order
- Customer's problem description + uploaded media
- Reason category
- Status tracker with action buttons:
  - SUBMITTED → "Approve Return" or "Reject" (with reason textarea)
  - APPROVED → (waiting for customer to ship)
  - SHIPPED_BACK → "Mark as Received"
  - RECEIVED → "Begin Inspection"
  - INSPECTING → "Resolve" (pick resolution type, refund amount, notes)
- Staff notes field
- Link to item detail page for re-inspection

**Modified pages:**
- `src/pages/admin/order-detail.tsx` — show linked return requests if any
- Admin sidebar — add "Returns" nav item

### Part 6: Hooks

**New file:** `src/hooks/use-returns.ts`
- `useReturns(filters)` — admin list
- `useReturnRequest(id)` — detail
- `useCustomerReturns(customerId)` — customer portal
- `useCreateReturnRequest()` — mutation
- `useUpdateReturnStatus()` — mutation
- `useResolveReturn()` — mutation
- `useUploadReturnMedia()` — mutation

### Part 7: Validators

**New file:** `src/validators/return.ts`
- `createReturnSchema` — reason_category (required), description (required, min 10 chars), items (at least 1)
- `resolveReturnSchema` — resolution (required), refund_amount (required if REFUND), notes

### Part 8: Routes

Add to `src/routes.tsx`:
- Customer: `/account/returns`, `/account/returns/:id`, `/account/orders/:id/return`
- Admin: `/admin/returns`, `/admin/returns/:id`

---

## Reason Categories

| Value | Customer Label |
|-------|---------------|
| DEFECTIVE | "Item is defective / not working" |
| WRONG_ITEM | "Received wrong item" |
| DAMAGED_IN_TRANSIT | "Damaged during shipping" |
| NOT_AS_DESCRIBED | "Not as described (specs, condition)" |
| OTHER | "Other issue" |

---

## Resolution Types

| Value | Meaning |
|-------|---------|
| REFUND | Full or partial refund issued |
| REPLACE | Replacement item sent |
| REPAIR | Item repaired and sent back |
| REJECTED | Return denied (item not faulty, outside window, etc.) |

---

## Business Rules

1. Returns can only be filed for SHIPPED or DELIVERED orders
2. Returns must be filed within 14 days of delivery (configurable)
3. Customer cannot return the same item twice (check for open return)
4. Media uploads: max 5 files, max 50MB each, images + videos only
5. Customer can cancel a return before SHIPPED_BACK status
6. Staff must provide a reason when rejecting a return
7. Refund amount defaults to the item's unit_price but can be adjusted
8. When item is received back, it transitions SOLD → INTAKE for re-inspection

---

## Files to Create

| File | Purpose |
|------|---------|
| Migration SQL | Tables, sequences, RLS, storage bucket |
| `supabase/functions/create-return-request/index.ts` | Edge Function |
| `src/services/returns.ts` | Service layer |
| `src/hooks/use-returns.ts` | React Query hooks |
| `src/validators/return.ts` | Zod schemas |
| `src/pages/customer/return-request.tsx` | Customer return form |
| `src/pages/customer/return-detail.tsx` | Customer return status |
| `src/pages/customer/returns.tsx` | Customer returns list |
| `src/pages/admin/returns.tsx` | Admin returns list |
| `src/pages/admin/return-detail.tsx` | Admin return detail + actions |

## Files to Modify

| File | Change |
|------|--------|
| `src/routes.tsx` | Add return routes |
| `src/pages/customer/order-detail.tsx` | Add "Report a Problem" button |
| `src/pages/customer/dashboard.tsx` | Add recent returns |
| `src/components/layout/customer-layout.tsx` | Add "Returns" nav |
| `src/pages/admin/order-detail.tsx` | Show linked returns |
| `src/lib/constants.ts` | Add RETURN_STATUSES, RETURN_REASONS, RESOLUTION_TYPES |
| `src/lib/query-keys.ts` | Add returns query keys |
| Admin sidebar component | Add "Returns" nav item |
