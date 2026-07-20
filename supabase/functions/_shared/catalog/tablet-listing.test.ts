import { assertEquals } from "https://deno.land/std/assert/mod.ts"
import {
  ARROWSTAB_CONFIG,
  DTAB_CONFIG,
  GALAXYTAB_CONFIG,
  HUAWEITAB_CONFIG,
  LENOVO_CONFIG,
  NEC_CONFIG,
  parseAndroidListingTitle,
  QUATAB_CONFIG,
  XIAOMIPAD_CONFIG,
  extractAndroidCardTitles,
  type AndroidBrandConfig,
} from "./android-listing.ts"

const p = (t: string, c: AndroidBrandConfig) => parseAndroidListingTitle(t, c)

// --- Samsung Galaxy Tab -----------------------------------------------------------------------

Deno.test("tab: Galaxy Tab S11, long SM code, RAM without GB unit", () => {
  const s = p("Galaxy Tab S11 SM-X730NZAAXJP グレー【RAM12/ROM128GB/Wi-Fiモデル】", GALAXYTAB_CONFIG)
  assertEquals(s?.brand, "Samsung")
  assertEquals(s?.model_name, "Galaxy Tab S11")
  assertEquals(s?.model_number, "SM-X730NZAAXJP")
  assertEquals(s?.storage_gb, 128)
  assertEquals(s?.color_ja, "グレー")
  assertEquals(s?.color_en, "Gray")
})

Deno.test("tab: Galaxy Tab S11 Ultra, 1TB ROM", () => {
  const s = p("Galaxy Tab S11 Ultra SM-X930NZAIXJP グレー【RAM16GB/ROM1TB/Wi-Fiモデル】", GALAXYTAB_CONFIG)
  assertEquals(s?.model_name, "Galaxy Tab S11 Ultra")
  assertEquals(s?.storage_gb, 1024)
  assertEquals(s?.ram_gb, 16)
})

Deno.test("tab: Samsung prefix + trailing Wi-Fi word stripped from name", () => {
  const s = p("Samsung Galaxy Tab S10 Ultra Wi-Fi SM-X920 ムーンストーングレー【RAM12GB/ROM512GB 国内版】", GALAXYTAB_CONFIG)
  assertEquals(s?.model_name, "Galaxy Tab S10 Ultra")
  assertEquals(s?.storage_gb, 512)
  assertEquals(s?.color_en, "Moonstone Gray")
  assertEquals(s?.carrier, "SIM-Free") // 国内版
})

Deno.test("tab: Galaxy Tab A11+ 5G keeps the 5G distinguisher", () => {
  const s = p("Samsung Galaxy Tab A11+ 5G SM-X238Q Gray【RAM6GB/ROM128GB/国内版 SIMフリー】", GALAXYTAB_CONFIG)
  assertEquals(s?.model_name, "Galaxy Tab A11+ 5G")
  assertEquals(s?.color_en, "Gray")
  assertEquals(s?.is_unlocked, true)
})

Deno.test("tab: Galaxy Tab S9+ keeps the plus", () => {
  const s = p("Samsung Galaxy Tab S9+ Wi-Fi SM-X810 Graphite【RAM12GB/ROM256GB 国内版】", GALAXYTAB_CONFIG)
  assertEquals(s?.model_name, "Galaxy Tab S9+")
  assertEquals(s?.color_en, "Graphite")
})

// --- Lenovo -----------------------------------------------------------------------------------

Deno.test("tab: Lenovo TAB M10 Gen3, Wi-Fiモデル in name stripped", () => {
  const s = p("Lenovo TAB M10 Gen3 Wi-Fiモデル ZAAE0009JP【RAM4GB/ROM64GB】", LENOVO_CONFIG)
  assertEquals(s?.brand, "Lenovo")
  assertEquals(s?.model_name, "Tab M10 Gen3")
  assertEquals(s?.model_number, "ZAAE0009JP")
  assertEquals(s?.storage_gb, 64)
  assertEquals(s?.ram_gb, 4)
})

Deno.test("tab: Lenovo TAB4 8 Plus — LTE in the TAIL becomes the LTE suffix, color clean", () => {
  const s = p("Lenovo TAB4 8 Plus ZA2F0141JP LTE Sparkling White【国内版SIMFREE】", LENOVO_CONFIG)
  assertEquals(s?.model_name, "Tab4 8 Plus LTE")
  assertEquals(s?.color_en, "Sparkling White")
  assertEquals(s?.is_unlocked, true)
})

Deno.test("tab: IdeaTab Pro (no Lenovo prefix)", () => {
  const s = p("IdeaTab Pro ZAE40096JP ルナグレー【RAM8GB/ROM256GB/国内版Wi-Fi】", LENOVO_CONFIG)
  assertEquals(s?.model_name, "IdeaTab Pro")
  assertEquals(s?.storage_gb, 256)
  assertEquals(s?.color_en, "Luna Grey")
})

Deno.test("tab: Legion Tab (8.8\", 3) canonicalizes to Gen 3, import TW code", () => {
  const s = p('Lenovo Legion Tab (8.8", 3) ZAEF0060TW Eclipse Black 【RAM12GB/ROM256GB/海外版 Wi-Fiモデル】', LENOVO_CONFIG)
  assertEquals(s?.model_name, "Legion Tab Gen 3")
  assertEquals(s?.model_number, "ZAEF0060TW")
  assertEquals(s?.color_en, "Eclipse Black")
})

// --- NEC LAVIE --------------------------------------------------------------------------------

Deno.test("tab: NEC LaVie Tab designation form, LAVIE casing normalized", () => {
  const s = p("NEC LaVie Tab T1275/LAS PC-T1275LAS クラウドグレー 【RAM12GB/ROM256GB/国内版 Wi-Fiモデル】", NEC_CONFIG)
  assertEquals(s?.brand, "NEC")
  assertEquals(s?.model_name, "LAVIE Tab T1275/LAS")
  assertEquals(s?.model_number, "PC-T1275LAS")
  assertEquals(s?.storage_gb, 256)
  assertEquals(s?.color_en, "Cloud Gray")
})

Deno.test("tab: LAVIE Tab EX (no NEC prefix)", () => {
  const s = p("LAVIE Tab EX TX117/LAS PC-TX117LAS シーシェル 【RAM12GB/ROM256GB/国内版 Wi-Fiモデル】", NEC_CONFIG)
  assertEquals(s?.model_name, "LAVIE Tab EX TX117/LAS")
  assertEquals(s?.color_en, "Seashell")
})

// --- Huawei MediaPad --------------------------------------------------------------------------

Deno.test("tab: MediaPad M5 — LTEモデル in name becomes LTE suffix, bare bracket storage", () => {
  const s = p("MediaPad M5 LTEモデル SHT-AL09 SpaceGray【4GB/32GB/国内版SIMFREE】", HUAWEITAB_CONFIG)
  assertEquals(s?.brand, "Huawei")
  assertEquals(s?.model_name, "MediaPad M5 LTE")
  assertEquals(s?.model_number, "SHT-AL09")
  assertEquals(s?.storage_gb, 32)
  assertEquals(s?.ram_gb, 4)
  assertEquals(s?.color_en, "SpaceGray")
})

Deno.test("tab: MediaPad M5 lite 8 — storage in the NAME before the code (32/64 variants distinct)", () => {
  const s32 = p("MediaPad M5 lite 8 LTEモデル 32GB JDN2-L09 SpaceGray【国内版 SIMフリー】", HUAWEITAB_CONFIG)
  const s64 = p("MediaPad M5 lite 8 LTEモデル 64GB JDN2-L09 SpaceGray【国内版 SIMフリー】", HUAWEITAB_CONFIG)
  assertEquals(s32?.model_name, "MediaPad M5 lite 8 LTE")
  assertEquals(s32?.storage_gb, 32)
  assertEquals(s64?.storage_gb, 64)
  assertEquals(s32?.model_number, "JDN2-L09") // digit-in-prefix code shape
})

Deno.test("tab: MediaPad T3 8, JP color", () => {
  const s = p("MediaPad T3 8 LTEモデル KOB-L09 スペースグレイ【国内版SIMフリー】", HUAWEITAB_CONFIG)
  assertEquals(s?.model_name, "MediaPad T3 8 LTE")
  assertEquals(s?.color_en, "Space Gray")
})

// --- docomo dtab (code kept IN the name; brand resolved to maker at harvest) ------------------

Deno.test("tab: dtab Compact d-52C — code-in-name via nameConsumeRe", () => {
  const s = p("dtab Compact d-52C ストームグレー【docomo版 SIMフリー】", DTAB_CONFIG)
  assertEquals(s?.model_name, "dtab Compact d-52C")
  assertEquals(s?.model_number, null)
  assertEquals(s?.color_en, "Storm Gray")
  assertEquals(s?.carrier, "docomo")
  assertEquals(s?.is_unlocked, true)
})

Deno.test("tab: dtab d-51F with leading network-restriction bracket", () => {
  const s = p("【ネットワーク利用制限▲】dtab d-51F サンダーグレー【docomo版 SIMフリー】", DTAB_CONFIG)
  assertEquals(s?.model_name, "dtab d-51F")
  assertEquals(s?.color_en, "Thunder Gray")
})

Deno.test("tab: dtab d-41A — leading unlock, docomo word, NO trailing bracket", () => {
  const s = p("【SIMロック解除済】docomo dtab d-41A ホワイト", DTAB_CONFIG)
  assertEquals(s?.model_name, "dtab d-41A")
  assertEquals(s?.color_en, "White")
  assertEquals(s?.carrier, "docomo")
  assertEquals(s?.is_unlocked, true)
})

// --- arrows Tab / Qua tab carrier one-offs ----------------------------------------------------

Deno.test("tab: arrows Tab F-02K — code kept in name, no bracket, leading unlock", () => {
  const s = p("【SIMロック解除済】docomo arrows Tab F-02K Black", ARROWSTAB_CONFIG)
  assertEquals(s?.brand, "Fujitsu")
  assertEquals(s?.model_name, "arrows Tab F-02K")
  assertEquals(s?.color_en, "Black")
  assertEquals(s?.carrier, "docomo")
})

Deno.test("tab: arrows Tab F-02K with double leading brackets", () => {
  const s = p("【SIMロック解除済】【ネットワーク利用制限－】docomo arrows Tab F-02K Black", ARROWSTAB_CONFIG)
  assertEquals(s?.model_name, "arrows Tab F-02K")
})

Deno.test("tab: au Qua tab QZ8 KYT32, multi-word ASCII color", () => {
  const s = p("【箱傷み】【SIMロック解除済】au Qua tab QZ8 KYT32 Mocha Black", QUATAB_CONFIG)
  assertEquals(s?.brand, "Kyocera")
  assertEquals(s?.model_name, "Qua tab QZ8")
  assertEquals(s?.model_number, "KYT32")
  assertEquals(s?.color_en, "Mocha Black")
  assertEquals(s?.carrier, "au")
})

// --- Xiaomi / Redmi pads (fully code-less) ----------------------------------------------------

Deno.test("tab: Xiaomi Pad mini — code-less, bare RAM/ROM bracket", () => {
  const s = p("Xiaomi Pad mini グレー【8GB/256GB/国内版 Wi-Fi】", XIAOMIPAD_CONFIG)
  assertEquals(s?.brand, "Xiaomi")
  assertEquals(s?.model_name, "Xiaomi Pad mini")
  assertEquals(s?.model_number, null)
  assertEquals(s?.storage_gb, 256)
  assertEquals(s?.ram_gb, 8)
  assertEquals(s?.color_en, "Gray")
})

Deno.test("tab: Redmi Pad2 Pro — glued number spaced", () => {
  const s = p("Redmi Pad2 Pro グラファイトグレー【RAM6GB/ROM128GB 国内版SIMフリー】", XIAOMIPAD_CONFIG)
  assertEquals(s?.model_name, "Redmi Pad 2 Pro")
  assertEquals(s?.storage_gb, 128)
  assertEquals(s?.color_en, "Graphite Gray")
})

// --- exclusions: import/niche brands must not parse under ANY tablet config -------------------

const TABLET_CONFIGS = [
  GALAXYTAB_CONFIG,
  LENOVO_CONFIG,
  NEC_CONFIG,
  HUAWEITAB_CONFIG,
  DTAB_CONFIG,
  ARROWSTAB_CONFIG,
  QUATAB_CONFIG,
  XIAOMIPAD_CONFIG,
]

Deno.test("tab: excluded brands (imports/niche) parse under no config", () => {
  const excluded = [
    "ALLDOCUBE iPlay70 Max Pro 5G【RAM8GB/ROM128GB SIMフリー】",
    "BOOX Palma2 Pro ホワイト【RAM8GB/ROM128GB/海外版 SIMフリー】",
    "Bigme Hibreak Color Black【RAM6GB/ROM128GB/海外版 SIMフリー】",
    "Blackview Active12 Pro Black【RAM12GB/ROM256GB/国内版SIMフリー】",
    "DOOGEE T30 Pro SpaceGrey【国内版SIMフリー】",
    "TCL Note A1 NXTPAPER 9566X 【RAM8GB/ROM256GB/国内版 Wi-Fiモデル】",
    "IRIS OHYAMA LUCA Tablet TM08E2W74-AZ1B ブラック 【RAM4GB/ROM128GB/国内版 Wi-Fiモデル】",
    "aiwa tab AS11L JA4-TBA1101 ブラック【RAM4/ROM64GB/国内版SIMフリー】",
    "Wacom MovinkPad 11 DTHA116CL0Z Silver【RAM8/ROM128GB/国内版 Wi-Fiモデル】",
    "XPPen Magic Drawing Pad 2024 9494G_JP【RAM8GB/256GB/Wi-Fi】",
    "TOUGHPAD FZ-N1CDCAAZJ ハンドヘルド【バーコードリーダ搭載携帯電話】",
    "【2026年最新】MacBook比較!新型の「Neo」か「中古のハイスペック機」か？",
  ]
  for (const t of excluded) {
    for (const c of TABLET_CONFIGS) {
      assertEquals(p(t, c), null, `"${t}" parsed under ${c.brand}`)
    }
  }
})

// --- fixture pages: extraction picks only in-scope cards --------------------------------------

const pages = await Promise.all(
  [1, 2, 3, 4, 5].map((n) =>
    Deno.readTextFile(new URL(`./__fixtures__/iosys-tablet-android-p${n}.html`, import.meta.url))
  ),
)

Deno.test("tab: fixture pages parse to in-scope SKUs only", () => {
  const seen = new Map<string, string>()
  const colorless: string[] = []
  for (const html of pages) {
    for (const c of TABLET_CONFIGS) {
      for (const t of extractAndroidCardTitles(html, c)) {
        const s = parseAndroidListingTitle(t, c)
        if (!s) continue
        seen.set(`${c.brand}|${s.model_name}|${s.storage_gb}|${s.color_en ?? s.color_ja}`, s.raw_title)
        if ((s.color_en ?? s.color_ja) == null) colorless.push(`${s.model_name} ${s.model_number ?? ""}`)
      }
    }
  }
  // Colorless parses are allowed ONLY for code-carrying cards (the verified code→color reference
  // in tablet-specs enriches them at harvest; unenrichable ones are skipped by the fill-gaps).
  for (const c of colorless) {
    assertEquals(/ (ZA|PC-T|SM-)/.test(` ${c.split(" ").pop()}`) || /(ZA|PC-T)[A-Z0-9]+/.test(c), true, `colorless code-less card: ${c}`)
  }
  // The mainstream set must all be present.
  const names = [...seen.keys()].join("\n")
  for (const expect of ["Galaxy Tab S11", "Tab M10 Gen3", "LAVIE Tab T1275/LAS", "MediaPad M5 lite 8 LTE", "dtab Compact d-52C", "arrows Tab F-02K", "Qua tab QZ8", "Xiaomi Pad mini", "Redmi Pad 2 Pro", "Tab B11 LTE", "Tab M8 LTE", "MediaPad M5 lite|64"]) {
    assertEquals(names.includes(expect.split("|")[0]), true, `missing ${expect} in:\n${names}`)
  }
})
