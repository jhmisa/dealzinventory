-- Convert facts trapped in template image attachments into AI-readable knowledge_base
-- articles. Templates + their images are untouched (they still auto-send the visuals);
-- these articles give the AI the TEXT so it can answer questions conversationally.
-- Facts sourced from the 6 template attachments (Joey verified 2026-07-02).
-- Idempotent: knowledge_base has no unique(title), so delete-by-title then insert.

DELETE FROM public.knowledge_base
WHERE title IN (
  'Philippines Express Shipping Rates',
  'How to Pay via PayPal',
  'How to Pay via SmartPit',
  'Order Redelivery (Yamato)',
  'Warranty & After-Sales Coverage',
  'Special Order Request'
);

INSERT INTO public.knowledge_base (entry_type, title, content, category, specialist_tags, is_active, sort_order) VALUES
('knowledge', 'Philippines Express Shipping Rates',
$$Philippines Express Shipping (Japan -> PH). All-inclusive — receiver pays nothing extra. Max 2 gadgets per order. Door-to-door; far/remote areas pick up at nearest LBC branch/warehouse.
Rates:
- Mobile phone, 1-2 units, NO box: ¥1,900
- Mobile phone, 1-2 units, WITH box: ¥2,800
- 1 phone + 1 tablet: ¥4,800
- Tablet, 1 or 2 units: ¥4,800
- Laptop 10-16", 1 unit: ¥4,800
- 2 laptops, or 1 gaming laptop: ¥7,800
- 1 laptop + 1 phone/tablet: ¥4,800
Lead time (after payment confirmed): Metro Manila & Luzon 3 weeks; Visayas & Mindanao 4 weeks.
Payment recommendation for PH-bound orders (depends on where the payer is):
- Paying FROM Japan -> recommend SmartPit. Pays: item price + international shipping fee.
- Paying FROM the Philippines -> recommend PayPal (Debit/Credit). Pays: item price + shipping + PayPal fee (5% if ¥10,000 or more, 10% if below ¥10,000).$$,
'Shipping', ARRAY['sales','order_tracking'], true, 10),

('knowledge', 'How to Pay via PayPal',
$$PayPal payment steps (for PH-side payers): 1) Open the PayPal link we send. 2) Verify the company name shown is "Yehey Japan Kabushiki Kaisha (株式会社イーエーヘイ・ジャパン)". 3) Enter the payment amount in Japanese Yen exactly as on the invoice we sent — triple-check to avoid errors/extra charges. 4) Enter the Order Number (format YJ-XXXXXX). 5) If you have a PayPal account, tap "PayPal"; if not, tap "Debit or Credit Card" and enter card number, expiry, CVV. 6) Choose to be charged in PHP or JPY (JPY uses your bank's conversion rate). 7) Enter name, address, mobile number, email. 8) Agree to the PayPal agreement & Privacy Statement, then tap Pay. 9) Screenshot the confirmation screen and keep it until the transaction is completed.$$,
'Payments', ARRAY['order_tracking'], true, 11),

('knowledge', 'How to Pay via SmartPit',
$$SmartPit payment (at a Japanese konbini). Go to the nearest Lawson/Ministop (Loppi machine) or FamilyMart (multi-copy machine).
Lawson/Ministop (Loppi): 1) Tap "Various ID Numbers". 2) Enter the SmartPit Number, tap Next. 3) Select "SmartPit Payment". 4) Select the amount to be paid, tap Next. 5) Review details, tap Confirm. 6) Bring the printed payment slip to the cashier.
FamilyMart (multi-copy): 1) Tap "FaMiMa/Edy/WAON/SmartPit". 2) Select "SmartPit". 3) Enter the SmartPit Number, tap OK. 4) Select the amount, tap OK. 5) Review, tap OK. 6) Bring the payment slip to the cashier.
A receipt prints after paying at the cashier. Send a photo of the receipt to customer support for processing.$$,
'Payments', ARRAY['order_tracking'], true, 12),

('knowledge', 'Order Redelivery (Yamato)',
$$Requesting redelivery of a missed Yamato delivery: 1) Find the attempted-delivery notice (ご不在連絡票) in your mailbox; redelivery info is on the back. 2) Note the delivery attempt date and your tracking number. 3) If you speak Japanese, call the driver directly using the number on the notice, give your tracking number, and coordinate redelivery. If you prefer English, call Yamato's automated phone service, provide your tracking number, and follow the voice prompts. 4) Wait for redelivery on your requested schedule.$$,
'Shipping', ARRAY['order_tracking','aftersales'], true, 13),

('knowledge', 'Warranty & After-Sales Coverage',
$$Warranty by condition: New (Rank S) = 3 months (7-day replacement + 2 months 3 weeks service warranty). Refurbished (Rank A/B/C/D) = 1 month (7-day replacement + 3 weeks service warranty). Accessories = 7-day replacement.
Replacement warranty covers factory defects (battery, screen, buttons, camera, speakers, ports). Service warranty covers device mishandling and factory defects unreported within 7 days. Warranty claims require the unit and all inclusions returned in good condition as received.$$,
'Products', ARRAY['sales','aftersales'], true, 14),

('knowledge', 'Special Order Request',
$$Special / out-of-stock order process: 1) Make a non-refundable downpayment (paid via SmartPit) so we order the requested unit. 2) Wait 5-7 days for it to arrive at our Tokyo warehouse. 3) Finalize details; delivery in 1-3 days after arrival.
Balance = Unit Price - downpayment + ¥1,000 standard shipping fee (except far areas). Final balance payable by COD, Credit Card (+4%), or SmartPit.$$,
'Shipping', ARRAY['sales'], true, 15);

-- Steer customer-facing wording of rank S without creating a duplicate ranking article.
UPDATE public.knowledge_base
SET content = $$Our grading system:
- S: New — pristine, factory condition. Always describe rank S to customers as "New" (not "S"); do not volunteer "open box" — the item description already indicates open-box when it applies.
- A: Very good — minimal signs of use
- B: Good — light scratches or wear
- C: Fair — visible wear but fully functional
- D: As-is — major cosmetic issues, may have functional issues
- J: Junk/parts only — NOT sold to customers$$
WHERE title = 'Condition Grades';
