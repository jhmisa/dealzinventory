# Android Phone Identifier Conventions (Japanese Market)

**Investigation date:** 2026-06-28
**Scope:** Brands sold by iosys.co.jp — Samsung Galaxy, Sony Xperia, Sharp AQUOS, Google Pixel, Xiaomi, OPPO, ZTE/nubia, Fujitsu arrows, Asus Zenfone, Huawei, Motorola.

---

## The Core Question

Apple's **part number** (e.g. `MXVH3J/A`) deterministically encodes **model + storage + color + region** in one short code. On intake you scan/read that one code and you know exactly what the device is — catalog matching is trivial and unambiguous.

**Does any Android brand have an equivalent single code that encodes storage and/or color?**

**Short answer: No — not in any code that iosys actually displays.** Every Android brand's *displayed* model number behaves like Apple's **coarse A-number** (`A2849`): it identifies the **model + carrier/region variant**, but **storage and color are listed as separate fields**. Color is never in the displayed code. Storage is *sometimes* implicitly pinned — but only for Japanese single-carrier variants that happened to ship one storage tier, and never as a decodable digit.

There exist *longer* full sales SKUs for some brands (Samsung `SM-S921BZKDXJP`, Asus `ZS590KS-SL256S16`) where trailing letters/digits do encode color+region+storage — but iosys generally does **not** put the full SKU in the title (Asus is the one partial exception). So for our purposes those long SKUs are not a reliable intake key.

---

## How iosys formats titles (the universal pattern)

Across every brand, the iosys listing title is:

```
[Brand] ModelName ModelNumber Color(JP) 【RAM.. / ROM.. / 版(carrier/region)】
```

- **Model name** and **model number** are both shown, separately.
- **Color** is a free-text Japanese (or sometimes English) word, *outside* the model number.
- **Storage** is either in the `【ROMxxxGB】` bracket or inline (`128GB`), *outside* the model number.
- **Carrier/region** is in the bracket: `国内版SIMフリー` (domestic unlocked), `docomo版`, `au版`, `SoftBank版`, `楽天版` (Rakuten), `Y!mobile`, with `SIMフリー` / `SIM解除済` (SIM-unlocked) appended.

This confirms the headline: **iosys treats model_number, storage, and color as three independent fields.** The code never substitutes for the other two.

---

## Per-Brand Findings

### 1. Samsung Galaxy

**Identifier structure:** `SM-` + model digits + **1 region/variant letter**.
- `SM-S921B` = Galaxy S24, "B" = global/EMEA single-SIM-ish family.
- `SM-S921Q` = the **Japan domestic-unlocked ("Q") variant** — iosys uses the `Q` suffix heavily for 国内版SIMフリー stock.
- Japan carrier units use **carrier codes instead of/alongside SM-**: docomo `SC-51E`, au `SCG`-series (e.g. `SCG14`), and these appear *in place of* the SM- number in titles.

| Encodes... | Answer |
|---|---|
| Storage | **No** (short code). The trailing letter is region, not storage. |
| Color | **No** |
| Carrier/Region | **Yes** — the single suffix letter (`B`/`Q`/`U`...) and the SC-/SCG- carrier codes encode region/carrier. |

**Longer full SKU exists:** Yes — `SM-S921BZKDXJP` style, where `ZKD` = color + `XJP` = region pack. This *does* encode color+region, but iosys shows only the short `SM-S921Q`. Not a usable intake key for us.

**Real iosys titles:**
- `Galaxy A57 5G SM-A576Q オーサムネイビー 【RAM8GB/ROM128GB/国内版 SIMフリー】`
- `Samsung Galaxy S24 5G Single-SIM SM-S921Q アンバーイエロー【RAM8GB/ROM256GB 国内版SIMフリー】`
- `Galaxy S22 Ultra 5G SCG14 バーガンディ【au版 SIMフリー】`
- `Galaxy Z Fold7 SM-F966Q ミント【RAM12GB/ROM512GB 国内版SIMフリー】`
- `Galaxy Z Flip4 SC-54C ボラパープル【docomo版SIMフリー】`

**Verdict: MESSY.** SM-S/A flagships ship multiple storage tiers under one SM-..Q code → storage NOT pinned by code. au/docomo carrier codes (SCG14 / SC-54C) are usually single-storage → those specific units are cleaner.

---

### 2. Sony Xperia

**Identifier structure — THREE parallel codes for the same phone:**
- **Global / SIM-free:** `XQ-` + 4 chars (e.g. `XQ-DQ44`, `XQ-FS44`).
- **docomo:** `SO-` + number + letter (e.g. `SO-51D`, `SO-52D`).
- **au:** `SOG` + number (e.g. `SOG06`, `SOG10`).
- **SoftBank:** alphanumeric `A` + number + `SO` (e.g. `A301SO`).

Key nuance (confirmed via PhoneDB/GSMchoice): the **global `XQ-` code can span multiple storage tiers** — e.g. `XQ-DQ44` covers *both* 12/256 and 16/512. So even Sony's global code does **not** pin storage. By contrast the **JP carrier codes (`SO-51D`, `SOG10`) typically ship a single storage configuration** (e.g. SO-51D = 256GB only).

| Encodes... | Answer |
|---|---|
| Storage | **No** for `XQ-` (one code = multiple storages). *Effectively yes* for JP carrier codes (single-storage variant), but it's a lookup fact, not a decodable digit. |
| Color | **No** |
| Carrier/Region | **Yes** — which prefix you have (XQ-/SO-/SOG/A..SO) tells you the channel. |

**Longer full SKU:** Amazon JP shows a trailing color letter (`XQ-DQ44 B` = Black, `XQ-DQ44 G` = Khaki Green), but iosys does NOT use that suffix; color is spelled out in Japanese.

**Real iosys titles:**
- `SONY Xperia1 V 5G Dual-SIM XQ-DQ44 カーキグリーン【RAM16GB/ROM512GB 国内版SIMフリー】`
- `Xperia1 VII XQ-FS44 オーキッドパープル【RAM12GB/ROM256GB 国内版SIMフリー】`
- `Xperia1 IV SOG06 アイスホワイト【au版SIMフリー】`
- `Xperia5 III XQ-BQ42 Green【国内版SIMフリー】`
- `Xperia10 V SO-52D ホワイト【docomo版 SIMフリー】`

**Verdict: MIXED.** Carrier units (SO-/SOG/A..SO) are mostly single-storage = cleaner. SIM-free `XQ-` flagships span storages = still need storage as its own field.

---

### 3. Sharp AQUOS

**Identifier structure — multiple channel codes:**
- **SIM-free (domestic):** `SH-M` + number (e.g. `SH-M15`, `SH-M19`).
- **docomo:** `SH-` + number + letter (e.g. `SH-53D`).
- **au:** `SHG` + number (e.g. `SHG11`).
- **SoftBank:** `A` + number + `SH` (e.g. `A301SH`, `A401SH`).
- **Rakuten:** also uses SH-RM / SH-M style.

| Encodes... | Answer |
|---|---|
| Storage | **No** (separate field). |
| Color | **No** |
| Carrier/Region | **Yes** — SH-M (SIM-free) vs SH- (docomo) vs SHG (au) vs A..SH (SoftBank). |

**Longer full SKU:** Not meaningfully surfaced; color spelled out in Japanese.

**Real iosys titles:**
- `AQUOS sense4 SH-M15 ブラック【国内版 SIMフリー】`
- `AQUOS sense5G SH-M17 ブラック 【楽天版SIMフリー】`
- `AQUOS wish3 SH-53D ホワイト【docomo版 SIMフリー】`
- `AQUOS sense6 SH-M19 ブラック【RAM6GB/ROM128GB/国内版`
- `AQUOS R9 A401SH グリーン【SoftBank版SIMフリー】`

**Verdict: EASY-ish.** Most AQUOS (especially mid-range sense/wish carrier units) ship a single storage tier per carrier code → code ≈ single config. R-series flagships have more variants. Color always separate.

---

### 4. Google Pixel

**Identifier structure:** Short opaque alphanumeric, **per storage tier and sometimes per region/color batch** (e.g. `GE9DP`, `G576D`, `G82U8`, `G3Y12`, `GN4F5`). These are NOT human-decodable. Note Pixel often has a *different* code per storage capacity.

| Encodes... | Answer |
|---|---|
| Storage | **Partially / opaquely** — the code is tied to a SKU that includes a storage tier, but you cannot read storage off it; iosys lists storage explicitly anyway (`128GB`, `256GB`). |
| Color | **No** (color listed separately). |
| Carrier/Region | Mostly all sold as `国内版SIMフリー` or au; region weakly implied, not decodable. |

**Real iosys titles:**
- `Google Pixel8 Pro GE9DP 128GB Bay【国内版SIMフリー】`
- `Google Pixel8a G576D 128GB Obsidian【国内版SIMフリー】`
- `Google Pixel7a G82U8 128GB Sea【au版SIMフリー】`
- `Google Pixel9a G3Y12 Obsidian【RAM8GB/ROM256GB 国内版SIMフリー】`
- `Google Pixel10 Pro GN4F5 256GB Obsidian【国内版SIMフリー】`

**Verdict: MESSY (opaque).** Code is meaningless to humans and varies by storage; always rely on the explicit storage + color fields. Key on (model_name, storage, color).

---

### 5. Xiaomi (incl. Redmi, POCO)

**Identifier structure:** Global model numbers exist (e.g. `2201123G`, `M2101K6G`) but iosys **frequently omits the model number entirely** for SIM-free units. au-channel units use carrier codes (`XIG01`, `XIG04`).

| Encodes... | Answer |
|---|---|
| Storage | **No** (and often no code shown at all). |
| Color | **No** |
| Carrier/Region | au units (`XIG..`) yes; SIM-free units list `SIMフリー`. |

**Real iosys titles:**
- `Xiaomi 11T Pro 5G Celestial Blue` 128GB SIMフリー (no model number shown)
- `Xiaomi POCO F7 White` 512GB SIMフリー (no model number shown)
- `Redmi 14C Midnight Black` 128GB SIMフリー (no model number shown)
- `au Xiaomi Mi10 Lite 5G XIG01 Dream White` 128GB au SIM解除済
- `Xiaomi Redmi Note11 Graphite Gray` 64GB SIMフリー

**Verdict: MESSY.** Often no model number at all → MUST key on (model_name, storage, color). au XIG units are cleaner.

---

### 6. OPPO

**Identifier structure:**
- **SIM-free/global:** `CPH` + 4 digits (e.g. `CPH2013`, `CPH2699`).
- **Y!mobile/SoftBank:** `A` + number + `OP` (e.g. `A103OP`).

`CPH` codes are shared across regions; a single CPH number often spans multiple colors and sometimes storage tiers.

| Encodes... | Answer |
|---|---|
| Storage | **No** |
| Color | **No** |
| Carrier/Region | Weakly — CPH (global) vs A..OP (Y!mobile/SB). CPH itself doesn't pin Japan vs global cleanly. |

**Real iosys titles:**
- `Oppo Reno3 A CPH2013 White` 128GB SIMフリー
- `Oppo Reno A CPH1983 Black` 64GB SIMフリー
- `OPPO Reno5 A A103OP Ice Blue` 128GB Y!mobile
- `OPPO Reno13 A CPH2699 Ice Blue` 128GB SIMフリー
- `OPPO A77 CPH2385 Black` 128GB SIMフリー

**Verdict: EASY-ish.** Most JP OPPO A-series ship a single storage tier, so CPH ≈ one config in practice, but storage/color still listed separately. Code is shown consistently (good for verification).

---

### 7. ZTE / nubia

**Identifier structure:** `NX` + digits + region letter (e.g. nubia Flip 5G JP = `NX724J`, where `J` = Japan). Internal ZTE codename like `Z8888` also exists but isn't shown.

| Encodes... | Answer |
|---|---|
| Storage | **No** |
| Color | **No** |
| Carrier/Region | **Yes** — trailing `J` = Japan; sold as all-carrier-compatible SIM-free. |

No nubia/ZTE units were on iosys page 1 at investigation time (low volume). Japan nubia models are typically single-storage SIM-free → code ≈ one config.

**Verdict: EASY (low volume).** `NX..J` is a clean single-storage JP code, but iosys carries few units.

---

### 8. Fujitsu / FCNT arrows

**Identifier structure — channel codes:**
- **docomo:** `F-` + number + letter (e.g. `F-51C`, `F-41B`).
- **au:** `FCG` + number (e.g. `FCG01`, `FCG02`).
- **SIM-free (newer FCNT):** model-name code like `M08` (arrows Alpha M08).

| Encodes... | Answer |
|---|---|
| Storage | **No** |
| Color | **No** |
| Carrier/Region | **Yes** — F- (docomo) / FCG (au) / SIM-free. |

**Real iosys titles:**
- `arrows Alpha M08 ブラック【国内版SIMフリー】` (512GB)
- `arrows We FCG01 ホワイト【au版SIMフリー】` (64GB)
- `arrows N F-51C フォグホワイト【docomo版 SIMフリー】` (128GB)
- `arrows We2 FCG02 ライトブルー【RAM4GB/ROM64GB au版SIMフリー】` (64GB)
- `arrows Be4 Plus F-41B ブラック` (64GB, docomo)

**Verdict: EASY.** arrows are overwhelmingly single-storage carrier devices → carrier code ≈ one config. Color separate.

---

### 9. Asus Zenfone

**Identifier structure — TWO styles:**
- **Newer:** short project code `AI` + digits (e.g. `AI2202` for Zenfone 9). Shared across storage/color.
- **Older:** model code `ZSxxxKx` (e.g. `ZS590KS`, `ZB633KL`).
- **Full sales SKU (iosys sometimes shows this!):** `ZS590KS-SL256S16` where `SL` = Silver, `256` = 256GB ROM, `16` = 16GB RAM. **This is the one brand where iosys sometimes includes a storage+color-encoding SKU in the title.**

| Encodes... | Answer |
|---|---|
| Storage | **Sometimes** — only in the long `-SL256S16` SKU form, not in `AI2202`. |
| Color | **Sometimes** — `SL` = Silver in the long form; not in short form. |
| Carrier/Region | All SIM-free (国内版); no carrier variants. |

**Real iosys titles:**
- `ASUS Zenfone Max M2 ZB633KL 64GB Blue 【国内版 SIMフリー】`
- `ASUS Zenfone8 ZS590KS-SL256S16 Silver【16GB/256GB 国内版 SIMフリー】`
- `ASUS ZenFone9 AI2202 サンセットレッド【8GB/128GB 国内版 SIMフリー】`
- `ASUS ZenFone9 AI2202 ミッドナイトブラック【8GB/256GB 国内版 SIMフリー】`
- `ASUS ZenFone5Z ZS620KL-SL128S6 Dual-SIM 【Silver 128GB 国内版SIMフリー】`

**Verdict: MIXED.** `AI2202` short code = multiple storage/color (messy). The `-SL256S16` long SKU encodes everything (cleanest of any brand) but is inconsistently used. Storage/color still safest as separate fields.

---

### 10. Huawei

**Identifier structure:** Series-letter + `-LX` + digit + region letter (e.g. P30 lite = `MAR-LX2J`, where `J` = Japan). Internal codename-derived.

| Encodes... | Answer |
|---|---|
| Storage | **No** |
| Color | **No** |
| Carrier/Region | **Yes** — trailing `J` = Japan version. |

**Real iosys title:**
- `HUAWEI P30 lite MAR-LX2J Midnight Black【国内版 SIMFREE】` (64GB)

**Verdict: EASY-ish (low volume).** `..-LXxJ` is a clean single-config JP code, but Huawei volume is small and largely legacy.

---

### 11. Motorola

**Identifier structure:** `XT` + 4 digits + `-` + variant digit (e.g. `XT2211-2`). Variant digit ≈ region/SKU but not human-decodable for storage/color. iosys typically lists by model name (moto g, edge) with storage/color separate; the XT code may or may not appear.

| Encodes... | Answer |
|---|---|
| Storage | **No** (not decodably). |
| Color | **No** |
| Carrier/Region | Variant suffix weakly implies region; all sold SIM-free in JP. |

No Motorola units on iosys page 1 at investigation time. Generally single-storage SIM-free in JP.

**Verdict: EASY-ish (low volume).** Single-storage SIM-free; key on (model_name, storage, color); XT code as coarse attribute.

---

## Summary Matrix

| Brand | Displayed code | Encodes storage? | Encodes color? | Encodes carrier/region? | JP carrier units single-storage? | Easy / Messy |
|---|---|---|---|---|---|---|
| Samsung Galaxy | SM-..Q / SC- / SCG | No | No | Yes | Carrier yes; SM-..Q no | **Messy** |
| Sony Xperia | XQ- / SO- / SOG / A..SO | No (XQ spans 2) | No | Yes | Carrier yes; XQ no | **Mixed** |
| Sharp AQUOS | SH-M / SH- / SHG / A..SH | No | No | Yes | Mostly yes | **Easy-ish** |
| Google Pixel | G/GE/GN.. opaque | Opaque-ish | No | Weak | n/a | **Messy (opaque)** |
| Xiaomi | often none / XIG.. | No | No | Weak | XIG yes | **Messy** |
| OPPO | CPH.. / A..OP | No | No | Weak | Mostly yes | **Easy-ish** |
| ZTE/nubia | NX..J | No | No | Yes (J=JP) | Yes | **Easy (low vol)** |
| Fujitsu arrows | F- / FCG / M.. | No | No | Yes | Yes | **Easy** |
| Asus Zenfone | AI.. or ZS..-SLxxxSxx | Long SKU only | Long SKU only | No (SIM-free) | n/a | **Mixed** |
| Huawei | ..-LXxJ | No | No | Yes (J=JP) | Yes | **Easy-ish (low vol)** |
| Motorola | XT....-x | No | No | Weak | Yes | **Easy-ish (low vol)** |

---

## Bottom-Line Recommendation for Our Catalog

**Do NOT try to use the Android model_number as the storage/color-bearing key the way Apple's part number works.** No Android brand gives us a single displayed code that reliably encodes both storage and color. The displayed model number behaves like Apple's coarse A-number: model + carrier/region only.

**Recommended approach (the iPad / A-number model):**

> **Key Android `product_models` on `(brand, model_name, storage, color)`, and capture `model_number` as a coarse, non-unique attribute** (plus a separate `carrier` / `region` attribute). Treat `model_number` like Apple's A-number: useful for verification and disambiguation, never the unique catalog key.

Rationale:
1. **Color is never in the displayed code** for any brand → must always be its own field.
2. **Storage is in the code only opaquely or not at all**, and several brands (Samsung SM-..Q flagships, Sony XQ-) put multiple storage tiers under one code → must be its own field.
3. iosys itself models it this way: title = name + number + color + storage + carrier as five separate fields. Mirroring their structure makes intake parsing and matching straightforward.

**Practical refinements:**
- Store `model_number` AND `carrier`/`channel` (docomo/au/SoftBank/Rakuten/SIM-free) as attributes. For Samsung/Sony/Sharp/arrows the carrier code is the most reliable model+region disambiguator, even though it doesn't carry storage/color.
- For **easy brands** (arrows, AQUOS mid-range, OPPO A-series, ZTE, Huawei, Motorola), the carrier/JP model code usually maps to a single storage tier — you can *default/auto-fill* storage from the code via a lookup table to speed intake, but still store it as its own field.
- For **messy brands** (Samsung flagships, Pixel, Xiaomi), do not infer storage from the code — require the storage field at intake.
- **Asus is a special case:** if the long `-SLxxxSxx` SKU is present, you can parse storage+color from it; otherwise treat like the rest.
- Consider an optional `full_sku` text field (Samsung `SM-S921BZKDXJP`, Asus `ZS590KS-SL256S16`) for the rare cases the seller/source provides it — handy for exact provenance, but never required.

**Net:** one consistent Android schema — `(brand, model_name, storage, color)` as the matching key, with `model_number` + `carrier` as coarse attributes — works across all 11 brands. Per-brand keys are unnecessary; per-brand *intake hints* (auto-fill storage for easy brands) are a nice-to-have optimization.

---

## Confidence & Sources

**Confidence: High** for the core finding (no Android code encodes color; storage not reliably in any displayed code) and for the iosys title format (fetched live from iosys.co.jp category pages — Galaxy, Xperia, AQUOS, Pixel, Xiaomi, OPPO, Zenfone, arrows, Huawei). **Medium** for ZTE/nubia and Motorola (no live iosys listings at investigation time; structure from spec databases). **Medium** for exact internal meaning of Samsung/Asus long-SKU trailing characters (documented pattern, not byte-exact spec).

**Sources:**
- Live iosys.co.jp category pages: `/items/smartphone/{galaxy,xperia,aquos,pixel,xiaomi,oppo,zenfone,arrows}` and main `/items/smartphone` (fetched 2026-06-28).
- PhoneDB & GSMchoice device-spec databases (Sony XQ-DQ44 spanning 256/512; SO-51D = 256GB; Samsung SM-S921B/Q variants; ZTE nubia Flip NX724J JP).
- Amazon.co.jp listings (Sony XQ-DQ44 B/G color-letter suffix; nubia Flip 5G JP).
- repeater-builder.com / FYIcenter Motorola model-number hierarchy (XT family + variant digit).
- Brand carrier-code conventions (docomo SO-/SH-/SC-/F-; au SOG/SHG/SCG/FCG/XIG; SoftBank A..SO/A..SH/A..OP; Rakuten) cross-referenced against the live iosys titles above.
