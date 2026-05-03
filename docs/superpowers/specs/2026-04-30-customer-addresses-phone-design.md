# Customer Address Management & International Phone Input

**Date:** 2026-04-30
**Status:** Draft

## Overview

Two upgrades to the customer system:
1. **Address management** — surface the existing `customer_addresses` table on the customer detail page with full CRUD (view, edit, delete)
2. **International phone input** — replace the Japan-only phone field with a country-code-aware input supporting all countries, with Japan and Philippines pinned at the top

## 1. Phone Input Component (`PhoneInput`)

### Appearance
- Left: clickable country selector showing flag emoji + dial code (e.g., `JP +81`)
- Right: phone number input with auto-formatting based on selected country
- Clicking the selector opens a searchable dropdown
- Dropdown order: Japan first, Philippines second, then alphabetical

### Formatting
- Japan (+81): `90-1234-5678`
- Philippines (+63): `917-123-4567`
- Other countries: raw digits, no formatting

### Storage
- E.164 format: `+819012345678`, `+639171234567`
- Used in `customers.phone` and `customer_addresses.receiver_phone`

### Display (read mode)
- Flag + formatted number: `JP +81 90-1234-5678`

### Usage locations
- Customer detail page (edit mode)
- Customer creation dialog
- Customer login page
- Address edit dialog (receiver phone)

## 2. Address Management on Customer Detail Page

### Replaces the "Shipping Address" section in the Contact Information card

The current single-address display is replaced with a list of all addresses from `customer_addresses`.

### Layout per address
- **Header row:** Label (e.g., "Address 1") + default badge (star + "Default" if `is_default`) + Edit button (pencil) + Delete button (trash)
- **Address body:** rendered via existing `AddressDisplay` component
- **Receiver info** (if set): shown below address — "Receiver: First Last" + phone with flag format
- Divider between addresses

### Add Address
- "+ Add Address" button at the bottom of the section

### Edit flow
- Opens a dialog with:
  - `AddressForm` component (existing)
  - Receiver first name, last name fields
  - Receiver phone (`PhoneInput` component)
  - "Set as default" checkbox
  - Save / Cancel

### Delete flow
- Confirmation dialog: "Delete this address?"
- Deleting the last address is allowed (customer can exist without addresses)

### Empty state
- "No addresses added" + "Add Address" button

## 3. Customer Main Phone Field

### Read mode
- Flag + formatted number, or `-` if empty

### Edit mode
- `PhoneInput` component replaces the current text input

### Customer creation dialog
- `PhoneInput` replaces the current phone text input

### Legacy display
- If phone doesn't start with `+` (not yet migrated), show raw value as-is

## 4. Customer Login

- Phone input on the login page uses the same `PhoneInput` component
- Customer selects country flag, enters number
- System matches against stored E.164 format
- Eliminates ambiguity between JP and PH numbers with similar digit patterns

## 5. Data Migration

One-time SQL migration:

### 5.1 Migrate `customers.phone` to E.164

| Pattern | Country | Action |
|---------|---------|--------|
| `090/080/070/050` + 8 digits | Japan | `+81` + drop leading `0` |
| `0[1-9][0-9]` landline (10 digits total, not matching mobile prefixes) | Japan | `+81` + drop leading `0` |
| `09[1-9]x` + 11 digits total | Philippines | `+63` + drop leading `0` |
| Everything else | Unknown | Leave untouched for staff |

### 5.2 Migrate `customers.shipping_address` to `customer_addresses`

- For each customer with non-null `shipping_address`, create a `customer_addresses` row with `is_default = true`, label "Address 1"
- Skip customers who already have rows in `customer_addresses`
- The `shipping_address` column remains in the table but the UI no longer reads from it

### 5.3 Migrate `customer_addresses.receiver_phone`

- Apply the same phone E.164 logic to existing `receiver_phone` values

## Non-goals

- Multiple phone numbers per customer (one phone only)
- Removing the `shipping_address` column from the database (keep for backwards safety)
- Phone verification / SMS OTP
