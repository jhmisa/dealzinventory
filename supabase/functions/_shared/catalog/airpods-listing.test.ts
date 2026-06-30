import { assertEquals } from "https://deno.land/std/assert/mod.ts"
import {
  extractAirPodsCardTitles,
  parseAirPodsListingPage,
  parseAirPodsListingTitle,
} from "./airpods-listing.ts"

const ap = (t: string) => parseAirPodsListingTitle(t)

Deno.test("airpods: Pro 1st gen, part# identity, year from title", () => {
  const s = ap("AirPods Pro MLWK3J/A【2021】")
  assertEquals(s?.model_name, "AirPods Pro")
  assertEquals(s?.part_number, "MLWK3J/A")
  assertEquals(s?.year, 2021)
  assertEquals(s?.color_en, "White")
  assertEquals(s?.region_code, "J")
  assertEquals(s?.is_domestic, true)
})

Deno.test("airpods: Pro no year marker", () => {
  const s = ap("AirPods Pro MWP22J/A")
  assertEquals(s?.model_name, "AirPods Pro")
  assertEquals(s?.part_number, "MWP22J/A")
  assertEquals(s?.year, null)
})

Deno.test("airpods: Pro2 glued -> 'AirPods Pro 2', 2023 USB-C (distinguished by part#+year)", () => {
  const s = ap("AirPods Pro2 MTJV3J/A【2023】")
  assertEquals(s?.model_name, "AirPods Pro 2")
  assertEquals(s?.part_number, "MTJV3J/A")
  assertEquals(s?.year, 2023)
})

Deno.test("airpods: Pro2 Americas region code", () => {
  const s = ap("AirPods Pro2 MQD83AM/A")
  assertEquals(s?.model_name, "AirPods Pro 2")
  assertEquals(s?.part_number, "MQD83AM/A")
  assertEquals(s?.region_code, "AM")
  assertEquals(s?.is_domestic, false)
})

Deno.test("airpods: Pro3", () => {
  const s = ap("AirPods Pro3 MFHP4J/A")
  assertEquals(s?.model_name, "AirPods Pro 3")
  assertEquals(s?.part_number, "MFHP4J/A")
})

Deno.test("airpods: box-damaged leading bracket dropped", () => {
  const s = ap("【箱傷み】AirPods Pro3 MFHP4J/A")
  assertEquals(s?.model_name, "AirPods Pro 3")
  assertEquals(s?.part_number, "MFHP4J/A")
})

Deno.test("airpods: AirPods4 glued, year '年モデル'", () => {
  const s = ap("AirPods4 MXP63J/A【2024年モデル】")
  assertEquals(s?.model_name, "AirPods 4")
  assertEquals(s?.part_number, "MXP63J/A")
  assertEquals(s?.year, 2024)
})

Deno.test("airpods: AirPods4 ANC variant distinguished", () => {
  const s = ap("AirPods4 アクティブノイズキャンセリング搭載 MXP93J/A【2024年モデル】")
  assertEquals(s?.model_name, "AirPods 4 (ANC)")
  assertEquals(s?.part_number, "MXP93J/A")
  assertEquals(s?.year, 2024)
})

Deno.test("airpods: Max (USB-C) with color", () => {
  const s = ap("AirPods Max (USB-C) パープル MWW83ZA/A")
  assertEquals(s?.model_name, "AirPods Max (USB-C)")
  assertEquals(s?.color_ja, "パープル")
  assertEquals(s?.color_en, "Purple")
  assertEquals(s?.part_number, "MWW83ZA/A")
  assertEquals(s?.region_code, "ZA")
})

Deno.test("airpods: Max 2 (real H2 model) with color", () => {
  const s = ap("AirPods Max 2 オレンジ MHWN4ZA/A")
  assertEquals(s?.model_name, "AirPods Max 2")
  assertEquals(s?.color_en, "Orange")
  assertEquals(s?.part_number, "MHWN4ZA/A")
})

Deno.test("airpods: 2nd gen from 第2世代 (wired charging case)", () => {
  const s = ap("【第2世代】AirPods with Charging Case MV7N2J/A")
  assertEquals(s?.model_name, "AirPods (2nd gen)")
  assertEquals(s?.generation, 2)
  assertEquals(s?.part_number, "MV7N2J/A")
  assertEquals(s?.color_en, "White")
})

Deno.test("airpods: 2nd gen wireless charging case distinguished", () => {
  const s = ap("【第2世代】AirPods with Wireless Charging Case MRXJ2J/A")
  assertEquals(s?.model_name, "AirPods (2nd gen) (Wireless Charging Case)")
  assertEquals(s?.part_number, "MRXJ2J/A")
})

Deno.test("airpods: 3rd gen from 第3世代", () => {
  const s = ap("【第3世代】AirPods Lightning充電ケース付き MPNY3J/A")
  assertEquals(s?.model_name, "AirPods (3rd gen)")
  assertEquals(s?.generation, 3)
  assertEquals(s?.part_number, "MPNY3J/A")
})

Deno.test("airpods: non-AirPods / no part# / nav -> null", () => {
  assertEquals(ap("AirPods Pro はこちらから"), null) // nav (no part#)
  assertEquals(ap("Beats Studio Buds MJ4X3PA/A"), null) // not AirPods
  assertEquals(ap("AirPods 第3世代 はこちらから"), null) // nav, no part#
})

Deno.test("airpods: page extraction + dedupe by part#", () => {
  const html = Deno.readTextFileSync(
    new URL("./__fixtures__/iosys-airpods-p1.html", import.meta.url),
  )
  const titles = extractAirPodsCardTitles(html)
  assertEquals(titles.length > 5, true)
  const skus = parseAirPodsListingPage(html)
  assertEquals(skus.length > 5, true)
  // every sku has a part# and an EN color; identity is unique by part#
  assertEquals(skus.every((s) => /\/A$/.test(s.part_number)), true)
  assertEquals(skus.every((s) => s.color_en.length > 0), true)
  assertEquals(new Set(skus.map((s) => s.part_number)).size, skus.length)
  // both an earbud line and the Max line present
  assertEquals(skus.some((s) => /^AirPods Pro/.test(s.model_name)), true)
  assertEquals(skus.some((s) => /^AirPods Max/.test(s.model_name)), true)
})
