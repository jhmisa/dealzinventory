import { iosysAdapter, translateAccessories } from "./iosys.ts"
import { assertEquals } from "https://deno.land/std/assert/mod.ts"

const code = "384323"
const html = await Deno.readTextFile(
  new URL(`./__fixtures__/iosys-${code}.html`, import.meta.url),
)
const url =
  "https://iosys.co.jp/items/smartphone/iphone/simfree/iphone15_plus_a3093/384323"

Deno.test("iosys: extracts product code from URL", () => {
  assertEquals(iosysAdapter.extractCode(url), code)
})

Deno.test("iosys: extracts product code from bare numeric string", () => {
  assertEquals(iosysAdapter.extractCode("384323"), "384323")
})

Deno.test("iosys: matches host", () => {
  assertEquals(iosysAdapter.matches("https://iosys.co.jp/items/x/1"), true)
  assertEquals(iosysAdapter.matches("https://other.com/x"), false)
})

Deno.test("iosys: parses model, price, stock, rank->grade, gallery", () => {
  const p = iosysAdapter.parse(html, url)
  assertEquals(p.supplierKey, "iosys")
  assertEquals(p.supplierProductCode, code)
  assertEquals(p.sourceUrl, url)
  assertEquals(p.brandText, "Apple")
  assertEquals(p.modelText, "iPhone15 Plus A3093 (MU093VC/A) 128GB ピンク")
  assertEquals(p.color, "Pink") // canonical English derived from the JA token
  assertEquals(p.colorJa, "ピンク") // original Japanese kept for the Kaitori side
  assertEquals(p.storageGb, 128)
  // iPhone pages do not surface RAM -> null
  assertEquals(p.ramGb, null)
  assertEquals(p.rankText, "新品")
  assertEquals(p.conditionGrade, "S")
  assertEquals(typeof p.supplierPrice, "number")
  assertEquals(p.supplierPrice, 104800)
  assertEquals(p.stock, 272)
  assertEquals(p.imageUrls.length > 0, true)
  assertEquals(
    p.imageUrls.includes("https://d27ea4kkb8flj9.cloudfront.net/384323_1_L.jpg"),
    true,
  )
})

// --- Sony SO-52C (Android, no storage token in title, JP color, spec table) ----------
const so52cHtml = await Deno.readTextFile(
  new URL("./__fixtures__/iosys-so-52c.html", import.meta.url),
)
const so52cUrl =
  "https://iosys.co.jp/items/smartphone/xperia10/docomo/xperia10_iv_so-52c/278266"

Deno.test("iosys: SO-52C Android — modelNumber, JP color, grade, spec table, accessories", () => {
  const p = iosysAdapter.parse(so52cHtml, so52cUrl)
  assertEquals(p.modelNumber, "SO-52C")
  assertEquals(p.colorJa, "ミント")
  assertEquals(p.color, "Mint")
  assertEquals(p.conditionGrade, "C")
  assertEquals(p.storageGb, 128)
  assertEquals(p.specs.ramGb, 6)
  assertEquals((p.specs.cpu ?? "").includes("Snapdragon 695") || (p.specs.cpu ?? "").includes("Snapdragon695"), true)
  // 付属品 "箱/マニュアル" is translated to English on parse.
  assertEquals(p.includedAccessories, "Box / Manual")
})

Deno.test("iosys: accessory translation — known terms → English, unknown kept verbatim", () => {
  assertEquals(translateAccessories("箱/マニュアル"), "Box / Manual")
  assertEquals(translateAccessories("充電器、ケーブル"), "Charger / Cable")
  assertEquals(translateAccessories("元箱・取扱説明書・SIMピン"), "Original Box / Manual / SIM Ejector Pin")
  assertEquals(translateAccessories("付属品なし"), "None")
  assertEquals(translateAccessories("箱マニュアル"), "Box Manual") // compound w/o separator
  assertEquals(translateAccessories("Lightningケーブル"), "Lightning Cable") // unknown prefix kept
  assertEquals(translateAccessories(null), null)
  assertEquals(translateAccessories(""), null)
})

// --- Apple iPad — color must NOT drag the trailing part#/model-code tokens -------------
// iPad titles place the color BEFORE the part number ("128GB ブルー MH314J/A A3459"), unlike
// iPhone titles ("A3093 (MU093VC/A) 128GB ピンク"). The storage-anchored color capture used to
// return "ブルー MH314J/A A3459"; stripTrailingCodes() now trims it back to the bare color.
const ipadHtml = await Deno.readTextFile(
  new URL("./__fixtures__/iosys-ipad-400178.html", import.meta.url),
)
const ipadUrl =
  "https://iosys.co.jp/items/tablet/ios/ipad/wifi/ipad_air_11インチ_wi-fi/400178"

Deno.test("iosys: iPad color strips trailing part# / model code", () => {
  const p = iosysAdapter.parse(ipadHtml, ipadUrl)
  assertEquals(p.colorJa, "ブルー")
  assertEquals(p.color, "Blue")
  assertEquals(p.storageGb, 128)
  assertEquals(p.conditionGrade, "S")
})

// --- Title with LEADING 【...】 promo tags — modelText must survive -----------------------
// This docomo iPhone12 listing's title starts with 【バッテリー80%未満】【SIMロック解除済】.
// The old `title.split("【")[0]` returned "" (everything before the first 【), which dropped the
// model text entirely and broke catalog matching ("No matching product model"). All 【...】 blocks
// must be stripped wherever they appear, leaving the real model text (incl. the part number).
const battHtml = await Deno.readTextFile(
  new URL("./__fixtures__/iosys-308737.html", import.meta.url),
)
const battUrl =
  "https://iosys.co.jp/items/smartphone/iphone12/docomo/iphone12_a2402/308737"

Deno.test("iosys: leading 【...】 promo tags don't wipe modelText (part# preserved)", () => {
  const p = iosysAdapter.parse(battHtml, battUrl)
  assertEquals(p.modelText, "docomo iPhone12 A2402 (MGHV3J/A) 128GB ホワイト")
  assertEquals(p.brandText, "Apple")
  assertEquals(p.color, "White")
  assertEquals(p.colorJa, "ホワイト")
  assertEquals(p.storageGb, 128)
  assertEquals(p.conditionGrade, "A")
})

// --- Surface (Microsoft) detail page — config-in-bracket title, eMMC spec key -----------------
// The Surface Go2 B-code repro (2026-07-20): the raw-title color match dragged the config
// bracket tail in as the color ("eMMC/Win11Home】"), and storage fell back to the title's RAM
// token because the spec table labels the storage row "eMMC"/"SSD", not "ROM"/"容量".
const surfaceHtml = await Deno.readTextFile(
  new URL("./__fixtures__/iosys-413644.html", import.meta.url),
)
const surfaceUrl =
  "https://iosys.co.jp/items/tablet/windows/surface/wifi/surface_go2_stv-00012/413644"

Deno.test("iosys: Surface Go2 — part# as modelNumber, no bracket-garbage color, eMMC storage", () => {
  const p = iosysAdapter.parse(surfaceHtml, surfaceUrl)
  assertEquals(p.supplierProductCode, "413644")
  assertEquals(p.brandText, "MICROSOFT")
  assertEquals(p.modelText, "Surface Go2 STV-00012")
  assertEquals(p.modelNumber, "STV-00012") // Microsoft retail SKU — drives catalog matching
  assertEquals(p.color, null) // colorless listing; must NOT be "eMMC/Win11Home】"
  assertEquals(p.colorJa, null)
  assertEquals(p.storageGb, 64) // from the spec table's eMMC row, not the title's 4GB RAM token
  assertEquals(p.ramGb, 4)
  assertEquals(p.conditionGrade, "B")
  assertEquals(p.stock, 1)
  assertEquals(p.specs.screenSize, 10.5)
  assertEquals(p.specs.year, 2020)
  assertEquals(p.specs.cpu, "Pentium Gold 4425Y(1.7GHz)")
})
