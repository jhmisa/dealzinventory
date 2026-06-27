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
  assertEquals(p.color, "ピンク")
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
