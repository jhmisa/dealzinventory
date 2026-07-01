-- Phase 3: de-dup the knowledge_base against the now-authoritative canned templates.
-- Only the 2 CONFLICTING knowledge articles are touched (templates win on conflict).
-- Guardrails + non-conflicting articles are left as-is. Decisions: Joey 2026-07-02
-- (docs/superpowers/plans/artifacts/2026-07-01-kb-reconciliation.md).

-- Shipping: KB wrongly said "no international shipping" + "2-3 days"; align to the
-- Info: Basic Greeting (domestic) + Info: Express Service / Tracking: LBC (PH) templates.
UPDATE public.knowledge_base
SET content = $$Domestic (Japan): ¥1,000 shipping fee (except islands), delivered in 1-3 days via Yamato Transport (ヤマト運輸). A tracking number is provided once the order is SHIPPED; customers can track at kuronekoyamato.co.jp.

International (Philippines): we DO ship to the Philippines — door-to-door express delivery via LBC Express. For far/remote areas, pickup is at the nearest LBC branch or warehouse. Rates are all-inclusive (the receiver pays nothing extra), max 2 gadgets per order, and the delivery count starts after payment is confirmed. See the "Info: Express Service" and "Tracking: LBC" canned replies for the exact wording customers receive.$$
WHERE title = 'Shipping Information';

-- Payment: keep Bank Transfer (振込) — still offered (Joey 2026-07-02) — but drop PayPay
-- (no longer offered). Align the rest to the payment templates.
UPDATE public.knowledge_base
SET content = $$Customer-facing payment options (see the payment canned replies for the exact wording): Cash on Delivery, Credit Card on Delivery (+4% surcharge), Konbini (Lawson / FamilyMart / Ministop), PayPal, SmartPit, and Bank Transfer (振込). Payment must be confirmed before we process or ship the order.$$
WHERE title = 'Payment Methods';
