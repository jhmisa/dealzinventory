import { assertEquals } from "https://deno.land/std/assert/mod.ts"
import {
  extractSurfaceCardTitles,
  parseSurfaceListingPage,
  parseSurfaceListingTitle,
} from "./surface-listing.ts"

const sf = (t: string) => parseSurfaceListingTitle(t)

// --- colorless Go card (the Joey repro: B000047's "No matching product model") ---------------

Deno.test("surface: colorless Go2, eMMC, no space before bracket", () => {
  const s = sf("Surface Go2 STV-00012【Pentium(1.7GHz)/4GB/64GB eMMC/Win11Home】")
  assertEquals(s?.model_name, "Surface Go 2")
  assertEquals(s?.part_number, "STV-00012")
  assertEquals(s?.chip, "Pentium")
  assertEquals(s?.cpu_ghz, 1.7)
  assertEquals(s?.ram_gb, 4)
  assertEquals(s?.storage_gb, 64)
  assertEquals(s?.storage_type, "eMMC")
  assertEquals(s?.os, "Windows 11 Home")
  assertEquals(s?.lte, false)
  assertEquals(s?.color_ja, null)
  assertEquals(s?.color_en, null) // enriched from the part#-color ref at row build, never guessed
})

Deno.test("surface: Go2 business SKU, Win11Pro", () => {
  const s = sf("Surface Go2 STZ-00012【Pentium(1.7GHz)/4GB/64GB eMMC/Win11Pro】")
  assertEquals(s?.part_number, "STZ-00012")
  assertEquals(s?.os, "Windows 11 Pro")
})

Deno.test("surface: Go2 Core m3", () => {
  const s = sf("Surface Go2 RRX-00012【Core m3(1.1GHz)/4GB/64GB eMMC/Win11Pro】")
  assertEquals(s?.chip, "Core m3")
  assertEquals(s?.cpu_ghz, 1.1)
})

// --- LTE Advanced variant word before the part# ----------------------------------------------

Deno.test("surface: Go2 LTE Advanced, colorless, SSD", () => {
  const s = sf("Surface Go2 LTE Advanced TFZ-00011【Core m3(1.1GHz)/8GB/128GB SSD/Win11Home】")
  assertEquals(s?.model_name, "Surface Go 2")
  assertEquals(s?.lte, true)
  assertEquals(s?.part_number, "TFZ-00011")
  assertEquals(s?.ram_gb, 8)
  assertEquals(s?.storage_gb, 128)
  assertEquals(s?.storage_type, "SSD")
})

Deno.test("surface: Pro7+ LTE Advanced with color", () => {
  const s = sf("Surface Pro7+ LTE Advanced 1S3-00013 プラチナ【Core i5(2.4GHz)/8GB/256GB SSD/Win11Pro】")
  assertEquals(s?.model_name, "Surface Pro 7+")
  assertEquals(s?.lte, true)
  assertEquals(s?.part_number, "1S3-00013")
  assertEquals(s?.color_ja, "プラチナ")
  assertEquals(s?.color_en, "Platinum")
})

// --- color variants ---------------------------------------------------------------------------

Deno.test("surface: Go3 with explicit Platinum color", () => {
  const s = sf("Surface Go3 8V6-00015 プラチナ【Pentium(1.1GHz)/4GB/64GB eMMC/Win11Pro】")
  assertEquals(s?.model_name, "Surface Go 3")
  assertEquals(s?.color_en, "Platinum")
})

Deno.test("surface: Pro7 Black", () => {
  const s = sf("Surface Pro7 VNX-00027 ブラック【Core i7(1.3GHz)/16GB/256GB SSD/Win11Home】")
  assertEquals(s?.model_name, "Surface Pro 7")
  assertEquals(s?.color_ja, "ブラック")
  assertEquals(s?.color_en, "Black")
  assertEquals(s?.chip, "Core i7")
  assertEquals(s?.ram_gb, 16)
  assertEquals(s?.storage_gb, 256)
})

// --- leading condition bracket + 1TB storage --------------------------------------------------

Deno.test("surface: leading 【電源アダプタ欠品】 bracket is peeled", () => {
  const s = sf("【電源アダプタ欠品】Surface Pro8 8PX-00010 プラチナ【Core i7(3.0GHz)/16GB/512GB SSD/Win11Pro】")
  assertEquals(s?.model_name, "Surface Pro 8")
  assertEquals(s?.part_number, "8PX-00010")
  assertEquals(s?.storage_gb, 512)
  assertEquals(s?.color_en, "Platinum")
})

Deno.test("surface: 1TB storage converts to 1024 GB", () => {
  const s = sf("Surface Pro8 8PQ-00010 プラチナ【Core i5(2.4GHz)/8GB/1TB SSD/Win11Home】")
  assertEquals(s?.storage_gb, 1024)
  assertEquals(s?.storage_type, "SSD")
})

// --- name canonicalization (already-spaced and Laptop/Book lines) -----------------------------

Deno.test("surface: already-spaced Pro 11 name unchanged", () => {
  const s = sf("Surface Pro 11 ZAB-00011 プラチナ【Snapdragon X Plus/16GB/256GB SSD/Win11Home】")
  assertEquals(s?.model_name, "Surface Pro 11")
  assertEquals(s?.chip, "Snapdragon X Plus")
  assertEquals(s?.cpu_ghz, null)
})

Deno.test("surface: Pro X keeps its letter suffix", () => {
  const s = sf("Surface Pro X MNY-00011 ブラック【SQ1(3.0GHz)/8GB/256GB SSD/Win11Home】")
  assertEquals(s?.model_name, "Surface Pro X")
})

Deno.test("surface: Book3 spaced", () => {
  const s = sf("Surface Book3 SKW-00018 プラチナ【Core i5(1.2GHz)/8GB/256GB SSD/Win11Pro】")
  assertEquals(s?.model_name, "Surface Book 3")
})

Deno.test("surface: Laptop Go2 canonicalizes", () => {
  const s = sf("Surface Laptop Go2 8QC-00032 プラチナ【Core i5(1.0GHz)/8GB/128GB SSD/Win11Home】")
  assertEquals(s?.model_name, "Surface Laptop Go 2")
})

Deno.test("surface: optional leading MICROSOFT maker word tolerated", () => {
  const s = sf("MICROSOFT Surface Go2 STV-00012【Pentium(1.7GHz)/4GB/64GB eMMC/Win11Home】")
  assertEquals(s?.model_name, "Surface Go 2")
  assertEquals(s?.part_number, "STV-00012")
})

// --- non-card titles are rejected -------------------------------------------------------------

Deno.test("surface: nav thumbnails and campaign banners are rejected", () => {
  assertEquals(sf("Surface Go2 "), null) // nav link — no part#, no bracket
  assertEquals(sf("Surface周辺機器"), null)
  assertEquals(sf("Surface買い替えキャンペーン"), null)
  assertEquals(sf("Macbook"), null)
})

// --- fixture: full listing page ---------------------------------------------------------------

const p1 = await Deno.readTextFile(new URL("./__fixtures__/iosys-surface-p1.html", import.meta.url))
const p2 = await Deno.readTextFile(new URL("./__fixtures__/iosys-surface-p2.html", import.meta.url))

Deno.test("surface: extractSurfaceCardTitles finds only real cards on page 1", () => {
  const titles = extractSurfaceCardTitles(p1)
  assertEquals(titles.length > 0, true)
  for (const t of titles) {
    assertEquals(/[A-Z0-9]{3}-\d{5}/.test(t), true, `no part# in: ${t}`)
    assertEquals(/【[^】]+\/Win\d+/.test(t), true, `no config bracket in: ${t}`)
  }
})

Deno.test("surface: page 1+2 parse to deduped part#-keyed SKUs, all with model+config", () => {
  const skus = [...parseSurfaceListingPage(p1), ...parseSurfaceListingPage(p2)]
  const byPart = new Map(skus.map((s) => [s.part_number, s]))
  assertEquals(byPart.size >= 15, true, `only ${byPart.size} unique part#s`)
  for (const s of byPart.values()) {
    assertEquals(s.model_name.startsWith("Surface"), true, s.raw_title)
    assertEquals(s.ram_gb != null, true, `no RAM: ${s.raw_title}`)
    assertEquals(s.storage_gb != null, true, `no storage: ${s.raw_title}`)
    assertEquals(/^Windows \d+/.test(s.os ?? ""), true, `bad OS: ${s.raw_title}`)
  }
  // The repro SKU parses exactly.
  const repro = byPart.get("STV-00012")
  assertEquals(repro?.model_name, "Surface Go 2")
})
