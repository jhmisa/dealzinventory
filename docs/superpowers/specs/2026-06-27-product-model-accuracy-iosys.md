# Product Model Accuracy via iosys (SKU-level catalog) — Design Spec

> Status: DRAFT for review (2026-06-27). Goal: a product_model catalog that is **accurate and absolute** based on iosys data, so kaitori (buy-from-individual) and inventory matching are exact. Author handoff: written before a context clear — a fresh session should read this end-to-end before executing.

## 1. Goal
Make `product_models` an accurate, searchable catalog where every iPhone/iPad/Android variant we deal in is represented at the precision needed for **absolute matching** — especially for **kaitori**, where buy-price must depend on the exact SKU (model + storage + color + carrier/lock). Use **iosys** listings as the source of truth (they always carry the Apple part number + carrier).

## 2. Identifier theory (the crux — get this right)
Two different numbers with very different granularity:
- **Model Number (A-number, e.g. `A2402` / `A3289`)** = regional *hardware* variant. **Same across every color and every storage** of a model. NOT storage- or color-specific. Coarse.
- **Part Number (Apple retail SKU, e.g. `MXVH3J/A`, `MGHY3J/A`)** = **uniquely pins model + storage + color + region** (the `J/A` suffix = Japan). One part number = exactly one storage + one color. **This is the absolute key.**
- **Carrier / lock**: In Japan, units are sold as **SIM-Free** (Apple) or under **docomo / au / SoftBank / Rakuten**. iosys segments these in the URL path (`/items/smartphone/iphone/{simfree|docomo|au|softbank}/...`). Carrier (network sold under) and `is_unlocked` (lock state) are **two different attributes** — a docomo unit can be carrier-unlocked. Both matter for value/matching. Post‑2021 JP iPhones are SIM-free by law; older ones may be carrier-locked.

**Implication:** storage is "absolute" for the **part number**, NOT the model number. The part number (+ iosys carrier path) gives us model+storage+color+carrier deterministically.

## 3. Key finding — kaitori requires SKU granularity
`kaitori_price_list` keys pricing on **`product_model_id` + battery/body/screen condition only** (no storage/carrier columns). Therefore, for kaitori buy-price to be absolute, the **`product_model` itself must encode storage + color + carrier**. Today it does not (rows are per model+color, `storage_gb` blank, `carrier` an unverified default), so a 128GB docomo unit and a 256GB SIM-Free unit collapse to one price — the integrity gap the owner flagged. **Conclusion: product_models must become SKU-precise (one row per part number).**

## 4b. CORRECTED current-state (re-verified live 2026-06-27, Phase 0)
The §4 read below was partly wrong. Verified against the live DB via `supabase db query --linked`:
- **400 product_models total**, across many brands (Apple 115, Samsung 42, Xiaomi 35, Oppo 25, Dell 22, … PCs included) — NOT an iPhone-only table. iosys scope = phones/tablets; PCs are out of iosys range.
- Apple 115 = ~18 distinct **iPhone** models / ~45 rows, plus iPads (~25), MacBooks/iMac (~22), Watches (~17), AirPods (~5).
- **`device_category` is NOT NULL and uniformly = `COMPUTER` for all 400 rows** (enum values: IPHONE/ANDROID/COMPUTER/TABLET/OTHER). So it is *uniformly wrong*, not "unset". Real cleanup must set IPHONE/TABLET/ANDROID per row.
- `storage_gb` & `ram_gb` are **`text`** columns (staging `iosys_catalog.storage_gb` is `integer`; convert int→text when writing product_models).
- **carrier dirt**: NULL 216, `Sim-Free` 179, `Sim-free` 1, `Softbank` 1, `None` 2, `Wifi` 1 → normalize to vocab.
- `part_number` set on only 44/400; `storage_gb` blank on 253/400.
- **iPhone model_name dirt**: `iPhone 11` vs `IPhone 11`; `iPhone 12` vs `iPhone 12 ` (trailing space); `iPhone 12 Mini` (Apple = lowercase `mini`); `iPhone SE 2` (canonical = `iPhone SE (2nd generation)`); color dirt `Red/RED/(PRODUCT)RED`, `Midnight Black` (not a real iPhone 14 color). → Phase 2 must canonicalize names BEFORE SKU split (`normalizeIphoneModelName()` in `_shared/catalog/iphone-specs.ts`).
- **iosys title grammar** (from fixture): `iPhone15 Plus A3093 (MU093VC/A) 128GB ピンク 【カナダ版SIMフリー】` = `{model no-space} {A-number} ({part-number}) {storage} {colorJA} 【region+lock】`. NOTE: part-number region suffix VARIES (`VC/A`=Canada import, not always `J/A`=Japan); iosys sells foreign-version SIM-free imports. Store part_number verbatim; surface region so domestic vs import isn't collapsed.

**Phase 0 SHIPPED (migration `20260627130000_product_model_accuracy_phase0.sql`):** added `product_models.color_ja`, `product_models.source_url`; `jp_carrier` enum {SIM-Free,docomo,au,SoftBank,Rakuten}; staging table `iosys_catalog`. Reference modules: `_shared/catalog/apple-colors.ts` (JA→EN), `_shared/catalog/iphone-specs.ts` (model→spec + normalizer). Tests green (`deno test _shared/catalog/`).

## 4. Current-state findings (verified 2026-06-27)  [SUPERSEDED — see §4b]
- `product_models` already has: `brand, model_name, color, carrier, is_unlocked, storage_gb (text), ram_gb (text), cpu, chipset, gpu, screen_size, os_family, year, model_number, part_number, device_category (enum), imei_slot_count, category_id, status, match_pattern, match_priority, verified_at, verified_by, short_description, other_features`.
- `config_groups` is **gone** (specs flattened onto product_models). Single-table model.
- `device_category` enum is **unset** in live data; categorization is via `category_id` (distinct iPhone / iPad / MacBook category rows). Cleanup should also populate `device_category`.
- Data hygiene issues exist: e.g. `"iPhone 12 "` (trailing space) vs `"iPhone 12"`; `model_number`/`part_number`/`storage_gb`/`cpu` mostly NULL/blank; `carrier` defaulted to `"Sim-Free"` (unverified).
- No enforced uniqueness on product_models → duplicate/dirty rows possible.
- iosys exposes iPhones by carrier path with counts (simfree 31 / docomo 9 / au 7 / softbank 9 model groups), each listing title has `model A-number (part-number) storageGB colorJA`.

## 5. Proposed data model
**Granularity: extend `product_models` to SKU rows** = one row per **(model_name + color + storage_gb + carrier)** ≈ one **part_number**. (Rationale: existing table is already SKU-ish and config_groups is gone; a separate variant table is cleaner normalization but a much bigger refactor of items/orders/sell_groups/kaitori FKs. Recommend in-place unless review prefers a `product_skus` table — see Decision B.)

**New / changed fields:**
- `color_ja text` — **NEW**. Japanese color (`ホワイト`) stored alongside English `color` (`White`). Needed for kaitori offers to the JP market. (Keep `color` = canonical English.)
- `carrier` — normalize to a controlled vocabulary: `SIM-Free | docomo | au | SoftBank | Rakuten` (map iosys path). Keep `is_unlocked` separate (lock state).
- `part_number` — becomes the **natural unique key** (unique where not null). Drives dedupe + absolute match.
- Reuse `verified_at` / `verified_by` for provenance (set when an iosys SKU confirms a row). Optionally add `source_url text` (the iosys listing) — NEW, optional.
- Populate `device_category` properly (IPHONE/TABLET/ANDROID) during cleanup.
- Deterministic per-model specs (chipset, screen_size, year, ram_gb, os_family) filled from a **built-in model→spec reference** (iosys doesn't reliably give chipset/screen/year), seeded for all iPhones/iPads/common Android.

**Uniqueness:** add `UNIQUE (part_number)` (partial, where part_number not null) and/or `UNIQUE (brand, model_name, color, storage_gb, carrier)` once data is clean.

## 6. iosys as source of truth — harvest approach
- Enumerate by carrier path: `/items/smartphone/iphone/{simfree,docomo,au,softbank,rakuten}` (and iPad / Android equivalents — confirm their paths), paginate each, collect product URLs.
- For each listing, reuse the existing `iosys` adapter (`_shared/supplier-adapters/iosys.ts`) — it already parses brand/model/part-number(A+SKU)/storage/color(JA). Extend it to also surface the **carrier** (from the URL path) and split `modelText` into clean `model_name` + `model_number(A)` + `part_number(SKU)`.
- **Dedupe by part_number** → the SKU set (iosys lists many used units per SKU at different grades; we only want each SKU's identity once for the catalog).
- Land results FIRST in a **read-only staging table `iosys_catalog`** (part_number, model_name, model_number, storage_gb, color_ja, color_en, carrier, source_url, raw_title, specs). Never mutate `product_models` directly from the crawl — reconcile in a reviewed step.

## 7. Bilingual color
Maintain a canonical **JP↔EN Apple color map** (per generation where names differ, e.g. ホワイト=White, ミッドナイト=Midnight, スターライト=Starlight, ナチュラルチタニウム=Natural Titanium, …). Store both `color` (EN) and `color_ja` (JA). iosys gives JA → derive EN via the map; flag unknowns for human confirmation.

## 8. Phased plan (reviewable, incremental — owner wants "one by one")
- **Phase 0 — Schema & references.** Migration: add `color_ja` (+ optional `source_url`); create staging table `iosys_catalog`; build the model→spec reference + JP↔EN color map (seed iPhone first). No data mutation yet.
- **Phase 1 — Harvest iosys catalog (read-only).** Crawl iphone-by-carrier → parse → dedupe by part_number → fill `iosys_catalog`. Output: the gold SKU reference. Log coverage (per carrier counts).
- **Phase 2 — Reconcile existing rows (human-in-the-loop, one by one).** For each existing iPhone product_model, find candidate iosys SKUs (by model_name+color [+storage if set]). Because existing rows are storage-blank (span 64/128/256/512), **split** each into per-storage SKU rows, enriching model_number/part_number/color_ja/carrier/cpu/chipset/year/screen. Present proposed change for approval; apply on confirm. Re-point dependent `items` to the correct SKU using each item's own `storage_gb` (carrier unknown for existing units → mark `verified=false`, queue for physical verification; do NOT guess carrier).
- **Phase 3 — Fill gaps (make searchable).** Create the iosys SKUs we don't yet have as ACTIVE product_models so they're searchable in inventory/backorder/kaitori.
- **Phase 4 — iPad + Android.** Repeat 1–3 for iosys iPad and Android sections (confirm their URL/carrier structure; Android brands vary).
- **Phase 5 — Lock integrity.** Once clean: add `UNIQUE(part_number)` (+ composite), populate `device_category`, and wire kaitori_price_list to the now-absolute SKU rows.

## 9. Open decisions (confirm before building)
- **A. Granularity = SKU-level (model+color+storage+carrier, part_number-keyed)?** Recommend YES (required for absolute kaitori). 
- **B. In-place vs new table.** Extend `product_models` in place (simpler; needs item re-pointing) vs new `product_skus` table over a slim `product_models` (cleaner; bigger refactor). Recommend in-place unless review says otherwise.
- **C. Carrier vocabulary** = {SIM-Free, docomo, au, SoftBank, Rakuten} + keep `is_unlocked` separate. Confirm.
- **D. Existing-unit carrier** is unknown → verify physically / mark unverified rather than guess. Confirm acceptable.
- **E. JANPARA** — owner mentioned janpara as another source. iosys is built; a `janpara` adapter could be added to the registry as a second/cross-check source. In scope now or later?

## 10. Risks
- **Referential churn**: splitting model+color → per-storage SKUs re-points `items`, and affects `order_items`, `sell_group_items`, `kaitori_price_list`, `kaitori_requests`. Must be staged + reviewed; carrier ambiguity for existing units is the hardest part.
- **Row count growth**: hundreds → low-thousands of SKU rows (acceptable in Postgres; ensure list queries paginate — see [list-query 1000-row cap] tech debt).
- **iosys coverage**: rare/old SKUs may not be on iosys now; backfill from janpara/manual.
- **Crawl politeness**: throttle the harvest (don't hammer iosys); cache pages.

## 11. PoC illustration (real)
Existing row → target after reconcile:
```
BEFORE: { model_name:"iPhone 12", color:"Red", storage_gb:"", carrier:"Sim-Free"(assumed),
          model_number:null, part_number:null, cpu:null, year:null }
AFTER (split into per-storage SKUs, enriched from iosys):
  iPhone 12 · Red(レッド) · 64GB  · SIM-Free · A2402 · MGHQ3J/A · A14 Bionic · 6.1" · 2020
  iPhone 12 · Red(レッド) · 128GB · SIM-Free · A2402 · MGHV3J/A · A14 Bionic · 6.1" · 2020
  iPhone 12 · Red(レッド) · 256GB · SIM-Free · A2402 · MGHW3J/A · A14 Bionic · 6.1" · 2020
  (part numbers illustrative — taken from iosys at harvest; carrier confirmed by iosys path)
```
(Existing `items` pointing at the old row get re-pointed to the SKU matching their own storage; carrier flagged for verification.)
