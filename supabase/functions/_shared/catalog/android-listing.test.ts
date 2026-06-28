import { assertEquals } from "https://deno.land/std/assert/mod.ts"
import {
  AQUOS_CONFIG,
  extractAndroidCardTitles,
  GALAXY_CONFIG,
  parseAndroidListingPage,
  parseAndroidListingTitle,
  OPPO_CONFIG,
  PIXEL_CONFIG,
  XIAOMI_CONFIG,
  XPERIA_CONFIG,
} from "./android-listing.ts"

const galaxy = (t: string) => parseAndroidListingTitle(t, GALAXY_CONFIG)
const xperia = (t: string) => parseAndroidListingTitle(t, XPERIA_CONFIG)
const aquos = (t: string) => parseAndroidListingTitle(t, AQUOS_CONFIG)
const pixel = (t: string) => parseAndroidListingTitle(t, PIXEL_CONFIG)
const xiaomi = (t: string) => parseAndroidListingTitle(t, XIAOMI_CONFIG)
const oppo = (t: string) => parseAndroidListingTitle(t, OPPO_CONFIG)

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

// ---------------------------------------------------------------------------
// Sony Xperia
// ---------------------------------------------------------------------------

Deno.test("xperia: simfree XQ code, 1TB ROM, JA color, Xperia1->Xperia 1", () => {
  const s = xperia("Xperia1 VIII XQ-GE44 ネイティブゴールド【RAM16GB/ROM1TB 国内版SIMフリー】")
  assertEquals(s?.brand, "Sony")
  assertEquals(s?.model_name, "Xperia 1 VIII") // space inserted
  assertEquals(s?.model_number, "XQ-GE44")
  assertEquals(s?.storage_gb, 1024) // 1TB
  assertEquals(s?.ram_gb, 16)
  assertEquals(s?.color_ja, "ネイティブゴールド")
  assertEquals(s?.color_en, "Native Gold")
  assertEquals(s?.carrier, "SIM-Free") // 国内版
  assertEquals(s?.is_unlocked, true)
})

Deno.test("xperia: SONY prefix + 5G + Dual-SIM stripped", () => {
  const s = xperia("SONY Xperia1 V 5G Dual-SIM XQ-DQ44 カーキグリーン【RAM16GB/ROM512GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "Xperia 1 V")
  assertEquals(s?.model_number, "XQ-DQ44")
  assertEquals(s?.storage_gb, 512)
  assertEquals(s?.ram_gb, 16)
  assertEquals(s?.color_en, "Khaki Green")
})

Deno.test("xperia: ASCII color -> color_en, no storage", () => {
  const s = xperia("Xperia5 III XQ-BQ42 Black【国内版SIMフリー】")
  assertEquals(s?.model_name, "Xperia 5 III")
  assertEquals(s?.color_en, "Black")
  assertEquals(s?.color_ja, null)
  assertEquals(s?.storage_gb, null)
  assertEquals(s?.carrier, "SIM-Free")
})

Deno.test("xperia: docomo SO code", () => {
  const s = xperia("Xperia10 V SO-52D ホワイト【docomo版 SIMフリー】")
  assertEquals(s?.model_name, "Xperia 10 V")
  assertEquals(s?.model_number, "SO-52D")
  assertEquals(s?.carrier, "docomo")
  assertEquals(s?.color_en, "White")
})

Deno.test("xperia: Fun Edition kept in name", () => {
  const s = xperia("Xperia10 V Fun Edition SO-52D ミストグレー【docomo版 SIMフリー】")
  assertEquals(s?.model_name, "Xperia 10 V Fun Edition")
  assertEquals(s?.color_ja, "ミストグレー")
  assertEquals(s?.color_en, null) // unverified color left null, never guessed
})

Deno.test("xperia: docomo ahamo sub-brand prefix + SO-51Aa lowercase suffix", () => {
  const s = xperia("【SIMロック解除済】docomo ahamo Xperia1 II SO-51Aa Purple")
  assertEquals(s?.model_name, "Xperia 1 II")
  assertEquals(s?.model_number, "SO-51Aa") // lowercase 'a' preserved
  assertEquals(s?.carrier, "docomo")
  assertEquals(s?.is_unlocked, true)
  assertEquals(s?.color_en, "Purple")
})

Deno.test("xperia: au SOG code", () => {
  const s = xperia("Xperia Ace III SOG08 グレー【au版SIMフリー】")
  assertEquals(s?.model_name, "Xperia Ace III")
  assertEquals(s?.model_number, "SOG08")
  assertEquals(s?.carrier, "au")
  assertEquals(s?.color_en, "Grey")
})

Deno.test("xperia: SoftBank A-prefixed code, JA color", () => {
  const s = xperia("Xperia5 IV A204SO エクリュホワイト【SoftBank版SIMフリー】")
  assertEquals(s?.model_name, "Xperia 5 IV")
  assertEquals(s?.model_number, "A204SO")
  assertEquals(s?.carrier, "SoftBank")
  assertEquals(s?.color_en, "Ecru White")
})

Deno.test("xperia: SoftBank no-A code + carrier word + Sony prefix + multiword ASCII color", () => {
  const s = xperia("【SIMロック解除済】SoftBank Sony Xperia XZ2 702SO Liquid Black")
  assertEquals(s?.model_name, "Xperia XZ2")
  assertEquals(s?.model_number, "702SO")
  assertEquals(s?.carrier, "SoftBank")
  assertEquals(s?.color_en, "Liquid Black")
  assertEquals(s?.is_unlocked, true)
})

Deno.test("xperia: au SOV + XZ2 Premium (double space) ASCII color", () => {
  const s = xperia("【SIMロック解除済】au Sony Xperia XZ2 Premium SOV38  Chrome Black")
  assertEquals(s?.model_name, "Xperia XZ2 Premium")
  assertEquals(s?.model_number, "SOV38")
  assertEquals(s?.carrier, "au")
  assertEquals(s?.color_en, "Chrome Black")
})

Deno.test("xperia: Pro I normalized, Frosted Black ASCII", () => {
  const s = xperia("Sony Xperia Pro I 5G Dual-SIM XQ-BE42 Frosted Black【RAM12GB/ROM512GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "Xperia Pro I")
  assertEquals(s?.model_number, "XQ-BE42")
  assertEquals(s?.storage_gb, 512)
  assertEquals(s?.color_en, "Frosted Black")
})

Deno.test("xperia: old global J-code, Xperia8 Lite", () => {
  const s = xperia("Sony Xperia8 Lite J3273 Black【国内版  SIMフリー】")
  assertEquals(s?.model_name, "Xperia 8 Lite")
  assertEquals(s?.model_number, "J3273")
  assertEquals(s?.color_en, "Black")
  assertEquals(s?.carrier, "SIM-Free")
})

Deno.test("xperia: SoftBank first-gen Xperia1 802SO", () => {
  const s = xperia("【SIMロック解除済】SoftBank Xperia1 802SO ホワイト")
  assertEquals(s?.model_name, "Xperia 1")
  assertEquals(s?.model_number, "802SO")
  assertEquals(s?.carrier, "SoftBank")
  assertEquals(s?.color_en, "White")
})

Deno.test("xperia: AceII no-space normalized to Ace II", () => {
  const s = xperia("Xperia AceII SO-41B ホワイト【docomo版 SIMフリー】")
  assertEquals(s?.model_name, "Xperia Ace II")
  assertEquals(s?.model_number, "SO-41B")
})

Deno.test("xperia: rakuten 版", () => {
  const s = xperia("Xperia10 V XQ-DC44 セージグリーン【楽天版 SIMフリー】")
  assertEquals(s?.model_name, "Xperia 10 V")
  assertEquals(s?.carrier, "Rakuten")
  assertEquals(s?.color_en, "Sage Green")
})

Deno.test("xperia: non-Xperia / no code -> null", () => {
  assertEquals(xperia("Xperiaスペック比較"), null) // banner, no code
  assertEquals(xperia("Galaxy S24 SM-S921Q ブラック"), null) // not Xperia
})

Deno.test("xperia: page extraction pulls only coded SKU cards", () => {
  const html = Deno.readTextFileSync(
    new URL("./__fixtures__/iosys-xperia-p1.html", import.meta.url),
  )
  const titles = extractAndroidCardTitles(html, XPERIA_CONFIG)
  assertEquals(titles.length > 5, true)
  const skus = parseAndroidListingPage(html, XPERIA_CONFIG)
  assertEquals(skus.length > 5, true)
  assertEquals(skus.every((s) => s.brand === "Sony" && /^Xperia/.test(s.model_name)), true)
  assertEquals(skus.every((s) => s.model_number != null), true)
  const keys = new Set(skus.map((s) => `${s.model_name}|${s.storage_gb}|${s.color_en ?? s.color_ja}|${s.carrier}`))
  assertEquals(keys.size, skus.length)
})

// ---------------------------------------------------------------------------
// Sharp AQUOS
// ---------------------------------------------------------------------------

Deno.test("aquos: simfree SH-M code, labelled RAM/ROM, JA color", () => {
  const s = aquos("AQUOS R10 SH-M31 カシミヤホワイト【RAM12GB/ROM256GB 国内版SIMフリー】")
  assertEquals(s?.brand, "Sharp")
  assertEquals(s?.model_name, "AQUOS R10")
  assertEquals(s?.model_number, "SH-M31")
  assertEquals(s?.storage_gb, 256)
  assertEquals(s?.ram_gb, 12)
  assertEquals(s?.color_ja, "カシミヤホワイト")
  assertEquals(s?.color_en, "Cashmere White")
  assertEquals(s?.carrier, "SIM-Free") // 国内版
  assertEquals(s?.is_unlocked, true)
})

Deno.test("aquos: SH-M code, no storage in title", () => {
  const s = aquos("AQUOS R9 SH-M28 ホワイト【国内版SIMフリー】")
  assertEquals(s?.model_name, "AQUOS R9")
  assertEquals(s?.model_number, "SH-M28")
  assertEquals(s?.storage_gb, null)
  assertEquals(s?.color_en, "White")
  assertEquals(s?.carrier, "SIM-Free")
})

Deno.test("aquos: bare {ram}GB/{rom}GB bracket (no labels)", () => {
  const s = aquos("AQUOS sense9 SH-M29 ホワイト【6GB/128GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "AQUOS sense9")
  assertEquals(s?.storage_gb, 128) // larger bare GB = storage
  assertEquals(s?.ram_gb, 6) // smaller bare GB = RAM
  assertEquals(s?.color_en, "White")
})

Deno.test("aquos: Rakuten SH-RM code wins over SH-M, ASCII color", () => {
  const s = aquos("AQUOS sense3 lite SH-RM12 Light Copper【楽天版 SIMフリー】")
  assertEquals(s?.model_name, "AQUOS sense3 lite")
  assertEquals(s?.model_number, "SH-RM12") // not mis-split as SH-M
  assertEquals(s?.color_en, "Light Copper")
  assertEquals(s?.color_ja, null)
  assertEquals(s?.carrier, "Rakuten")
})

Deno.test("aquos: sense5G integral 5G NOT stripped from name", () => {
  const s = aquos("AQUOS sense5G SHG03 ライトカッパー【au版 SIMフリー】")
  assertEquals(s?.model_name, "AQUOS sense5G") // 5G preserved (no word boundary before 5)
  assertEquals(s?.color_en, "Light Copper")
  assertEquals(s?.carrier, "au")
})

Deno.test("aquos: au SHG code, JA color, spaced bracket", () => {
  const s = aquos("AQUOS sense6 SHG05 シルバー 【au版 SIMフリー】")
  assertEquals(s?.model_name, "AQUOS sense6")
  assertEquals(s?.model_number, "SHG05")
  assertEquals(s?.color_en, "Silver")
  assertEquals(s?.carrier, "au")
})

Deno.test("aquos: au SHV code + かんたん variant + carrier-word prefix + leading unlock", () => {
  const s = aquos("【SIMロック解除済】au AQUOS sense2 かんたん SHV43 Bright Silver")
  assertEquals(s?.model_name, "AQUOS sense2 かんたん") // sub-variant kept
  assertEquals(s?.model_number, "SHV43")
  assertEquals(s?.carrier, "au") // prefix word
  assertEquals(s?.is_unlocked, true)
  assertEquals(s?.color_en, "Bright Silver")
})

Deno.test("aquos: サウンド variant kept in name", () => {
  const s = aquos("【SIMロック解除済】au AQUOS sense3 plus サウンド SHV46 クラッシィブルー")
  assertEquals(s?.model_name, "AQUOS sense3 plus サウンド")
  assertEquals(s?.model_number, "SHV46")
  assertEquals(s?.color_ja, "クラッシィブルー")
  assertEquals(s?.color_en, null) // unverified EN, never guessed
})

Deno.test("aquos: SoftBank A###SH code", () => {
  const s = aquos("AQUOS sense7 plus A208SH ディープカッパー【SoftBank版 SIMフリー】")
  assertEquals(s?.model_name, "AQUOS sense7 plus")
  assertEquals(s?.model_number, "A208SH")
  assertEquals(s?.color_en, "Deep Copper")
  assertEquals(s?.carrier, "SoftBank")
})

Deno.test("aquos: 法人モデル corporate marker stripped from color", () => {
  const s = aquos("AQUOS wish3 A303SH ブラック 法人モデル【SoftBank版 SIMフリー】")
  assertEquals(s?.model_name, "AQUOS wish3")
  assertEquals(s?.model_number, "A303SH")
  assertEquals(s?.color_ja, "ブラック") // 法人モデル stripped
  assertEquals(s?.color_en, "Black")
  assertEquals(s?.carrier, "SoftBank")
})

Deno.test("aquos: 法人モデル as its own trailing bracket after carrier bracket", () => {
  const s = aquos("AQUOS wish3 A303SH ブラック【SoftBank版 SIMフリー】【法人モデル】")
  assertEquals(s?.model_name, "AQUOS wish3")
  assertEquals(s?.model_number, "A303SH")
  assertEquals(s?.color_ja, "ブラック") // trailing 【法人モデル】 discarded, carrier bracket read
  assertEquals(s?.color_en, "Black")
  assertEquals(s?.carrier, "SoftBank")
})

Deno.test("aquos: docomo SH-##L code, leading network-restriction bracket", () => {
  const s = aquos("【ネットワーク利用制限－】AQUOS sense7 SH-53C ライトカッパー【docomo版 SIMフリー】")
  assertEquals(s?.model_name, "AQUOS sense7")
  assertEquals(s?.model_number, "SH-53C")
  assertEquals(s?.color_en, "Light Copper")
  assertEquals(s?.carrier, "docomo")
})

Deno.test("aquos: docomo SH-02M, ASCII color, carrier-word + unlock", () => {
  const s = aquos("【SIMロック解除済】docomo AQUOS sense3 SH-02M Black")
  assertEquals(s?.model_name, "AQUOS sense3")
  assertEquals(s?.model_number, "SH-02M")
  assertEquals(s?.color_en, "Black")
  assertEquals(s?.carrier, "docomo")
  assertEquals(s?.is_unlocked, true)
})

Deno.test("aquos: MVNO 版 (J:COM) maps to no carrier-word, slash-RAM bracket", () => {
  const s = aquos("AQUOS wish SH-M20 Olive Green【RAM4GB/ROM64GB/国内版 SIMフリー】")
  assertEquals(s?.model_name, "AQUOS wish")
  assertEquals(s?.storage_gb, 64)
  assertEquals(s?.ram_gb, 4)
  assertEquals(s?.color_en, "Olive Green")
  assertEquals(s?.carrier, "SIM-Free") // 国内版
})

Deno.test("aquos: non-AQUOS / no code -> null", () => {
  assertEquals(aquos("AQUOS"), null) // nav thumb, no code
  assertEquals(aquos("Galaxy S24 SM-S921Q ブラック"), null) // not AQUOS
})

Deno.test("aquos: page extraction pulls only coded SKU cards", () => {
  const html = Deno.readTextFileSync(
    new URL("./__fixtures__/iosys-aquos-p1.html", import.meta.url),
  )
  const titles = extractAndroidCardTitles(html, AQUOS_CONFIG)
  assertEquals(titles.length > 5, true)
  const skus = parseAndroidListingPage(html, AQUOS_CONFIG)
  assertEquals(skus.length > 5, true)
  assertEquals(skus.every((s) => s.brand === "Sharp" && /^AQUOS/.test(s.model_name)), true)
  assertEquals(skus.every((s) => s.model_number != null), true)
  const keys = new Set(skus.map((s) => `${s.model_name}|${s.storage_gb}|${s.color_en ?? s.color_ja}|${s.carrier}`))
  assertEquals(keys.size, skus.length)
})

// ---------------------------------------------------------------------------
// Google Pixel
// ---------------------------------------------------------------------------

Deno.test("pixel: Google prefix, G-code, inline storage, ASCII color, Pixel10->Pixel 10", () => {
  const s = pixel("Google Pixel10 GL066 128GB Indigo【国内版SIMフリー】")
  assertEquals(s?.brand, "Google")
  assertEquals(s?.model_name, "Pixel 10") // space inserted
  assertEquals(s?.model_number, "GL066")
  assertEquals(s?.storage_gb, 128) // inline
  assertEquals(s?.color_en, "Indigo")
  assertEquals(s?.color_ja, null)
  assertEquals(s?.carrier, "SIM-Free") // 国内版
})

Deno.test("pixel: Pro XL multi-word suffix kept, 512GB", () => {
  const s = pixel("Google Pixel10 Pro XL GYPW4 512GB Obsidian【国内版SIMフリー】")
  assertEquals(s?.model_name, "Pixel 10 Pro XL")
  assertEquals(s?.model_number, "GYPW4")
  assertEquals(s?.storage_gb, 512)
  assertEquals(s?.color_en, "Obsidian")
})

Deno.test("pixel: Pro Fold suffix kept", () => {
  const s = pixel("Google Pixel9 Pro Fold GC15S 256GB Porcelain【国内版SIMフリー】")
  assertEquals(s?.model_name, "Pixel 9 Pro Fold")
  assertEquals(s?.model_number, "GC15S")
  assertEquals(s?.storage_gb, 256)
  assertEquals(s?.color_en, "Porcelain")
})

Deno.test("pixel: 'a' suffix variant (Pixel7a)", () => {
  const s = pixel("Google Pixel7a G82U8 128GB Coral【国内版SIMフリー】")
  assertEquals(s?.model_name, "Pixel 7a")
  assertEquals(s?.model_number, "G82U8")
  assertEquals(s?.color_en, "Coral")
})

Deno.test("pixel: 5G is a model distinguisher, NOT stripped (4a 5G ≠ 4a)", () => {
  const s = pixel("Google Pixel4a 5G G025H 128GB Just Black【国内版SIMフリー】")
  assertEquals(s?.model_name, "Pixel 4a 5G") // 5G preserved
  assertEquals(s?.color_en, "Just Black")
})

Deno.test("pixel: SoftBank carrier-word + leading unlock + inline storage", () => {
  const s = pixel("【SIMロック解除済】Softbank Google Pixel4 G020N 64GB Clearly White")
  assertEquals(s?.model_name, "Pixel 4")
  assertEquals(s?.model_number, "G020N")
  assertEquals(s?.storage_gb, 64)
  assertEquals(s?.color_en, "Clearly White")
  assertEquals(s?.carrier, "SoftBank")
  assertEquals(s?.is_unlocked, true)
})

Deno.test("pixel: 'G'+4 code never matches 'Google' or a storage token", () => {
  // "Google" is lowercase after the G; "128GB" has no boundary before G and only 1 char after.
  const s = pixel("Google Pixel8 GZPFO 128GB Obsidian【国内版SIMフリー】")
  assertEquals(s?.model_number, "GZPFO")
  assertEquals(s?.model_name, "Pixel 8")
  assertEquals(s?.storage_gb, 128)
})

Deno.test("pixel: 10a current model parses (GV0BP)", () => {
  const s = pixel("Google Pixel10a GV0BP 128GB Lavender【docomo版SIMフリー】")
  assertEquals(s?.model_name, "Pixel 10a")
  assertEquals(s?.model_number, "GV0BP")
  assertEquals(s?.storage_gb, 128)
  assertEquals(s?.color_en, "Lavender")
  assertEquals(s?.carrier, "docomo")
})

Deno.test("pixel: Pixel 3-era ASCII [Color Storage] bracket before carrier bracket", () => {
  const s = pixel("Google Pixel3 XL G013D [Just Black 64GB]【国内版SIMフリー】")
  assertEquals(s?.model_name, "Pixel 3 XL")
  assertEquals(s?.model_number, "G013D")
  assertEquals(s?.storage_gb, 64) // unwrapped from the [...] group
  assertEquals(s?.color_en, "Just Black")
  assertEquals(s?.carrier, "SIM-Free")
})

Deno.test("pixel: Pixel 3-era mixed 【Color Storage] bracket (no carrier bracket)", () => {
  const s = pixel("【SIMロック解除済】SoftBank Google Pixel3a XL G020D【Purple-ish 64GB]")
  assertEquals(s?.model_name, "Pixel 3a XL")
  assertEquals(s?.model_number, "G020D")
  assertEquals(s?.storage_gb, 64)
  assertEquals(s?.color_en, "Purple-ish")
  assertEquals(s?.carrier, "SoftBank")
  assertEquals(s?.is_unlocked, true)
})

Deno.test("pixel: non-Pixel / no code -> null", () => {
  assertEquals(pixel("Pixel"), null) // nav thumb, no code
  assertEquals(pixel("Galaxy S24 SM-S921Q ブラック"), null) // not Pixel
})

Deno.test("pixel: page extraction pulls only coded SKU cards", () => {
  const html = Deno.readTextFileSync(
    new URL("./__fixtures__/iosys-pixel-p1.html", import.meta.url),
  )
  const titles = extractAndroidCardTitles(html, PIXEL_CONFIG)
  assertEquals(titles.length > 5, true)
  const skus = parseAndroidListingPage(html, PIXEL_CONFIG)
  assertEquals(skus.length > 5, true)
  assertEquals(skus.every((s) => s.brand === "Google" && /^Pixel/.test(s.model_name)), true)
  assertEquals(skus.every((s) => s.model_number != null), true)
  const keys = new Set(skus.map((s) => `${s.model_name}|${s.storage_gb}|${s.color_en ?? s.color_ja}|${s.carrier}`))
  assertEquals(keys.size, skus.length)
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

// ---------------------------------------------------------------------------
// Xiaomi (Xiaomi flagship / Redmi / POCO / Mi) — code-less SIM-free + coded carrier
// ---------------------------------------------------------------------------

Deno.test("xiaomi: code-less Redmi simfree, RAM/ROM bracket, JA color", () => {
  const s = xiaomi("Redmi 14C スターリーブルー【RAM4GB/ROM128GB 国内版SIMフリー】")
  assertEquals(s?.brand, "Xiaomi")
  assertEquals(s?.model_name, "Redmi 14C")
  assertEquals(s?.model_number, null) // SIM-free: no code
  assertEquals(s?.storage_gb, 128)
  assertEquals(s?.ram_gb, 4)
  assertEquals(s?.color_ja, "スターリーブルー")
  assertEquals(s?.color_en, "Starry Blue")
  assertEquals(s?.carrier, "SIM-Free")
})

Deno.test("xiaomi: flagship line keeps 'Xiaomi' in model name", () => {
  const s = xiaomi("Xiaomi 15T Pro グレー【RAM12GB/ROM512GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "Xiaomi 15T Pro")
  assertEquals(s?.storage_gb, 512)
  assertEquals(s?.ram_gb, 12)
  assertEquals(s?.color_en, "Gray")
})

Deno.test("xiaomi: no-space flagship Xiaomi11T -> 'Xiaomi 11T', 5G stripped, ASCII color", () => {
  const s = xiaomi("Xiaomi11T Pro 5G Celestial Blue【RAM8GB/ROM128GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "Xiaomi 11T Pro")
  assertEquals(s?.storage_gb, 128)
  assertEquals(s?.color_en, "Celestial Blue")
  assertEquals(s?.color_ja, null)
})

Deno.test("xiaomi: Xiaomi POCO -> drop Xiaomi prefix, keep POCO", () => {
  const s = xiaomi("Xiaomi POCO F7 Ultra イエロー【RAM16GB/ROM512GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "POCO F7 Ultra")
  assertEquals(s?.storage_gb, 512)
  assertEquals(s?.ram_gb, 16)
  assertEquals(s?.color_ja, "イエロー")
  assertEquals(s?.color_en, "Yellow")
})

Deno.test("xiaomi: POCO Pro Max double tier", () => {
  const s = xiaomi("Xiaomi POCO X8 Pro Max ブラック【RAM12GB/ROM512GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "POCO X8 Pro Max")
  assertEquals(s?.color_en, "Black")
})

Deno.test("xiaomi: POCO + 5G + Dual-SIM + bare RAM/ROM + ASCII color", () => {
  const s = xiaomi("Xiaomi POCO F6 Pro 5G Dual-SIM White【12GB/256GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "POCO F6 Pro") // 5G + Dual-SIM stripped
  assertEquals(s?.storage_gb, 256) // larger of bare pair
  assertEquals(s?.ram_gb, 12)
  assertEquals(s?.color_en, "White")
})

Deno.test("xiaomi: Xiaomi Redmi Note11 -> 'Redmi Note 11', space-bracket RAM/ROM", () => {
  const s = xiaomi("Xiaomi Redmi Note11 Graphite Gray【4GB/64GB 国内版SIM FREE】")
  assertEquals(s?.model_name, "Redmi Note 11")
  assertEquals(s?.storage_gb, 64)
  assertEquals(s?.color_en, "Graphite Gray")
  assertEquals(s?.carrier, "SIM-Free")
})

Deno.test("xiaomi: Xiaomi Mi11 -> 'Mi 11 Lite', 5G stripped", () => {
  const s = xiaomi("Xiaomi Mi11 Lite 5G Mint Green【RAM6GB/ROM128GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "Mi 11 Lite")
  assertEquals(s?.color_en, "Mint Green")
})

Deno.test("xiaomi: Redmi12C glued number -> 'Redmi 12C'", () => {
  const s = xiaomi("Xiaomi Redmi12C グラファイトグレー【RAM4GB ROM128GB 国内版 SIMフリー】")
  assertEquals(s?.model_name, "Redmi 12C")
  assertEquals(s?.storage_gb, 128)
  assertEquals(s?.color_en, "Graphite Gray")
})

Deno.test("xiaomi: Photography Kit bundle stripped from color", () => {
  const s = xiaomi("Xiaomi14 Ultra ブラック + Photography Kit【RAM16GB/ROM512GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "Xiaomi 14 Ultra")
  assertEquals(s?.color_ja, "ブラック")
  assertEquals(s?.color_en, "Black")
  assertEquals(s?.storage_gb, 512)
})

Deno.test("xiaomi: Note13 Pro+ keeps the + tier", () => {
  const s = xiaomi("Redmi Note13 Pro+ 5G Aurora Purple【12GB/512GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "Redmi Note 13 Pro+")
  assertEquals(s?.storage_gb, 512)
  assertEquals(s?.color_en, "Aurora Purple")
})

Deno.test("xiaomi: au XIG code variant", () => {
  const s = xiaomi("Xiaomi 13T XIG04 ブラック【au版SIMフリー】")
  assertEquals(s?.model_name, "Xiaomi 13T")
  assertEquals(s?.model_number, "XIG04")
  assertEquals(s?.storage_gb, null) // no storage in bracket
  assertEquals(s?.color_en, "Black")
  assertEquals(s?.carrier, "au")
})

Deno.test("xiaomi: SoftBank A###XM code, REDMI casing -> Redmi, 5G stripped", () => {
  const s = xiaomi("REDMI15 5G A501XM チタングレー【RAM4GB/ROM128GB SoftBank版SIMフリー】")
  assertEquals(s?.model_name, "Redmi 15")
  assertEquals(s?.model_number, "A501XM")
  assertEquals(s?.storage_gb, 128)
  assertEquals(s?.color_en, "Titan Gray")
  assertEquals(s?.carrier, "SoftBank")
})

Deno.test("xiaomi: Redmi Note10 JE keeps JE, au code", () => {
  const s = xiaomi("Redmi Note10 JE XIG02 クロームシルバー【au版 SIMフリー】")
  assertEquals(s?.model_name, "Redmi Note 10 JE")
  assertEquals(s?.model_number, "XIG02")
  assertEquals(s?.carrier, "au")
})

Deno.test("xiaomi: leading unlock bracket + carrier word + Mi10 code", () => {
  const s = xiaomi("【SIMロック解除済】au Xiaomi Mi10 Lite 5G XIG01 ドリームホワイト")
  assertEquals(s?.model_name, "Mi 10 Lite")
  assertEquals(s?.model_number, "XIG01")
  assertEquals(s?.carrier, "au")
  assertEquals(s?.is_unlocked, true)
})

Deno.test("xiaomi: POCO F4 GT 8-digit global code path", () => {
  const s = xiaomi("XIAOMI POCO F4 GT 5G Dual-SIM 21121210G Cyber Yellow【8GB/128GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "POCO F4 GT")
  assertEquals(s?.model_number, "21121210G")
  assertEquals(s?.storage_gb, 128)
  assertEquals(s?.color_en, "Cyber Yellow")
})

Deno.test("xiaomi: nav thumbnail / non-Xiaomi -> null", () => {
  assertEquals(xiaomi("Redmi 12シリーズ の画像"), null) // nav thumb (no bracket)
  assertEquals(xiaomi("Galaxy S24 SM-S921Q ブラック"), null) // not Xiaomi
})

Deno.test("xiaomi: page extraction pulls code-less + coded SKU cards", () => {
  const html = Deno.readTextFileSync(
    new URL("./__fixtures__/iosys-xiaomi-p1.html", import.meta.url),
  )
  const titles = extractAndroidCardTitles(html, XIAOMI_CONFIG)
  assertEquals(titles.length > 10, true)
  // nav thumbnails must be excluded
  assertEquals(titles.every((t) => !/シリーズ|の画像/.test(t)), true)
  const skus = parseAndroidListingPage(html, XIAOMI_CONFIG)
  assertEquals(skus.length > 10, true)
  assertEquals(skus.every((s) => s.brand === "Xiaomi"), true)
  assertEquals(skus.every((s) => s.color_en != null || s.color_ja != null), true)
  // dedupe key uniqueness within a page
  const keys = new Set(
    skus.map((s) => `${s.model_name}|${s.storage_gb}|${s.color_en ?? s.color_ja}|${s.carrier}`),
  )
  assertEquals(keys.size, skus.length)
})

// ---------------------------------------------------------------------------
// OPPO (A-series / Reno / Find / older R / Reno A) — coded brand, JP grammar quirks
// ---------------------------------------------------------------------------

Deno.test("oppo: CPH code, simfree JA color", () => {
  const s = oppo("OPPO A77 CPH2385 ブラック【国内版 SIMフリー】")
  assertEquals(s?.brand, "OPPO")
  assertEquals(s?.model_name, "A77")
  assertEquals(s?.model_number, "CPH2385")
  assertEquals(s?.color_ja, "ブラック")
  assertEquals(s?.color_en, "Black")
  assertEquals(s?.carrier, "SIM-Free")
})

Deno.test("oppo: au OPG code, 5G kept as distinguisher", () => {
  const s = oppo("OPPO A5 5G OPG06 グリーン【au版 SIMフリー】")
  assertEquals(s?.model_name, "A5 5G") // 5G NOT stripped (A5 5G ≠ A5 2020)
  assertEquals(s?.model_number, "OPG06")
  assertEquals(s?.color_en, "Green")
  assertEquals(s?.carrier, "au")
})

Deno.test("oppo: A5 2020 keeps the year suffix", () => {
  const s = oppo("OPPO A5 2020 CPH1943 Green【国内版 SIMフリー】")
  assertEquals(s?.model_name, "A5 2020")
  assertEquals(s?.model_number, "CPH1943")
  assertEquals(s?.color_en, "Green")
})

Deno.test("oppo: A###OP SoftBank code, Reno10 Pro 5G", () => {
  const s = oppo("OPPO Reno10 Pro 5G A302OP シルバーグレー【SoftBank版SIMフリー】")
  assertEquals(s?.model_name, "Reno10 Pro 5G")
  assertEquals(s?.model_number, "A302OP")
  assertEquals(s?.carrier, "SoftBank")
  assertEquals(s?.color_ja, "シルバーグレー")
  assertEquals(s?.color_en, "Silver Gray") // Reno10 Pro verified color
})

Deno.test("oppo: storage in NAME segment before the code (Reno3 A)", () => {
  const s = oppo("Oppo Reno3 A 6GB 128GB CPH2013 White【国内版 SIMフリー】")
  assertEquals(s?.model_name, "Reno3 A")
  assertEquals(s?.model_number, "CPH2013")
  assertEquals(s?.storage_gb, 128) // from the name segment
  assertEquals(s?.ram_gb, 6)
  assertEquals(s?.color_en, "White")
  assertEquals(s?.carrier, "SIM-Free")
})

Deno.test("oppo: storage in trailing bracket (Reno A)", () => {
  const s = oppo("Oppo Reno A CPH1983 Black【6GB 64GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "Reno A")
  assertEquals(s?.storage_gb, 64)
  assertEquals(s?.ram_gb, 6)
  assertEquals(s?.color_en, "Black")
})

Deno.test("oppo: 付属 accessory-bundle suffix stripped from color (Find N6)", () => {
  const s = oppo("OPPO Find N6 5G Dual-SIM CPH2765 ブロッサムオレンジ OPPO AI Pen Kit付属 【RAM16GB/ROM512GB 国内版SIMフリー】")
  assertEquals(s?.model_name, "Find N6 5G") // Dual-SIM stripped, 5G kept
  assertEquals(s?.storage_gb, 512)
  assertEquals(s?.ram_gb, 16)
  assertEquals(s?.color_ja, "ブロッサムオレンジ") // bundle "OPPO AI Pen Kit付属" removed
  assertEquals(s?.color_en, "Blossom Orange") // Find N6 verified color
})

Deno.test("oppo: ASCII [..] bracket with color+storage inside (R17 Pro)", () => {
  const s = oppo("Oppo R17 Pro Dual-SIM CPH1877 [エメラルドグリーン 6GB 128GB 国内版　SIMフリー]")
  assertEquals(s?.model_name, "R17 Pro")
  assertEquals(s?.storage_gb, 128)
  assertEquals(s?.ram_gb, 6)
  assertEquals(s?.color_ja, "エメラルドグリーン")
  assertEquals(s?.carrier, "SIM-Free")
})

Deno.test("oppo: code-less old model via nameConsumeRe (AX7)", () => {
  const s = oppo("OPPO AX7 ブルー【国内版SIMフリー】")
  assertEquals(s?.model_name, "AX7")
  assertEquals(s?.model_number, null)
  assertEquals(s?.color_en, "Blue")
  assertEquals(s?.carrier, "SIM-Free")
})

Deno.test("oppo: leading unlock bracket + carrier word + Find X3 Pro, ASCII color", () => {
  const s = oppo("【SIMロック解除済】au Oppo Find X3 Pro 5G OPG03 Gloss Black")
  assertEquals(s?.model_name, "Find X3 Pro 5G")
  assertEquals(s?.model_number, "OPG03")
  assertEquals(s?.carrier, "au")
  assertEquals(s?.is_unlocked, true)
  assertEquals(s?.color_en, "Gloss Black")
})

Deno.test("oppo: Reno5 A Rakuten, Ice Blue verified color", () => {
  const s = oppo("OPPO Reno5 A CPH2199 アイスブルー【楽天版 SIMフリー】")
  assertEquals(s?.model_name, "Reno5 A")
  assertEquals(s?.carrier, "Rakuten")
  assertEquals(s?.color_en, "Ice Blue")
})

Deno.test("oppo: nav thumbnail / non-OPPO -> null", () => {
  assertEquals(oppo("OPPO reno A画像"), null) // nav thumb (no bracket)
  assertEquals(oppo("Galaxy S24 SM-S921Q ブラック"), null) // not OPPO
})

Deno.test("oppo: page extraction pulls coded + code-less SKU cards", () => {
  const html = Deno.readTextFileSync(
    new URL("./__fixtures__/iosys-oppo-p1.html", import.meta.url),
  )
  const titles = extractAndroidCardTitles(html, OPPO_CONFIG)
  assertEquals(titles.length > 5, true)
  assertEquals(titles.every((t) => !/シリーズ|の画像/.test(t)), true)
  const skus = parseAndroidListingPage(html, OPPO_CONFIG)
  assertEquals(skus.length > 5, true)
  assertEquals(skus.every((s) => s.brand === "OPPO"), true)
  assertEquals(skus.every((s) => s.color_en != null || s.color_ja != null), true)
  const keys = new Set(
    skus.map((s) => `${s.model_name}|${s.storage_gb}|${s.color_en ?? s.color_ja}|${s.carrier}`),
  )
  assertEquals(keys.size, skus.length)
})
