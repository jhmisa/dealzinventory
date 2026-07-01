# Knowledge Base Reconciliation — Review (Phase 3)

**Status:** DECISIONS RECORDED 2026-07-02 — applying. Templates win on conflict.

**Joey's decisions (2026-07-02):**
- **Payment:** bank transfer/PayPay not confirmed as live and appear in no template → KB lists ONLY template-sourced methods (COD, Credit Card +4%, Konbini, PayPal, SmartPit) and defers to the payment canned replies. If bank transfer is still offered, add a template and the AI picks it up automatically.
- **PH shipping:** incorporated from the templates — PH express = `Info: Express Service` via **LBC Express** (`Tracking: LBC`), door-to-door, remote-area pickup at nearest LBC branch/warehouse, all-inclusive, max 2 gadgets, count starts after payment.
- **Follow-up captured:** volatile company facts (bank/SmartPit numbers, addresses, phones, rates) should get a dedicated structured "Company Info" area — a separate future enhancement, NOT built in this phase.

**Guardrails:** never touched (all 4 kept as-is).
**Non-conflicting knowledge kept as-is:** Condition Grades, Handling Product Inquiries, Kaitori Process, Return Policy, Tagalog/Filipino Text-Speak Guide.

Only **2 knowledge articles conflict** with the now-authoritative templates:

---

## 1. "Shipping Information" (KB, tag: order_tracking) — CONFLICTS

**Current KB content:**
> We ship via Yamato Transport (ヤマト運輸) within Japan.
> - Standard shipping: 2-3 business days
> - Tracking numbers are provided once the order is SHIPPED
> - Customers can track packages at kuronekoyamato.co.jp
> - **We do not currently offer international shipping**

**Conflicts with templates:**
- `Info: Express Service` → door-to-door **Philippines** shipping exists (KB says international does NOT exist ❌).
- `Info: Basic Greeting` → **1-3 days**, **¥1,000** shipping fee (KB says 2-3 days, no fee).

**Proposed reconciliation (UPDATE — align to templates, keep the Yamato-tracking fact templates don't state):**
> Domestic (Japan): ¥1,000 shipping fee (except islands), delivered in 1-3 days via Yamato Transport (ヤマト運輸). Tracking is provided once SHIPPED; customers can track at kuronekoyamato.co.jp.
> International (Philippines): we DO offer door-to-door express shipping to the Philippines — see the Express Service reply for details (max 2 gadgets per order, all-inclusive rates, delivery count starts after payment is confirmed).

**❓ Confirm:** is the ¥1,000 / 1-3 day domestic rate current, and is Yamato still the domestic courier?

---

## 2. "Payment Methods" (KB, tag: order_tracking) — CONFLICTS

**Current KB content:**
> We accept:
> - Bank transfer (振込) — most common
> - Cash on delivery (代引き) via Yamato
> - PayPay for in-person transactions
> - Payment must be confirmed before shipping

**Conflicts with templates:**
- `Info: Basic Greeting` → Cash on Delivery / Credit Card on Delivery (+4%) / Konbini (Lawson·FamilyMart·Ministop).
- `Acctg: PayPal Payment` → PayPal. `Acctg: SmartPit Payment` → SmartPit.
- KB lists bank transfer + PayPay, which appear in NO template.

**Proposed reconciliation (UPDATE — list what the templates actually offer; keep "confirm before shipping"):**
> Customer-facing payment options: Cash on Delivery, Credit Card on Delivery (+4%), Konbini (Lawson / FamilyMart / Ministop), PayPal, and SmartPit. Payment must be confirmed before we process/ship the order.

**❓ Confirm (I must not invent business facts):**
- Do you still accept **bank transfer (振込)** and **PayPay**? If yes, keep them; if no, drop them (as proposed).
- Is Credit-Card-on-Delivery's **+4%** surcharge still correct?

---

## Migration

Once approved, `supabase/migrations/20260701140000_reconcile_knowledge_base.sql` will `UPDATE public.knowledge_base SET content = $$…$$ WHERE title = 'Shipping Information';` (and Payment Methods). No rows deleted; only these two contents change. Then re-run the Test-AI playground shipping/payment scenarios to confirm the AI now answers consistently from the templates.
