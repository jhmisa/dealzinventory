import { assertEquals } from "https://deno.land/std/assert/mod.ts"
import { extractCardTitles, parseListingPage, parseListingTitle } from "./iosys-listing.ts"

Deno.test("title: parses a full domestic SIM-free SKU", () => {
  const sku = parseListingTitle(
    "【バッテリー80%未満】iPhone12 A2402 (MGHV3J/A) 128GB ホワイト 【国内版SIMフリー】",
  )
  assertEquals(sku?.model_name, "iPhone 12")
  assertEquals(sku?.model_number, "A2402")
  assertEquals(sku?.part_number, "MGHV3J/A")
  assertEquals(sku?.storage_gb, 128)
  assertEquals(sku?.color_ja, "ホワイト")
  assertEquals(sku?.color_en, "White")
  assertEquals(sku?.region_note, "国内版SIMフリー")
  assertEquals(sku?.region_code, "J")
  assertEquals(sku?.is_domestic, true)
  assertEquals(sku?.carrier, "SIM-Free")
  assertEquals(sku?.is_unlocked, true)
})

Deno.test("title: carrier-prefixed unlocked unit -> carrier from prefix, is_unlocked true", () => {
  const sku = parseListingTitle(
    "【SIMロック解除済】SoftBank iPhone12 A2402 (MGHN3J/A) 64GB ブラック",
    "SIM-Free", // crawled under the simfree path, but the title says SoftBank
  )
  assertEquals(sku?.model_name, "iPhone 12")
  assertEquals(sku?.carrier, "SoftBank") // title prefix beats the path
  assertEquals(sku?.is_unlocked, true)
  assertEquals(sku?.storage_gb, 64)
  assertEquals(sku?.color_en, "Black")
})

Deno.test("title: docomo prefix on an older model", () => {
  const sku = parseListingTitle(
    "【SIMロック解除済】docomo iPhone7 A1779 (MNCJ2J/A) 32GB ローズゴールド",
    "SIM-Free",
  )
  assertEquals(sku?.model_name, "iPhone 7")
  assertEquals(sku?.carrier, "docomo")
  assertEquals(sku?.color_en, "Rose Gold")
  assertEquals(sku?.is_domestic, true)
})

Deno.test("title: Pro Max model + TB storage + titanium color", () => {
  const sku = parseListingTitle(
    "iPhone16 Pro Max A3295 (MYWG3J/A) 256GB ブラックチタニウム 【国内版SIMフリー】",
  )
  assertEquals(sku?.model_name, "iPhone 16 Pro Max")
  assertEquals(sku?.storage_gb, 256)
  assertEquals(sku?.color_en, "Black Titanium")
})

Deno.test("title: 2TB folds to 2048 GB", () => {
  const sku = parseListingTitle(
    "iPhone17 Pro Max A3525 (MFYK4J/A) 2TB コズミックオレンジ 【国内版SIMフリー】",
  )
  assertEquals(sku?.storage_gb, 2048)
  assertEquals(sku?.color_en, "Cosmic Orange")
})

Deno.test("title: foreign import flagged is_domestic=false via region code", () => {
  const sku = parseListingTitle(
    "iPhone15 Plus A3093 (MU093VC/A) 128GB ピンク 【カナダ版SIMフリー】",
  )
  assertEquals(sku?.part_number, "MU093VC/A")
  assertEquals(sku?.region_code, "VC")
  assertEquals(sku?.is_domestic, false)
  assertEquals(sku?.carrier, "SIM-Free")
  assertEquals(sku?.color_en, "Pink")
})

Deno.test("title: unmapped color -> color_en null (flagged), color_ja kept", () => {
  const sku = parseListingTitle(
    "iPhone17 A3519 (MG6C4J/A) 256GB セージ 【国内版SIMフリー】",
  )
  assertEquals(sku?.color_ja, "セージ")
  assertEquals(sku?.color_en, "Sage") // now mapped
  const sku2 = parseListingTitle(
    "iPhone99 A9999 (XYZ9J/A) 256GB 謎いろ 【国内版SIMフリー】",
  )
  assertEquals(sku2?.color_en, null)
})

Deno.test("title: non-matching string -> null", () => {
  assertEquals(parseListingTitle("just some text"), null)
  assertEquals(parseListingTitle(""), null)
})

// --- fixture-driven page parse ---------------------------------------------
const fixture = await Deno.readTextFile(
  new URL("./__fixtures__/iosys-iphone-simfree-p1.html", import.meta.url),
)

Deno.test("page: extracts many card titles from the real fixture", () => {
  const titles = extractCardTitles(fixture)
  assertEquals(titles.length > 30, true)
})

Deno.test("page: dedupes to a clean SKU set keyed by part_number", () => {
  const skus = parseListingPage(fixture)
  // every SKU has the mandatory absolute key + a model name
  for (const s of skus) {
    assertEquals(typeof s.part_number, "string")
    assertEquals(s.part_number.endsWith("/A"), true)
    assertEquals(s.model_name.startsWith("iPhone"), true)
  }
  // part_numbers are unique
  const parts = skus.map((s) => s.part_number)
  assertEquals(parts.length, new Set(parts).size)
  // sanity: the fixture yields a substantial catalog slice
  assertEquals(skus.length >= 30, true)
})
