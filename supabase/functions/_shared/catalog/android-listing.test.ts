import { assertEquals } from "https://deno.land/std/assert/mod.ts"
import {
  extractAndroidCardTitles,
  GALAXY_CONFIG,
  parseAndroidListingPage,
  parseAndroidListingTitle,
} from "./android-listing.ts"

const galaxy = (t: string) => parseAndroidListingTitle(t, GALAXY_CONFIG)

Deno.test("galaxy: SM-..Q simfree, ROM in bracket, JA color", () => {
  const s = galaxy("Galaxy A57 5G SM-A576Q オーサムネイビー 【RAM8GB/ROM128GB/国内版 SIMフリー】")
  assertEquals(s?.brand, "Samsung")
  assertEquals(s?.model_name, "Galaxy A57") // "5G" stripped
  assertEquals(s?.model_number, "SM-A576Q")
  assertEquals(s?.storage_gb, 128) // from ROM
  assertEquals(s?.ram_gb, 8)
  assertEquals(s?.color_ja, "オーサムネイビー")
  assertEquals(s?.color_en, "Awesome Navy")
  assertEquals(s?.carrier, "SIM-Free") // 国内版
  assertEquals(s?.is_unlocked, true)
})

Deno.test("galaxy: Samsung prefix + Single-SIM token stripped", () => {
  const s = galaxy("Samsung Galaxy S24 Ultra 5G Single-SIM SM-S928Q チタニウムグレー【RAM12GB/ROM256GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "Galaxy S24 Ultra")
  assertEquals(s?.model_number, "SM-S928Q")
  assertEquals(s?.storage_gb, 256)
  assertEquals(s?.ram_gb, 12)
  assertEquals(s?.color_ja, "チタニウムグレー")
  assertEquals(s?.carrier, "SIM-Free")
})

Deno.test("galaxy: inline storage between code and color (au)", () => {
  const s = galaxy("Galaxy S23 Ultra SC-52D 256GB クリーム【docomo版 SIMフリー】")
  assertEquals(s?.model_name, "Galaxy S23 Ultra")
  assertEquals(s?.model_number, "SC-52D")
  assertEquals(s?.storage_gb, 256) // inline
  assertEquals(s?.color_ja, "クリーム")
  assertEquals(s?.carrier, "docomo")
  assertEquals(s?.is_unlocked, true)
})

Deno.test("galaxy: SCG code, no storage, English-absent JA color, au版", () => {
  const s = galaxy("Galaxy A53 5G SCG15 オーサムブラック【au版 SIMフリー】")
  assertEquals(s?.model_name, "Galaxy A53")
  assertEquals(s?.model_number, "SCG15")
  assertEquals(s?.storage_gb, null) // not present anywhere
  assertEquals(s?.color_en, "Awesome Black")
  assertEquals(s?.carrier, "au")
})

Deno.test("galaxy: leading condition bracket + carrier-word prefix, no trailing bracket", () => {
  const s = galaxy("【SIMロック解除済】au Galaxy S21 5G SCG09 ファントムグレー")
  assertEquals(s?.model_name, "Galaxy S21")
  assertEquals(s?.model_number, "SCG09")
  assertEquals(s?.carrier, "au") // prefix word
  assertEquals(s?.is_unlocked, true) // leading bracket
  assertEquals(s?.color_ja, "ファントムグレー")
})

Deno.test("galaxy: English color word (ascii) -> color_en, color_ja null", () => {
  const s = galaxy("【SIMロック解除済】docomo Galaxy A41 SC-41A White")
  assertEquals(s?.model_name, "Galaxy A41")
  assertEquals(s?.model_number, "SC-41A")
  assertEquals(s?.color_en, "White")
  assertEquals(s?.color_ja, null)
  assertEquals(s?.carrier, "docomo")
})

Deno.test("galaxy: multi-word English color preserved", () => {
  const s = galaxy("【ネットワーク利用制限－】docomo Galaxy A52 5G SC-53B Awesome Black")
  assertEquals(s?.model_name, "Galaxy A52")
  assertEquals(s?.color_en, "Awesome Black")
  assertEquals(s?.carrier, "docomo")
})

Deno.test("galaxy: 楽天版 -> Rakuten", () => {
  const s = galaxy("Samsung Galaxy A7 SM-A750C Gold 【楽天版 SIMフリー】")
  assertEquals(s?.model_name, "Galaxy A7")
  assertEquals(s?.carrier, "Rakuten")
  assertEquals(s?.color_en, "Gold")
})

Deno.test("galaxy: code with /DS dual-sim suffix + inline storage", () => {
  const s = galaxy("Galaxy S26 Ultra SM-S948Q/DS 256GB コバルトバイオレット【国内版 SIMフリー】")
  assertEquals(s?.model_name, "Galaxy S26 Ultra")
  assertEquals(s?.model_number, "SM-S948Q") // /DS stripped
  assertEquals(s?.storage_gb, 256)
  assertEquals(s?.color_ja, "コバルトバイオレット")
  assertEquals(s?.color_en, "Cobalt Violet")
  assertEquals(s?.carrier, "SIM-Free")
})

Deno.test("galaxy: trailing full-SKU code after color is dropped", () => {
  const s = galaxy("Galaxy A20 SCV46 ブラック SCV46SKV【J:COM版 SIMフリー】")
  assertEquals(s?.model_name, "Galaxy A20")
  assertEquals(s?.model_number, "SCV46")
  assertEquals(s?.color_ja, "ブラック") // trailing "SCV46SKV" stripped
  assertEquals(s?.color_en, "Black")
})

Deno.test("galaxy: 1TB storage", () => {
  const s = galaxy("Galaxy S26 Ultra SM-S948Q/DS 1TB スカイブルー【国内版 SIMフリー】")
  assertEquals(s?.storage_gb, 1024)
})

Deno.test("galaxy: everything inside bracket (RAM ROM color carrier)", () => {
  const s = galaxy("Samsung Galaxy S10 Single-SIM SM-G973C【8GB 128GB Prism White 楽天版SIMフリー】")
  assertEquals(s?.model_name, "Galaxy S10")
  assertEquals(s?.model_number, "SM-G973C")
  assertEquals(s?.storage_gb, 128) // larger bracketed GB = storage
  assertEquals(s?.ram_gb, 8) // smaller bracketed GB = RAM
  assertEquals(s?.color_en, "Prism White")
  assertEquals(s?.carrier, "Rakuten")
})

Deno.test("galaxy: non-Galaxy / no code -> null", () => {
  assertEquals(galaxy("Galaxy S26の画像"), null) // nav thumbnail, no code
  assertEquals(galaxy("iPhone 15 A3089 ブラック"), null) // not Galaxy
})

Deno.test("galaxy: page extraction pulls only coded SKU cards", () => {
  const html = Deno.readTextFileSync(
    new URL("./__fixtures__/iosys-galaxy-p1.html", import.meta.url),
  )
  const titles = extractAndroidCardTitles(html, GALAXY_CONFIG)
  // every extracted title must contain a Galaxy model code
  assertEquals(titles.every((t) => /(SM-[A-Z0-9]+|SCG\d+|SC-\d+[A-Z]|SCV\d+)/.test(t)), true)
  assertEquals(titles.length > 5, true)

  const skus = parseAndroidListingPage(html, GALAXY_CONFIG)
  assertEquals(skus.length > 5, true)
  // all parsed rows are Samsung Galaxy with a model_number
  assertEquals(skus.every((s) => s.brand === "Samsung" && /^Galaxy/.test(s.model_name)), true)
  assertEquals(skus.every((s) => s.model_number != null), true)
  // dedupe key uniqueness within a page
  const keys = new Set(skus.map((s) => `${s.model_name}|${s.storage_gb}|${s.color_en ?? s.color_ja}|${s.carrier}`))
  assertEquals(keys.size, skus.length)
})
