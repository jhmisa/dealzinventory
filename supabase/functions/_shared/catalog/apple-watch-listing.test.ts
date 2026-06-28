import { assertEquals } from "https://deno.land/std/assert/mod.ts"
import {
  extractAppleWatchCardTitles,
  parseAppleWatchListingPage,
  parseAppleWatchListingTitle,
} from "./apple-watch-listing.ts"
import { appleWatchSeriesKey, appleWatchSpec } from "./apple-watch-specs.ts"

const w = (t: string) => parseAppleWatchListingTitle(t)

Deno.test("watch: Series7 45mm GPS aluminum midnight", () => {
  const s = w("Apple Watch Series7 45mm GPSモデル MKN53J/A A2474【ミッドナイトアルミニウムケース/ミッドナイトスポーツバンド】")
  assertEquals(s?.model_name, "Watch Series 7")
  assertEquals(s?.collection, null)
  assertEquals(s?.case_size_mm, 45)
  assertEquals(s?.case_material, "Aluminum")
  assertEquals(s?.form_factor, "45mm Aluminum")
  assertEquals(s?.connectivity, "GPS")
  assertEquals(s?.has_cellular, false)
  assertEquals(s?.part_number, "MKN53J/A")
  assertEquals(s?.band_part_number, null)
  assertEquals(s?.model_number, "A2474")
  assertEquals(s?.color_ja, "ミッドナイト")
  assertEquals(s?.color_en, "Midnight")
  assertEquals(s?.region_code, "J")
  assertEquals(s?.is_domestic, true)
})

Deno.test("watch: GPS+Cellular sets has_cellular", () => {
  const s = w("Apple Watch Series8 45mm GPS+Cellularモデル MNK43J/A A2775【ミッドナイトアルミニウムケース/ミッドナイトスポーツバンド】")
  assertEquals(s?.model_name, "Watch Series 8")
  assertEquals(s?.has_cellular, true)
  assertEquals(s?.connectivity, "GPS + Cellular")
})

Deno.test("watch: Series10/11 double-digit series number", () => {
  const a = w("Apple Watch Series10 46mm GPSモデル MWWP3J/A A2999【ジェットブラックアルミニウムケース/ブラックスポーツバンド】")
  assertEquals(a?.model_name, "Watch Series 10")
  assertEquals(a?.color_en, "Jet Black")
  const b = w("Apple Watch Series11 42mm GPS+Cellularモデル MF8R4J/A A3335【スレートチタニウムケース/ブラックスポーツバンド(S/M)】")
  assertEquals(b?.model_name, "Watch Series 11")
  assertEquals(b?.case_material, "Titanium")
  assertEquals(b?.form_factor, "42mm Titanium")
  assertEquals(b?.color_en, "Slate")
})

Deno.test("watch: secondary band part# (+MAXC4FE/A) captured, identity is primary", () => {
  const s = w("Apple Watch SE3 40mm GPSモデル MEHV4J/A+MAXC4FE/A A3324【スターライトアルミニウムケース/ライトブラッシュスポーツバンド(S/M)】")
  assertEquals(s?.model_name, "Watch SE 3")
  assertEquals(s?.part_number, "MEHV4J/A")
  assertEquals(s?.band_part_number, "MAXC4FE/A")
  assertEquals(s?.color_en, "Starlight")
})

Deno.test("watch: SE3 -> 'SE 3'", () => {
  const s = w("Apple Watch SE3 44mm GPS+Cellularモデル MEPJ4J/A A3328【ミッドナイトアルミニウムケース/ミッドナイトスポーツバンド(M/L)】")
  assertEquals(s?.model_name, "Watch SE 3")
})

Deno.test("watch: 【第2世代】SE -> 'SE (2nd gen)'", () => {
  const s = w("【第2世代】Apple Watch SE 40mm GPSモデル MXEF3J/A A2722【スターライトアルミニウムケース/スターライトスポーツバンド】")
  assertEquals(s?.model_name, "Watch SE (2nd gen)")
  assertEquals(s?.generation, 2)
})

Deno.test("watch: Ultra (no number) titanium, natural color default", () => {
  const s = w("Apple Watch Ultra 49mm GPS+Cellularモデル MNHK3J/A A2684【チタニウムケース/イエロー ベージュトレイルループ(S/M)】")
  assertEquals(s?.model_name, "Watch Ultra")
  assertEquals(s?.case_material, "Titanium")
  assertEquals(s?.form_factor, "49mm Titanium")
  assertEquals(s?.color_ja, null) // no color word in bracket
  assertEquals(s?.color_en, "Natural") // natural titanium
  assertEquals(s?.has_cellular, true)
  // band contains a slash inside (S/M) — must not break the split
  assertEquals(s?.band_ja, "イエロー ベージュトレイルループ(S/M)")
})

Deno.test("watch: Ultra2 / Ultra3 black titanium", () => {
  const a = w("Apple Watch Ultra2 49mm GPS+Cellularモデル MX4U3J/A A2986【ブラックチタニウムケース/ブラックトレイルループ】")
  assertEquals(a?.model_name, "Watch Ultra 2")
  assertEquals(a?.case_material, "Titanium")
  assertEquals(a?.color_en, "Black")
  const b = w("Apple Watch Ultra3 49mm GPS+Cellularモデル MF1H4J/A A3281【ブラックチタニウムケース/ブラックチャコールトレイルループ(M/L)】")
  assertEquals(b?.model_name, "Watch Ultra 3")
})

Deno.test("watch: Nike collection in model name", () => {
  const s = w("Apple Watch Nike Series7 45mm GPS+Cellularモデル MKL53J/A A2478【ミッドナイトアルミニウムケース/アンスラサイト ブラックNikeスポーツバンド】")
  assertEquals(s?.model_name, "Watch Nike Series 7")
  assertEquals(s?.collection, "Nike")
})

Deno.test("watch: 【バンド無し】 Hermes stainless steel, case only", () => {
  const s = w("【バンド無し】Apple Watch Hermes Series6 44mm GPS+Cellularモデル MJ493J/A A2376【シルバーステンレススチールケース】")
  assertEquals(s?.model_name, "Watch Hermes Series 6")
  assertEquals(s?.collection, "Hermes")
  assertEquals(s?.band_less, true)
  assertEquals(s?.case_material, "Stainless Steel")
  assertEquals(s?.form_factor, "44mm Stainless Steel")
  assertEquals(s?.color_en, "Silver")
  assertEquals(s?.band_ja, null)
})

Deno.test("watch: 【バンド無し】 Edition titanium natural", () => {
  const s = w("【バンド無し】Apple Watch Edition Series6 40mm GPS+Cellularモデル MJ4M3J/A A2375【チタニウムケース】")
  assertEquals(s?.model_name, "Watch Edition Series 6")
  assertEquals(s?.collection, "Edition")
  assertEquals(s?.band_less, true)
  assertEquals(s?.color_en, "Natural")
})

Deno.test("watch: (PRODUCT)RED aluminum", () => {
  const s = w("Apple Watch Series6 44mm GPSモデル M02H3J/A+MG463FE/A A2292【(PRODUCT)REDアルミニウムケース/(PRODUCT)REDスポーツループ】")
  assertEquals(s?.model_name, "Watch Series 6")
  assertEquals(s?.case_material, "Aluminum")
  assertEquals(s?.color_en, "(PRODUCT)RED")
})

Deno.test("watch: gold stainless steel (Series 5)", () => {
  const s = w("【バンド無し】Apple Watch Series5 44mm GPS+Cellularモデル MWWH2J/A A2157【ゴールドステンレススチールケース】")
  assertEquals(s?.case_material, "Stainless Steel")
  assertEquals(s?.color_en, "Gold")
})

Deno.test("watch: non-watch / malformed titles return null", () => {
  assertEquals(w("iPhone 15 Pro A3101 256GB ナチュラルチタニウム"), null)
  assertEquals(w("Apple Watch SE2はこちらから"), null)
  assertEquals(w("Apple Watch比較"), null)
  assertEquals(w(""), null)
})

Deno.test("watch specs: series key extraction + lookup", () => {
  assertEquals(appleWatchSeriesKey("Apple Watch Series 7"), "Series 7")
  assertEquals(appleWatchSeriesKey("Apple Watch Nike Series 7"), "Series 7")
  assertEquals(appleWatchSeriesKey("Apple Watch SE (2nd gen)"), "SE (2nd gen)")
  assertEquals(appleWatchSeriesKey("Apple Watch SE 3"), "SE 3")
  assertEquals(appleWatchSeriesKey("Apple Watch Ultra 2"), "Ultra 2")
  assertEquals(appleWatchSpec("Apple Watch Series 7")?.chipset, "S7")
  assertEquals(appleWatchSpec("Apple Watch Series 11")?.chipset, "S10") // reuses S10
  assertEquals(appleWatchSpec("Apple Watch SE 3")?.chipset, "S10")
  assertEquals(appleWatchSpec("Apple Watch SE")?.year, 2020) // 1st gen
  assertEquals(appleWatchSpec("Apple Watch SE (2nd gen)")?.chipset, "S8")
  assertEquals(appleWatchSpec("Apple Watch Ultra 3")?.chipset, "S10")
  assertEquals(appleWatchSpec("Apple Watch Hermes Series 6")?.chipset, "S6") // collection ignored
  assertEquals(appleWatchSpec("Apple Watch Series 99"), null) // unknown -> flagged
})

Deno.test("watch: extract + dedup a small page slice", () => {
  const html = `
    <img alt="Apple Watch Series7 45mm GPSモデル MKN53J/A A2474【ミッドナイトアルミニウムケース/ミッドナイトスポーツバンド】">
    <img alt="Apple Watch Series7 45mm GPSモデル MKN53J/A A2474【ミッドナイトアルミニウムケース/ミッドナイトスポーツバンド】">
    <img alt="Apple Watch SE2はこちらから">
    <img alt="Apple Watch Ultra2 49mm GPS+Cellularモデル MX4U3J/A A2986【ブラックチタニウムケース/ブラックトレイルループ】">
  `
  assertEquals(extractAppleWatchCardTitles(html).length, 3) // the "はこちらから" nav link lacks part#/mm
  const skus = parseAppleWatchListingPage(html)
  assertEquals(skus.length, 2) // deduped by part#
})
