// Multi-brand Add-Backorder verification harness. Fetches REAL iosys single-product pages,
// runs the iosys parser, and asserts color/grade/specs/modelNumber/accessories per brand.
// Run: deno run --allow-net supabase/functions/_shared/supplier-adapters/verify-multibrand.ts
// Iterate via /loop until every brand prints PASS. URLs are live; if a listing 404s (sold out),
// swap it for another single-product URL of the same brand from iosys.co.jp.
import { iosysAdapter } from "./iosys.ts"

interface Case {
  brand: string
  url: string
  // Soft expectations: a missing/null parse is a FAIL only for the listed keys.
  expect: {
    modelNumberLike?: RegExp
    colorEnNotNull?: boolean
    colorJaNotNull?: boolean
    gradeNotNull?: boolean
    storageNotNull?: boolean
    cpuNotNull?: boolean
    accessoriesNotNull?: boolean
  }
}

const CASES: Case[] = [
  {
    brand: "Sony Xperia (SO-52C)",
    url: "https://iosys.co.jp/items/smartphone/xperia10/docomo/xperia10_iv_so-52c/278266",
    expect: { modelNumberLike: /SO-52C/, colorEnNotNull: true, colorJaNotNull: true, gradeNotNull: true, storageNotNull: true, cpuNotNull: true, accessoriesNotNull: true },
  },
  // Fill these with current live single-product URLs (one per brand) before running. Pick any
  // in-stock unit from each brand's iosys section:
  { brand: "Apple iPhone", url: "https://iosys.co.jp/items/smartphone/iphone/simfree/", expect: { colorEnNotNull: true, gradeNotNull: true, storageNotNull: true } },
  { brand: "Apple iPad",   url: "https://iosys.co.jp/items/tablet/ipad/wifi/",          expect: { colorEnNotNull: true, gradeNotNull: true, storageNotNull: true } },
  { brand: "Samsung Galaxy", url: "https://iosys.co.jp/items/smartphone/galaxy/",       expect: { modelNumberLike: /SC-|SM-|SCG|SCV/, colorEnNotNull: true, gradeNotNull: true } },
  { brand: "Sharp AQUOS",    url: "https://iosys.co.jp/items/smartphone/aquos/",        expect: { modelNumberLike: /SH-|SHG|SHV/, gradeNotNull: true } },
  { brand: "Google Pixel",   url: "https://iosys.co.jp/items/smartphone/pixel/",        expect: { colorEnNotNull: true, gradeNotNull: true } },
]

function check(label: string, ok: boolean, detail: string): boolean {
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${detail}`)
  return ok
}

let anyFail = false
for (const c of CASES) {
  console.log(`\n=== ${c.brand} ===\n  ${c.url}`)
  // Resolve the section URL to a concrete product URL when needed: fetch and grab the first
  // /items/.../<digits> link. (Single-product URLs like SO-52C are used directly.)
  let productUrl = c.url
  let html = ""
  try {
    const res = await fetch(c.url, { headers: { "User-Agent": "Mozilla/5.0" } })
    html = await res.text()
    if (!/\/items\/[^"']*\/\d{4,}/.test(productUrl)) {
      const m = html.match(/href="(\/items\/[^"']*\/\d{4,})"/)
      if (m) {
        productUrl = "https://iosys.co.jp" + m[1]
        const r2 = await fetch(productUrl, { headers: { "User-Agent": "Mozilla/5.0" } })
        html = await r2.text()
        console.log(`  -> resolved product: ${productUrl}`)
      }
    }
  } catch (e) {
    console.log(`  ✗ fetch failed: ${e instanceof Error ? e.message : e}`)
    anyFail = true
    continue
  }

  const p = iosysAdapter.parse(html, productUrl)
  let pass = true
  if (c.expect.modelNumberLike) pass = check("modelNumber", c.expect.modelNumberLike.test(p.modelNumber ?? ""), String(p.modelNumber)) && pass
  if (c.expect.colorEnNotNull) pass = check("color (EN)", p.color != null, String(p.color)) && pass
  if (c.expect.colorJaNotNull) pass = check("color (JA)", p.colorJa != null, String(p.colorJa)) && pass
  if (c.expect.gradeNotNull) pass = check("grade", p.conditionGrade != null, String(p.conditionGrade)) && pass
  if (c.expect.storageNotNull) pass = check("storage", p.storageGb != null, String(p.storageGb)) && pass
  if (c.expect.cpuNotNull) pass = check("cpu", p.specs.cpu != null, String(p.specs.cpu)) && pass
  if (c.expect.accessoriesNotNull) pass = check("accessories", p.includedAccessories != null, String(p.includedAccessories)) && pass
  console.log(`  ${pass ? "PASS" : "FAIL"}`)
  if (!pass) anyFail = true
}

console.log(`\n${anyFail ? "SOME BRANDS FAILED" : "ALL BRANDS PASS"}`)
if (anyFail) Deno.exit(1)
