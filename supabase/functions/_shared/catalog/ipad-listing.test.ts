import { assertEquals } from "https://deno.land/std/assert/mod.ts"
import {
  extractIpadCardTitles,
  parseIpadListingPage,
  parseIpadListingTitle,
} from "./ipad-listing.ts"

Deno.test("ipad: numbered iPad (year-named) wifi", () => {
  const s = parseIpadListingTitle("【第6世代】 iPad2018 Wi-Fi 32GB シルバー MR7G2J/A A1893")
  assertEquals(s?.base_line, "iPad")
  assertEquals(s?.generation, 6)
  assertEquals(s?.connectivity, "Wi-Fi")
  assertEquals(s?.storage_gb, 32)
  assertEquals(s?.color_en, "Silver")
  assertEquals(s?.part_number, "MR7G2J/A")
  assertEquals(s?.model_number, "A1893")
  assertEquals(s?.model_name, "iPad (6th generation) Wi-Fi")
  assertEquals(s?.carrier, null) // wifi-only -> no carrier
})

Deno.test("ipad: numbered iPad cellular with 版 bracket -> carrier", () => {
  const s = parseIpadListingTitle(
    "【第10世代】 iPad2022 Wi-Fi+Cellular 64GB ブルー MQ6K3J/A A2757 【docomo版SIMフリー】",
  )
  assertEquals(s?.model_name, "iPad (10th generation) Wi-Fi + Cellular")
  assertEquals(s?.connectivity, "Wi-Fi + Cellular")
  assertEquals(s?.carrier, "docomo")
  assertEquals(s?.is_unlocked, true)
  assertEquals(s?.color_en, "Blue")
})

Deno.test("ipad: mini5 with carrier-word prefix (SIM-unlocked)", () => {
  const s = parseIpadListingTitle(
    "【SIMロック解除済】【第5世代】 docomo iPad mini5 Wi-Fi+Cellular 64GB スペースグレイ MUX52J/A A2124",
  )
  assertEquals(s?.base_line, "iPad mini")
  assertEquals(s?.generation, 5)
  assertEquals(s?.model_name, "iPad mini (5th generation) Wi-Fi + Cellular")
  assertEquals(s?.carrier, "docomo") // prefix word beats path
  assertEquals(s?.is_unlocked, true)
  assertEquals(s?.color_en, "Space Gray")
})

Deno.test("ipad: mini (A17 Pro) = 7th gen, chip in name", () => {
  const s = parseIpadListingTitle(
    "【第7世代】 iPad mini(A17 Pro) Wi-Fi+Cellular 256GB スペースグレイ MXPT3J/A A2995 【国内版SIMフリー】",
  )
  assertEquals(s?.chip, "A17 Pro")
  assertEquals(s?.model_name, "iPad mini (A17 Pro) Wi-Fi + Cellular")
  assertEquals(s?.carrier, "SIM-Free")
})

Deno.test("ipad: Air5 (generation-named) wifi", () => {
  const s = parseIpadListingTitle("【第5世代】 iPad Air5 Wi-Fi 64GB スペースグレイ MM9C3J/A A2588")
  assertEquals(s?.base_line, "iPad Air")
  assertEquals(s?.model_name, "iPad Air (5th generation) Wi-Fi")
})

Deno.test("ipad: Air (M2) 11-inch chip+size in name (double-space tolerant)", () => {
  const s = parseIpadListingTitle(
    "【第6世代】 iPad Air(M2) 11インチ  Wi-Fi+Cellular 128GB パープル MUXG3J/A A2903 【SoftBank版SIMフリー】",
  )
  assertEquals(s?.chip, "M2")
  assertEquals(s?.size_inch, 11)
  assertEquals(s?.model_name, "iPad Air 11-inch (M2) Wi-Fi + Cellular")
  assertEquals(s?.carrier, "SoftBank")
  assertEquals(s?.color_en, "Purple")
})

Deno.test("ipad: Pro 11-inch generations are size+gen disambiguated", () => {
  const g1 = parseIpadListingTitle(
    "【第1世代】 iPad Pro 11インチ Wi-Fi 256GB スペースグレイ MTXQ2J/A A1980",
  )
  const g3 = parseIpadListingTitle(
    "【第3世代】 iPad Pro 11インチ Wi-Fi 128GB スペースグレイ MHQR3J/A A2377",
  )
  assertEquals(g1?.model_name, "iPad Pro 11-inch (1st generation) Wi-Fi")
  assertEquals(g3?.model_name, "iPad Pro 11-inch (3rd generation) Wi-Fi")
})

Deno.test("ipad: lone 9.7-inch Pro has no generation label", () => {
  const s = parseIpadListingTitle(
    "【第1世代】 iPad Pro 9.7インチ Wi-Fi 128GB スペースグレイ MLMV2J/A A1673",
  )
  assertEquals(s?.size_inch, 9.7)
  assertEquals(s?.model_name, "iPad Pro 9.7-inch Wi-Fi")
})

Deno.test("ipad: Pro (M4) 13-inch chip", () => {
  const s = parseIpadListingTitle(
    "【第1世代】 iPad Pro(M4) 13インチ Wi-Fi+Cellular 512GB スペースブラック MVXU3J/A A2926 【国内版SIMフリー】",
  )
  assertEquals(s?.chip, "M4")
  assertEquals(s?.size_inch, 13)
  assertEquals(s?.storage_gb, 512)
  assertEquals(s?.color_en, "Space Black")
  assertEquals(s?.model_name, "iPad Pro 13-inch (M4) Wi-Fi + Cellular")
})

Deno.test("ipad: glass token stripped, color still parsed (M5 Pro, 1TB)", () => {
  const s = parseIpadListingTitle(
    "【第2世代】 iPad Pro(M5) 13インチ Wi-Fi 1TB 標準ガラス スペースブラック MDYN4J/A A3360 【国内版Wi-Fi】",
  )
  assertEquals(s?.glass, "標準ガラス")
  assertEquals(s?.color_en, "Space Black")
  assertEquals(s?.storage_gb, 1024)
  assertEquals(s?.model_name, "iPad Pro 13-inch (M5) Wi-Fi")
})

Deno.test("ipad: overseas region code (LL/USA) -> is_domestic false", () => {
  const s = parseIpadListingTitle(
    "【第5世代】iPad Pro 12.9インチ Wi-Fi 256GB スペースグレイ MHNH3LL/A A2378【海外版Wi-Fi】",
  )
  assertEquals(s?.region_code, "LL")
  assertEquals(s?.is_domestic, false)
  assertEquals(s?.model_name, "iPad Pro 12.9-inch (5th generation) Wi-Fi")
})

Deno.test("ipad: non-matching string -> null", () => {
  assertEquals(parseIpadListingTitle("just some text"), null)
  assertEquals(parseIpadListingTitle(""), null)
})

// --- fixture-driven page parse ---------------------------------------------
const simfree = await Deno.readTextFile(
  new URL("./__fixtures__/iosys-ipad-simfree-p1.html", import.meta.url),
)
const wifi = await Deno.readTextFile(
  new URL("./__fixtures__/iosys-ipad-wifi-p1.html", import.meta.url),
)

Deno.test("page: extracts many iPad card titles from the real fixtures", () => {
  assertEquals(extractIpadCardTitles(simfree).length > 30, true)
  assertEquals(extractIpadCardTitles(wifi).length > 30, true)
})

Deno.test("page: dedupes to a clean SKU set keyed by part_number", () => {
  const skus = parseIpadListingPage(simfree, "SIM-Free")
  for (const s of skus) {
    assertEquals(typeof s.part_number, "string")
    assertEquals(s.part_number.endsWith("/A"), true)
    assertEquals(s.model_name.startsWith("iPad"), true)
  }
  const parts = skus.map((s) => s.part_number)
  assertEquals(parts.length, new Set(parts).size)
  assertEquals(skus.length >= 25, true)
})
