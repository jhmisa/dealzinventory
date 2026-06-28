# System Map — Dealz

> Where features live in the code. Slow-changing. Loaded on demand (linked from PROJECT_STATE.md).
> Deep reference: docs/PRD.md · docs/DATABASE_SCHEMA.md · docs/PAGE_COMPONENT_MAP.md

## Messaging / AI
- Services: messaging.ts, ai-prompts.ts, ai-configurations.ts, offers.ts, mine.ts, tickets.ts, message-folders.ts
- Edge fns: missive-webhook, process-message-queue, generate-pending-drafts, send-message, test-ai-reply, repair-truncated-messages, discover-missing-conversations, backfill-missive-inbound, backfill-contact-names, backfill-platform-ids, backfill-attachment-storage
- Tables: conversations, messages, automated_message_queue, message_folders, messaging_templates, messaging_persona, messaging_specialists, messaging_sub_intents, ai_providers, ai_prompts, ai_usage_log, knowledge_base, tickets, ticket_types, ticket_media, ticket_notes, system_alerts, webhook_events, webhook_delivery_log, conversation_customer_audit
- Pipeline: inbound (missive-webhook) → queue (process-message-queue) → classifyMessage → matchSubIntent → resolveAutonomy (OFF/DRAFT/SEND) → generate-pending-drafts → send-message (sendViaMissive shared module)

## Shop (public storefront)
- Services: shop.ts, showcase.ts, sell-groups.ts, product-models.ts, categories.ts, accessories.ts
- Edge fns: place-shop-order
- Tables: sell_groups, sell_group_items, photo_groups, photo_group_media, product_models, config_groups, categories, accessories, accessory_media, accessory_stock_entries, accessory_stock_adjustments

## Orders
- Services: orders.ts, payment-confirmations.ts
- Edge fns: place-shop-order, yamato-tracking
- Tables: orders, order_items, order_audit_logs, payment_confirmations

## Kaitori (buy-from-individuals)
- Services: kaitori.ts
- Edge fns: (kaitori quote logic — see kaitori.ts / price list)
- Tables: kaitori_requests, kaitori_request_media, kaitori_price_list

## Catalog harvest (iosys → product_models)
- Runbook: **docs/CATALOG_HARVEST_RUNBOOK.md** (how to re-harvest existing brands / add new ones; per-brand formula registry)
- Code: supabase/functions/_shared/catalog/ — android-listing.ts (generic engine + per-brand configs), iosys-listing.ts + ipad-listing.ts (Apple part#), harvest.ts, run-harvest-local.ts, <brand>-specs.ts, apple-colors.ts
- Edge fn: harvest-iosys-catalog (deployed re-harvest path) · Data-ops: supabase/data-ops/<date>-<brand>-fill-gaps.sql
- Tables: iosys_catalog (staging, dedupe on sku_key), product_models (promoted target)
- Theory: docs/investigations/android-identifier-conventions.md · Goal: docs/superpowers/specs/2026-06-28-iosys-full-catalog-sweep-GOAL.md

## Items / Inventory
- Services: items.ts, item-audit-logs.ts, item-defects.ts, intake-receipts.ts, inventory-removals.ts, inventory-snapshots.ts, inventory-report-pdf.ts, suppliers.ts
- Edge fns: parse-invoice
- Tables: items, item_audit_logs, item_defects, intake_receipts, suppliers, inventory_snapshots, inventory_snapshot_items, inventory_removals, canonical_brands

## Backorder / Pre-order (supplier inventory, B-codes)
- Services: backorders.ts (list/get/create/update lines, fetchSupplierProduct, searchProductImages, saveBackorderPhotos, listToFulfill, markBackorderOrdered, fulfillBackorderWithItem, reserveBackorderUnit, findEligiblePCodes); items.ts getItemForSwap
- Edge fns: fetch-supplier-product (pluggable supplier adapters → NormalizedSupplierProduct), search-product-images (optional, env-keyed), save-backorder-photos (copy kept photos → storage)
- Shared modules: _shared/supplier-adapters/{types,iosys,registry}.ts (+iosys fixture), _shared/image-search/{types,provider}.ts, _shared/backorder-match.ts (verifyPCodeMatch), _shared/inventory-search.ts (mapBackorderRow — backorder result type), _shared/offer-reply.ts (⏳ Pre-order badge)
- RPCs: search_available_backorder_lines, reserve_backorder_unit, mark_backorder_ordered, fulfill_backorder_with_item (core-spec hard-block + item→RESERVED + quantity_received++), generate_code('B','b_code_seq'), _backorder_norm_storage_gb
- Tables: backorder_lines (B-code, generated `available`), backorder_line_media; order_items.backorder_line_id + backorder_status (enum backorder_fulfillment_status); storage bucket backorder-media
- Frontend: src/pages/admin/backorders.tsx (Lines / To-Fulfill tabs), src/components/backorders/{backorder-list,add-backorder-dialog,to-fulfill,swap-dialog}.tsx, src/validators/backorder.ts, src/lib/utils.ts (normalizeStorageGb, verifyPCodeMatch)
- Flow: paste iosys URL → fetch-supplier-product prefill → map product_model + supplier → curate photos → createBackorderLine (B-code) + saveBackorderPhotos. Surfaces in inventory search as pre-order offers (⏳ + lead time). Customer confirm → reserve_backorder_unit (order_item, item_id null). Procure via To-Fulfill worklist → mark_backorder_ordered → on intake, swap dialog scans matching P-code → fulfill_backorder_with_item.

## Returns
- Services: returns.ts, supplier-returns.ts
- Edge fns: create-return-request
- Tables: return_requests, return_request_items (customer returns); supplier_returns (supplier returns)

## Customers / Auth
- Services: customers.ts, customer-addresses.ts, customer-reviews.ts, staff-profiles.ts
- Edge fns: customer-auth, invite-staff, set-staff-password, claim-mine, claim-offer
- Tables: customers, customer_addresses, customer_reviews, customer_pin_resets, customer_merge_logs, staff_profiles

## Live selling
- Services: live-sessions.ts
- Tables: live_sessions, live_session_sales

## Social media
- Services: social-media-posts.ts
- Edge fns: sync-social-status
- Tables: social_media_posts

## Media / Images
- Edge fns: enhance-image
- Notes: two-size pipeline (1080 display / 256 thumb), see CLAUDE.md "Image Processing Standards"

## Reporting / Dashboard / Settings
- Services: dashboard.ts, settings.ts, system-feedback.ts, postal-codes.ts
- Tables: system_settings, system_feedback, system_feedback_media, postal_codes
- Shared: supabase/functions/_shared

## Codegen
- P/PG/G/KT/ORD/C codes are auto-generated server-side via `generate_code(prefix, seq_name)` — a PostgreSQL function using `nextval()` + `lpad` defined in the initial schema migration (20260210000001_initial_schema.sql). No standalone "generate-codes" edge function exists despite the PRD reference.
