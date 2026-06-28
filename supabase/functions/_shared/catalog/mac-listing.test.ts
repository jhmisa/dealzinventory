import { assertEquals } from "https://deno.land/std/assert/mod.ts"
import { extractMacCardTitles, parseMacListingPage, parseMacListingTitle } from "./mac-listing.ts"

const mac = (t: string) => parseMacListingTitle(t)

Deno.test("mac: Air M1, JA color, config bracket", () => {
  const s = mac("MacBook Air 13インチ MGN63J/A Late 2020 スペースグレイ【Apple M1/16GB/512GB SSD】")
  assertEquals(s?.model_name, "MacBook Air")
  assertEquals(s?.size_inch, 13)
  assertEquals(s?.part_number, "MGN63J/A")
  assertEquals(s?.period, "Late 2020")
  assertEquals(s?.year, 2020)
  assertEquals(s?.chip, "Apple M1")
  assertEquals(s?.is_intel, false)
  assertEquals(s?.ram_gb, 16)
  assertEquals(s?.ssd_gb, 512)
  assertEquals(s?.color_ja, "スペースグレイ")
  assertEquals(s?.color_en, "Space Gray")
  assertEquals(s?.region_code, "J")
  assertEquals(s?.is_domestic, true)
})

Deno.test("mac: Air M2 Midnight, 1TB SSD", () => {
  const s = mac("MacBook Air 13インチ MLY33J/A Mid 2022 ミッドナイト【Apple M2/24GB/1TB SSD】")
  assertEquals(s?.model_name, "MacBook Air")
  assertEquals(s?.chip, "Apple M2")
  assertEquals(s?.ram_gb, 24)
  assertEquals(s?.ssd_gb, 1024) // 1TB
  assertEquals(s?.color_en, "Midnight")
})

Deno.test("mac: USA region part suffix (LL)", () => {
  const s = mac("MacBook Air 13インチ MLY43LL/A Mid 2022 ミッドナイト【Apple M2/8GB/512GB SSD】")
  assertEquals(s?.part_number, "MLY43LL/A")
  assertEquals(s?.region_code, "LL")
  assertEquals(s?.is_domestic, false)
})

Deno.test("mac: Pro Intel Core i5 with GHz parenthetical", () => {
  const s = mac("MacBook Pro 13インチ MUHR2J/A Mid 2019 シルバー【Core i5(1.4GHz)/16GB/128GB SSD】")
  assertEquals(s?.model_name, "MacBook Pro")
  assertEquals(s?.chip, "Core i5") // GHz parenthetical stripped
  assertEquals(s?.is_intel, true)
  assertEquals(s?.cpu_cores, null) // GHz, not コア
  assertEquals(s?.ram_gb, 16)
  assertEquals(s?.ssd_gb, 128)
})

Deno.test("mac: Pro M3 Pro with CPU core count, Space Black", () => {
  const s = mac("MacBook Pro 14インチ MRX33J/A Late 2023 スペースブラック【Apple M3 Pro(11コア)/18GB/512GB SSD】")
  assertEquals(s?.size_inch, 14)
  assertEquals(s?.chip, "Apple M3 Pro") // tier kept, (11コア) stripped
  assertEquals(s?.cpu_cores, 11)
  assertEquals(s?.ram_gb, 18)
  assertEquals(s?.ssd_gb, 512)
  assertEquals(s?.color_en, "Space Black")
})

Deno.test("mac: M5 with CPU + GPU cores, 1TB no 'SSD' word", () => {
  const s = mac("MacBook Pro 14インチ MDE64J/A Late 2025 シルバー【Apple M5(10コア)/24GB/1TB/10コアGPU】")
  assertEquals(s?.chip, "Apple M5")
  assertEquals(s?.cpu_cores, 10)
  assertEquals(s?.gpu_cores, 10)
  assertEquals(s?.ram_gb, 24)
  assertEquals(s?.ssd_gb, 1024)
  assertEquals(s?.year, 2025)
})

Deno.test("mac: M1 Pro 16-inch", () => {
  const s = mac("MacBook Pro 16インチ MK183J/A Late 2021 スペースグレイ【Apple M1 Pro(10コア)/16GB/512GB SSD】")
  assertEquals(s?.size_inch, 16)
  assertEquals(s?.chip, "Apple M1 Pro")
  assertEquals(s?.cpu_cores, 10)
})

Deno.test("mac: leading condition bracket peeled, double space tolerated", () => {
  const s = mac("【電源アダプタ・ケーブル欠品】MacBook Air 13インチ MLXX3JA/A Mid 2022 スペースグレイ【Apple M2/16GB/512GB SSD】")
  assertEquals(s?.model_name, "MacBook Air")
  assertEquals(s?.part_number, "MLXX3JA/A")
  assertEquals(s?.ram_gb, 16)
  assertEquals(s?.color_en, "Space Gray")
})

Deno.test("mac: 15-inch Air M4", () => {
  const s = mac("MacBook Air 15インチ  MC6J4J/A Early 2025 シルバー【Apple M4/24GB/512GB SSD】")
  assertEquals(s?.size_inch, 15)
  assertEquals(s?.chip, "Apple M4")
  assertEquals(s?.ram_gb, 24)
})

Deno.test("mac: non-Mac / nav -> null", () => {
  assertEquals(mac("MacBook"), null) // bare nav, no part#/size
  assertEquals(mac("iPad Air 11インチ MUWE3J/A スターライト"), null) // not MacBook
})

Deno.test("mac: page extraction + dedupe by part#", () => {
  const html = Deno.readTextFileSync(
    new URL("./__fixtures__/iosys-macbook-p1.html", import.meta.url),
  )
  const titles = extractMacCardTitles(html)
  assertEquals(titles.length > 10, true)
  const skus = parseMacListingPage(html)
  assertEquals(skus.length > 10, true)
  assertEquals(skus.every((s) => /^MacBook/.test(s.model_name)), true)
  assertEquals(skus.every((s) => /\/A$/.test(s.part_number)), true)
  // dedupe key = part_number uniqueness
  const parts = new Set(skus.map((s) => s.part_number))
  assertEquals(parts.size, skus.length)
})

// ---------------------------------------------------------------------------
// Desktop Macs — Mac mini (no size/color), iMac (size + storage-type in bracket)
// ---------------------------------------------------------------------------

Deno.test("mac: Mac mini M1, no size, no color", () => {
  const s = mac("Mac mini MGNR3J/A Late 2020【Apple M1/8GB/256GB SSD】")
  assertEquals(s?.model_name, "Mac mini")
  assertEquals(s?.size_inch, null)
  assertEquals(s?.color_ja, null)
  assertEquals(s?.chip, "Apple M1")
  assertEquals(s?.ram_gb, 8)
  assertEquals(s?.ssd_gb, 256)
  assertEquals(s?.storage_type, "SSD")
  assertEquals(s?.year, 2020)
})

Deno.test("mac: Mac mini Intel Core i3", () => {
  const s = mac("Mac mini MRTR2J/A Late 2018【Core i3(3.6GHz)/8GB/128GB SSD】")
  assertEquals(s?.model_name, "Mac mini")
  assertEquals(s?.chip, "Core i3")
  assertEquals(s?.is_intel, true)
  assertEquals(s?.ram_gb, 8)
  assertEquals(s?.ssd_gb, 128)
})

Deno.test("mac: iMac M4 with color, size in bracket (24inch)", () => {
  const s = mac("iMac Retina 4.5K MWUF3J/A Late 2024 ブルー【Apple M4/24inch/16GB/256GB SSD】")
  assertEquals(s?.model_name, "iMac")
  assertEquals(s?.imac_variant, "4.5K")
  assertEquals(s?.size_inch, 24) // from the bracket
  assertEquals(s?.chip, "Apple M4")
  assertEquals(s?.ram_gb, 16)
  assertEquals(s?.ssd_gb, 256)
  assertEquals(s?.color_ja, "ブルー")
  assertEquals(s?.color_en, "Blue")
})

Deno.test("mac: iMac Intel 5K, no color, Fusion Drive", () => {
  const s = mac("iMac Retina 5K MRQY2J/A Early 2019 【Core i5(3.0GHz)/27inch/16GB/1TB Fusion Drive】")
  assertEquals(s?.model_name, "iMac")
  assertEquals(s?.imac_variant, "5K")
  assertEquals(s?.size_inch, 27)
  assertEquals(s?.chip, "Core i5")
  assertEquals(s?.ram_gb, 16)
  assertEquals(s?.ssd_gb, 1024) // 1TB
  assertEquals(s?.storage_type, "Fusion Drive")
  assertEquals(s?.color_ja, null)
})

Deno.test("mac: iMac 4K, 21.5inch, HDD, Mid2020 no-space period", () => {
  const s = mac("iMac Retina 4K MRT32J/A Late 2019【Core i3(3.6GHz)/21.5inch/8GB/1TB HDD】")
  assertEquals(s?.model_name, "iMac")
  assertEquals(s?.size_inch, 21.5)
  assertEquals(s?.ssd_gb, 1024)
  assertEquals(s?.storage_type, "HDD")
})

Deno.test("mac: desktop page extraction", () => {
  const html = Deno.readTextFileSync(
    new URL("./__fixtures__/iosys-deskmac-p1.html", import.meta.url),
  )
  const skus = parseMacListingPage(html)
  assertEquals(skus.length > 3, true)
  // the deskpc/mac page mixes MacBooks + desktops; confirm desktop Macs are parsed (mini + iMac)
  assertEquals(skus.some((s) => s.model_name === "Mac mini"), true)
  assertEquals(skus.some((s) => s.model_name === "iMac"), true)
  assertEquals(skus.every((s) => /\/A$/.test(s.part_number)), true)
})
