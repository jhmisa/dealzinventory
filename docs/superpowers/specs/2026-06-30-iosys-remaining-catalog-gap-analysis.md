# iosys Remaining Catalog Gap Analysis (2026-06-30)

> Purpose: identify what product models from iosys.co.jp are still **missing** from `product_models` —
> both (a) new models within brands we already carry, and (b) entire brands iosys sells that we have
> zero rows for (including smaller/niche brands). Companion to
> [`CATALOG_HARVEST_RUNBOOK.md`](../../CATALOG_HARVEST_RUNBOOK.md) (HOW to harvest) and
> [`2026-06-28-iosys-full-catalog-sweep-GOAL.md`](2026-06-28-iosys-full-catalog-sweep-GOAL.md) (roadmap).
> Numbers are live as of 2026-06-30 (Supabase CLI) and iosys live pages.

---

## 1. What we have (product_models, status=ACTIVE)

**28 distinct brands, 1,932 ACTIVE rows.** The *real catalog* (intentionally harvested) is the
ANDROID + Apple buckets below. The `COMPUTER` rows split into two kinds: (i) genuine Apple computers
(in scope) and (ii) **legacy miscategorized junk** — old Android phone/tablet rows wrongly tagged
`device_category='COMPUTER'` with dirty names and no specs, plus genuine Windows PCs (out of scope).

### In-scope, intentionally harvested (clean pipeline)

| Brand (maker) | Category | ACTIVE rows | Pipeline / status |
|---|---|---|---|
| Apple | IPHONE | 442 | Apple part# ✅ |
| Apple | TABLET (iPad) | 226 | Apple part# ✅ |
| Apple | COMPUTER (Mac) | 242 | Apple part# ✅ (MacBook + desktop) |
| Apple | OTHER (Apple Watch) | 187 | Apple part# ✅ |
| Samsung | ANDROID (Galaxy) | 144 | Android ✅ |
| Sony | ANDROID (Xperia) | 106 | Android ✅ |
| Xiaomi | ANDROID | 91 | Android ✅ |
| Sharp | ANDROID (AQUOS) | 80 | Android ✅ |
| Google | ANDROID (Pixel) | 63 | Android ✅ |
| Oppo | ANDROID | 36 | Android ✅ |
| Motorola | ANDROID | 33 | Android ✅ |
| Huawei | ANDROID | 22 | Android ✅ |
| Fujitsu | ANDROID (arrows) | 18 | Android ✅ |
| ASUS | ANDROID (Zenfone/ROG) | 10 | Android ✅ |

Phase A (Android phones) = **10 brands complete**. Phase B Apple = iPhone/iPad/Mac/Watch complete;
**AirPods still pending.**

### Legacy / out-of-scope COMPUTER rows (noise, NOT real "computer brands")

Acer 3, Alldocube 3, Blackview 18, Dell 21, Higrace 2, HP 15, Iris Ohyama 1, Lenovo 12,
Microsoft 12, NEC 9, Nintendo 1, **Nothing Phone 1**, Philips 3, **Realme 3**, **UMIDIGI 1**,
Unknown 1, **ZTE 17**, plus per-brand COMPUTER tails on harvested brands (Samsung 36, Xiaomi 32,
Oppo 18, Fujitsu 10, Huawei 8, ASUS 3, Google 1, Motorola 1).

> Key insight: **the only entirely-missing brands with NO clean rows at all are the ones that exist
> only as legacy COMPUTER junk or not at all** — ZTE, Nothing/CMF, HTC, Realme, Blackview, UMIDIGI,
> etc. (see Bucket B/C). The per-harvested-brand COMPUTER tails are the deferred legacy-reconcile debt
> already tracked in the runbook, not new gaps.

---

## 2. Harvest staging (`iosys_catalog`)

Staging only contains the 11 brands we've already run; it is NOT a source of new-brand discovery.

| Brand | rows | with image |
|---|---|---|
| Apple | 1483 | 1375 |
| Samsung | 233 | 220 |
| Sony | 169 | 162 |
| Sharp | 118 | 104 |
| Google | 114 | 108 |
| Xiaomi | 99 | 85 |
| OPPO | 51 | 50 |
| Motorola | 37 | 33 |
| Huawei | 28 | 28 |
| Fujitsu | 27 | 22 |
| ASUS | 11 | 11 |

(Staging row counts > product_models because staging keeps every carrier SKU; fill-gaps collapses
carriers to the (brand,model,storage,color) identity.)

---

## 3. iosys's actual smartphone brand lineup (live 2026-06-30)

Two sources on iosys: the **maker (メーカー) filter** (the canonical lineup — includes makers
currently at 0 stock) and the **brand category nav slugs** (`/items/smartphone/<slug>`).

**Maker filter brands:** Apple, SONY, SHARP, SAMSUNG, FUJITSU, Huawei, **LG電子**, ASUS,
**KYOCERA**, **Amazon**, **Covia**, **Acer**, Microsoft, Lenovo.

**Category slugs:** iphone, pixel, galaxy, xperia, aquos, arrows, xiaomi, oppo, **zte** (+ nubia /
RED MAGIC / Libero / Blade), motorola, zenfone (+rog), **htc**, huawei, **blackberry**, **nothing**
(+ CMF), and **その他 (other)**.

**Live item counts pulled for the gap brands:**

| Brand (slug) | iosys items (件) | Notes |
|---|---|---|
| ZTE / nubia / RED MAGIC | **28** | nubia flagships, RED MAGIC gaming, Libero (Y!mobile), Blade |
| Nothing + CMF | **46** | Phone (1)(2)(2a)(3)(3a)(4a), CMF Phone 1 / 2 Pro |
| Kyocera | ~36 (filter) | TORQUE, DIGNO, BASIO, Android One, Qua — **but mostly feature phones / kantai / tablets**; only a handful are true smartphones (TORQUE G06, Android One S9, DIGNO SX4) |
| HTC | **8** | Desire 22 pro, U11, U12+, HTC 10, J butterfly |
| LG電子 | 0 in stock now | Listed as a maker; LG exited phones — stock is intermittent (it7/style/VELVET historically) |
| TCL | 0 in stock now | Slug exists but empty today |
| BlackBerry | 0 in stock now | Listed as a series filter; empty today |
| Amazon | n/a (Fire = tablets) | Fire tablets, not phones |
| Covia | very small | tiny SIM-free importer; intermittent |

---

## 4. Gap synthesis

### Bucket A — New models within EXISTING brands (re-harvest sweeps)

All 10 Android brands + the 4 Apple shapes are idempotent re-harvest targets. New JP models that have
likely shipped since each brand's harvest and are worth a re-harvest pass (priority order):

- **Apple iPhone / iPad** — always the highest kaitori value; sweep for the newest gen + any new colors.
- **Galaxy** (Samsung) — S25/Z-fold-flip refresh cycle, plus the **deferred legacy-Samsung reconcile**
  (42 COMPUTER rows, 37 referenced by 117 items) is still open.
- **Pixel** — fastest-moving `a`-line cadence (Pixel 10a already caught late once).
- **AQUOS / Xperia** — Sharp & Sony refresh annually (R-series, sense, Xperia 1/5/10).
- **Xiaomi / OPPO** — large lineups + **deferred legacy reconciles** (~33 / ~25 COMPUTER rows).
- **arrows / Huawei / ASUS / Motorola** — smaller; quick top-up sweeps + small legacy reconciles open.

> We can't count exact new-SKU deltas without re-running each harvest (idempotent), so treat Bucket A
> as "re-run the harvest + fill-gaps; new rows insert, existing untouched."

### Bucket B — Entirely MISSING brands (zero clean rows)

Brands iosys actively sells in-scope that have **no clean product_models rows** (only legacy junk or
nothing). Mainstream-ness noted:

| Brand | iosys items | Mainstream? | Notes |
|---|---|---|---|
| **ZTE / nubia / RED MAGIC** | 28 | **Moderately mainstream in JP** | Libero series is a real Y!mobile carrier line (mass-market); nubia/RED MAGIC are enthusiast flagships. Only legacy junk today (17 COMPUTER rows). Strongest Bucket-B candidate. |
| **Nothing (+ CMF)** | 46 | **Rising mainstream** | Largest gap by item count; Phone (3)/(3a)/(4a) + CMF budget line; sold SIM-free + Rakuten. Only 1 legacy COMPUTER row. Strong candidate. |
| **HTC** | 8 | Niche/legacy | Small, mostly old (U11/U12+/10) + Desire 22 pro. Low kaitori value. |
| **Kyocera** | ~36 filter, few true smartphones | Mainstream-rugged niche | TORQUE (rugged) + Android One are real smartphones; rest are feature phones/kantai/tablets (OUT). Worth ~a dozen smartphone SKUs only. |
| **LG電子** | 0 now | Was mainstream, exited | Intermittent stock; harvest only if/when in stock. |
| **TCL** | 0 now | Niche | Slug empty today. |
| **BlackBerry** | 0 now | Legacy collector | Empty today. |
| **Covia** | tiny | Niche importer | Skip unless requested. |

### Bucket C — Smaller / cheap-import brands (facts only; include/exclude is Joey's call)

The standing project decision ([[project_kaitori_catalog_completeness]]) was "iosys brands IN, cheap
imports like Blackview/Realme OUT." Joey is reconsidering — facts, no decision made here:

**Smaller brands iosys ACTUALLY carries (in their nav/filter or in stock):**
- **ZTE / nubia / RED MAGIC** — 28 items (see Bucket B; this one is more mainstream than "cheap import").
- **Nothing / CMF** — 46 items (mainstream-trending, not a cheap import; see Bucket B).
- **HTC** — 8 items.
- **Kyocera** — rugged/Android One smartphones (~a dozen true smartphones).
- **Covia** — tiny SIM-free importer, intermittent.

**Cheap-import brands that appear ONLY as legacy junk in OUR DB, NOT in iosys's current smartphone
nav/lineup** (i.e. iosys does **not** actively sell them as a maker category):
- **Blackview** (18 legacy rows), **Realme** (3), **UMIDIGI** (1), **Alldocube** (3, a tablet brand),
  **Higrace** (2) — these are the exact "cheap imports OUT" brands; iosys has no smartphone maker
  category for them. They're stale rows from an old import, not iosys-driven gaps.

> So the smaller-brand question really reduces to: **ZTE, Nothing/CMF, HTC, Kyocera** (iosys-carried,
> currently missing) vs the **Blackview/Realme/UMIDIGI** legacy junk (NOT iosys-carried). The cheap
> imports the original rule excluded are genuinely not in iosys's lineup; the borderline new candidates
> (ZTE, Nothing) are arguably mainstream enough to reconsider.

---

## 5. Non-phone categories still pending (roadmap)

- **Phase B — AirPods** — the last Apple shape; not yet built. `items/audio/airpods`, part#-keyed,
  simple name+part#+year, likely `device_category='OTHER'`.
- **Phase C — Android tablets** — Galaxy Tab + other Android tablets (`items/tablet/android/...`,
  `items/tablet/other/pad3`); iosys tablet makers also include Xiaomi Pad, OPPO, NEC LaVie Tab,
  Lenovo, Huawei MediaPad, Pixel Tablet. Needs the Android key parameterized (storage middle dim — same
  as phones, so lowest-friction Phase-C item).
- **Phase C — Wearables:** Galaxy Watch (`items/wearable/galaxy`) + Pixel Watch (`items/wearable/pixel`)
  — needs key middle-dim = case size (mm).
- **Phase C — Audio (buds):** Galaxy Buds + Pixel Buds (`items/audio/earphone_headphone` filtered) —
  needs key = (brand,model,color), no middle dim.
- **Phase D — Kaitori pricing wiring** — populate the EMPTY `kaitori_price_list` against the finished
  SKUs (the end goal).

> LOCKED scope: Windows PCs OUT; non-Apple/Samsung/Google watches & audio OUT; feature phones (ガラケー),
> routers, accessories OUT.

---

## 6. Recommended harvest order

1. **Re-harvest sweeps of existing high-value brands first** (Bucket A): iPhone → iPad → Galaxy →
   Pixel → AQUOS → Xperia → Xiaomi → OPPO. Cheap (idempotent) and captures the newest JP models that
   matter most for kaitori. Fold in the deferred Samsung/Xiaomi/OPPO legacy reconciles while there.
2. **AirPods** (finish Phase B Apple) — small, well-understood part# pipeline, closes the Apple set.
3. **New Bucket-B brands by kaitori value**: **ZTE/nubia/Libero** (28, has a real carrier line) →
   **Nothing/CMF** (46, biggest gap, trending) → **Kyocera** (rugged TORQUE + Android One only) →
   **HTC** (8, low value). Each is a standard new-brand recipe (config + specs + colors + fill-gaps).
   Get Joey's include/exclude decision on ZTE/Nothing/Kyocera/HTC before building.
4. **Phase C non-phones**: Android tablets (lowest friction) → Galaxy/Pixel Watch → Galaxy/Pixel Buds.
5. **Skip until in stock / explicitly requested**: LG, TCL, BlackBerry, Covia (0 stock now), and the
   Blackview/Realme/UMIDIGI cheap imports (not in iosys's lineup — clean up the legacy junk instead).
6. **Phase D** — wire `kaitori_price_list` once the catalog is complete.
