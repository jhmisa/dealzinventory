import { iosysAdapter } from "./iosys.ts"
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
  assertEquals((p.includedAccessories ?? "").includes("箱"), true)
  assertEquals((p.includedAccessories ?? "").includes("マニュアル"), true)
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
