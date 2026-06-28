// Generic parser for iosys Android *listing* pages, driven by a per-brand config.
//
// The research (docs/investigations/android-identifier-conventions.md) confirmed every
// Android brand shares ONE iosys title grammar:
//   [Brand] ModelName ModelCode Color(JP|EN) 【RAM../ROM../版(carrier)】
// where the model CODE (Samsung SM-..Q / SCG.. / SC-..; Sony XQ-/SO-/SOG; etc.) behaves like
// Apple's coarse A-number: it identifies model + carrier/region but NEVER encodes color, and
// only opaquely (if at all) encodes storage. So we treat the code as a coarse attribute and
// key catalog identity on (brand, model_name, storage, color) — color/storage parsed from text.
//
// One generic engine handles the universal grammar; a small AndroidBrandConfig supplies the
// brand keywords, the model-code regex, and the model-name canonicalizer. New brands = new config.

export type Carrier = "SIM-Free" | "docomo" | "au" | "SoftBank" | "Rakuten"

export interface AndroidListingSku {
  brand: string
  model_name: string // canonical, e.g. "Galaxy S24 Ultra" (5G / Single-SIM stripped)
  model_number: string | null // coarse code, e.g. "SM-S928Q" / "SCG14" / "SC-52D"
  storage_gb: number | null // from inline {n}GB or 【ROM{n}GB】; null when absent (not guessed)
  ram_gb: number | null // from 【RAM{n}GB】; coarse attribute
  color_ja: string | null
  color_en: string | null
  carrier: Carrier | null
  is_unlocked: boolean | null
  is_domestic: boolean | null
  region_note: string | null // trailing 【...】 text
  raw_title: string
}

export interface AndroidBrandConfig {
  brand: string // canonical brand stored on product_models, e.g. "Samsung"
  brandPrefixes: string[] // marketing prefixes to peel before the model name, e.g. ["Samsung"]
  modelNameRe: RegExp // the name segment must match this to be a valid device, e.g. /^galaxy\b/i
  modelCodeRe: RegExp // finds + extracts the model code (splits name | tail). Must be /g-free.
  canonicalModelName: (seg: string) => string // clean the name segment
  colorJaToEn: (ja: string | null) => string | null
}

const LEADING_BRACKET = /^【([^】]*)】\s*/
const CARRIER_WORD = /^(docomo|au|softbank|rakuten)\s+/i
const TRAILING_BRACKET = /【([^】]*)】\s*$/
const INLINE_STORAGE = /^(\d+)\s*(GB|TB)\b/i
const ROM_RE = /ROM\s*(\d+)\s*(GB|TB)/i
const RAM_RE = /RAM\s*(\d+)\s*GB/i
const NOTE_CARRIER = /(docomo|au|softbank|rakuten)版/i
const ASCII_ONLY = /^[\x00-\x7F]+$/

const CARRIER_MAP: Record<string, Carrier> = {
  docomo: "docomo",
  au: "au",
  softbank: "SoftBank",
  rakuten: "Rakuten",
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
}

function toStorageGb(num: string, unit: string): number | null {
  const n = parseFloat(num)
  if (!Number.isFinite(n)) return null
  return unit.toUpperCase() === "TB" ? Math.round(n * 1024) : Math.round(n)
}

/** Recover a color from inside a 【...】 note by stripping all structural tokens. */
function colorFromNote(note: string): string {
  return note
    .replace(/RAM\s*\d+\s*GB/gi, " ")
    .replace(/ROM\s*\d+\s*GB/gi, " ")
    .replace(/\d+\s*(GB|TB)/gi, " ")
    .replace(/(docomo|au|softbank|rakuten)版/gi, " ")
    .replace(/楽天版|国内版|海外版/g, " ")
    .replace(/SIMロック解除済|SIM解除済?|SIMフリー|SIM\s?FREE/gi, " ")
    .replace(/[\/、,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Parse one Android listing-card title into a SKU, or null if it doesn't match the brand shape.
 * `pathCarrier` is the carrier of the crawled URL section — a fallback only when the title
 * carries no carrier signal of its own.
 */
export function parseAndroidListingTitle(
  rawTitle: string,
  config: AndroidBrandConfig,
  pathCarrier?: Carrier | null,
): AndroidListingSku | null {
  if (!rawTitle) return null
  const raw = decodeEntities(rawTitle).replace(/[\s　]+/g, " ").trim()

  // 1. Peel leading 【...】 brackets (condition / lock / network-restriction). Normalize ASCII/mixed
  //    square brackets to 【】 first — Pixel 3-era titles wrap color+storage in "[Just Black 64GB]" or
  //    the mixed "【Purple-ish 64GB]"; treating them as 【...】 lets the note machinery handle them.
  let rest = raw.replace(/\[/g, "【").replace(/\]/g, "】")
  let leadingUnlock = false
  for (let m = rest.match(LEADING_BRACKET); m; m = rest.match(LEADING_BRACKET)) {
    if (/SIMロック解除済|SIMフリー/i.test(m[1])) leadingUnlock = true
    rest = rest.slice(m[0].length)
  }

  // 2. Optional carrier-word prefix (e.g. "au Galaxy ...").
  let prefixCarrier: Carrier | null = null
  const cw = rest.match(CARRIER_WORD)
  if (cw) {
    prefixCarrier = CARRIER_MAP[cw[1].toLowerCase()] ?? null
    rest = rest.slice(cw[0].length)
  }

  // 3. Optional brand marketing prefix (e.g. "Samsung ").
  for (const p of config.brandPrefixes) {
    const re = new RegExp(`^${p}\\s+`, "i")
    if (re.test(rest)) {
      rest = rest.replace(re, "")
      break
    }
  }

  // 4. Find the model code — it splits the model name from the color/storage tail.
  const codeM = rest.match(config.modelCodeRe)
  if (!codeM || codeM.index == null) return null
  const nameSeg = rest.slice(0, codeM.index).trim()
  const model_number = codeM[0]
  let tail = rest.slice(codeM.index + codeM[0].length).trim()
  // Drop a dual/single-SIM marker glued to the code, e.g. "SM-S948Q/DS 256GB ...".
  tail = tail.replace(/^\/(DS|SS)\b/i, "").trim()

  // 5. Validate the name segment actually names this brand's device.
  if (!config.modelNameRe.test(nameSeg)) return null
  const model_name = config.canonicalModelName(nameSeg)
  if (!model_name) return null

  // 6. Trailing 【...】 note (carrier / RAM / ROM / region). First discard any trailing pure-noise
  //    bracket like 【法人モデル】 (corporate-channel marker) that can follow the real note bracket,
  //    e.g. "...ブラック【SoftBank版 SIMフリー】【法人モデル】" — so the carrier bracket is read, not this.
  tail = tail.replace(/(?:\s*【\s*法人モデル\s*】\s*)+$/, "").trim()
  let region_note: string | null = null
  const tb = tail.match(TRAILING_BRACKET)
  if (tb) {
    region_note = tb[1].trim()
    tail = tail.slice(0, tb.index).trim()
  }

  // 7. Inline storage immediately after the code (e.g. "SC-52D 256GB クリーム").
  let storage_gb: number | null = null
  const inline = tail.match(INLINE_STORAGE)
  if (inline) {
    storage_gb = toStorageGb(inline[1], inline[2])
    tail = tail.slice(inline[0].length).trim()
  }

  // 8. Storage / RAM from the trailing note when not already inline. Note grammars seen:
  //    "RAM8GB/ROM128GB ..." (labelled) and "8GB 128GB Color 楽天版..." (bare: RAM then ROM).
  let ram_gb: number | null = null
  if (region_note) {
    const rom = region_note.match(ROM_RE)
    if (storage_gb == null && rom) storage_gb = toStorageGb(rom[1], rom[2])
    const ram = region_note.match(RAM_RE)
    if (ram) ram_gb = parseInt(ram[1], 10)
    if (storage_gb == null || ram_gb == null) {
      // Bare "{n}GB {m}GB" with no RAM/ROM labels: larger = storage, smaller = RAM.
      const noLabel = region_note.replace(/RAM\s*\d+\s*GB/gi, " ").replace(/ROM\s*\d+\s*GB/gi, " ")
      const bare = [...noLabel.matchAll(/(\d+)\s*(GB|TB)/gi)]
        .map((m) => toStorageGb(m[1], m[2]))
        .filter((n): n is number => n != null)
      if (bare.length) {
        if (storage_gb == null) storage_gb = Math.max(...bare)
        if (ram_gb == null && bare.length >= 2) ram_gb = Math.min(...bare)
      }
    }
  }

  // 8b. A leftover bracketed group still wrapping the tail (Pixel 3-era "[Just Black 64GB]【国内版…】"
  //     after square-bracket normalization, where the carrier bracket was already peeled in step 6)
  //     carries color+storage — unwrap it and treat like a note.
  const wrappedTail = tail.match(/^【\s*(.+?)\s*】$/)
  if (wrappedTail) {
    const inner = wrappedTail[1]
    if (storage_gb == null) {
      const bare = [...inner.matchAll(/(\d+)\s*(GB|TB)/gi)]
        .map((m) => toStorageGb(m[1], m[2]))
        .filter((n): n is number => n != null)
      if (bare.length) storage_gb = Math.max(...bare)
    }
    tail = colorFromNote(inner)
  }

  // 9. Color: prefer the text after the code; strip any trailing full-SKU / code-like token
  //    (ASCII alnum with a digit, e.g. "ブラック SCV46SKV") and the corporate-channel marketing
  //    marker 法人モデル (business SKU; brand-agnostic JP retail noise, e.g. "ブラック 法人モデル").
  //    Else recover the color from inside the note bracket (the "everything in bracket" 楽天版 grammar).
  let colorText = tail
    .replace(/\s*法人モデル\s*$/, "")
    .replace(/(\s+[A-Za-z][A-Za-z0-9/]*\d[A-Za-z0-9/]*)+$/, "")
    .trim()
  if (!colorText && region_note) colorText = colorFromNote(region_note)
  let color_ja: string | null = null
  let color_en: string | null = null
  if (colorText) {
    if (ASCII_ONLY.test(colorText)) {
      color_en = colorText
    } else {
      color_ja = colorText
      color_en = config.colorJaToEn(colorText)
    }
  }

  // 10. Carrier: prefix word > 版 bracket (latin or 楽天) > 国内版(domestic SIM-free) > path.
  const noteCarrier = region_note?.match(NOTE_CARRIER)
  const carrier: Carrier | null = prefixCarrier ??
    (noteCarrier ? CARRIER_MAP[noteCarrier[1].toLowerCase()] : null) ??
    (region_note && /楽天版/.test(region_note) ? "Rakuten" : null) ??
    (region_note && /国内版/.test(region_note) ? "SIM-Free" : null) ??
    pathCarrier ??
    null

  const is_unlocked = leadingUnlock || /SIMフリー|SIM解除|SIMロック解除/i.test(region_note ?? "")
    ? true
    : null
  const is_domestic = region_note == null
    ? null
    : /国内版/.test(region_note)
    ? true
    : /海外版/.test(region_note)
    ? false
    : null

  return {
    brand: config.brand,
    model_name,
    model_number,
    storage_gb,
    ram_gb,
    color_ja,
    color_en,
    carrier,
    is_unlocked,
    is_domestic,
    region_note,
    raw_title: raw,
  }
}

/** All Android SKU-card <img alt> titles on a page (those containing a model code). */
export function extractAndroidCardTitles(html: string, config: AndroidBrandConfig): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<img[^>]*\salt="([^"]*)"/g)) {
    const t = decodeEntities(m[1] ?? "").trim()
    // Cheap filter: only alts that carry a model code are SKU cards (nav thumbs are "…の画像").
    if (t && config.modelCodeRe.test(t)) out.push(t)
  }
  return out
}

/**
 * Parse a full Android listing page into deduped SKUs.
 * Dedupe key = (model_name, storage, color, carrier) — Android has no part_number; the same
 * physical SKU can appear multiple times on a page.
 */
export function parseAndroidListingPage(
  html: string,
  config: AndroidBrandConfig,
  pathCarrier?: Carrier | null,
): AndroidListingSku[] {
  const byKey = new Map<string, AndroidListingSku>()
  for (const title of extractAndroidCardTitles(html, config)) {
    const sku = parseAndroidListingTitle(title, config, pathCarrier)
    if (!sku) continue
    const key = `${sku.model_name}|${sku.storage_gb}|${sku.color_en ?? sku.color_ja}|${sku.carrier}`
    if (!byKey.has(key)) byKey.set(key, sku)
  }
  return [...byKey.values()]
}

// ---------------------------------------------------------------------------
// Samsung Galaxy config
// ---------------------------------------------------------------------------

// Seed color map (observed on iosys). Extended by the verified research pass; unmapped
// JA colors stay null (flagged, never guessed).
export const GALAXY_COLORS_JA_EN: Record<string, string> = {
  // "Awesome" line (A-series)
  "オーサムネイビー": "Awesome Navy",
  "オーサムブラック": "Awesome Black",
  "オーサムバイオレット": "Awesome Violet",
  "オーサムブルー": "Awesome Blue",
  "オーサムアイスブルー": "Awesome Iceblue",
  "オーサムホワイト": "Awesome White",
  "オーサムグラファイト": "Awesome Graphite",
  "オーサムライム": "Awesome Lime",
  "オーサムレモン": "Awesome Lemon",
  "オーサムライラック": "Awesome Lilac",
  // S24 series
  "コバルトバイオレット": "Cobalt Violet",
  "オニキスブラック": "Onyx Black",
  "マーブルグレー": "Marble Gray",
  "アンバーイエロー": "Amber Yellow",
  // Titanium (Ultra)
  "チタニウムグレー": "Titanium Gray",
  "チタニウムブラック": "Titanium Black",
  "チタニウムバイオレット": "Titanium Violet",
  "チタニウムイエロー": "Titanium Yellow",
  "チタニウムブルー": "Titanium Blue",
  // S22 / S23 accents
  "バーガンディ": "Burgundy",
  "ミント": "Mint",
  "クリーム": "Cream",
  "ラベンダー": "Lavender",
  "グリーン": "Green",
  // Z foldables
  "ボラパープル": "Bora Purple",
  "グレイグリーン": "Graygreen", // Samsung's official one-word spelling (Z Fold4)
  // Phantom line (S21 / Note / older flagships)
  "ファントムグレー": "Phantom Gray",
  "ファントムブラック": "Phantom Black",
  "ファントムシルバー": "Phantom Silver",
  "ファントムバイオレット": "Phantom Violet",
  "ファントムホワイト": "Phantom White",
  // Generic / basic
  "ホワイト": "White",
  "ブラック": "Black",
  "シルバー": "Silver",
  "ゴールド": "Gold",
  "ネイビー": "Navy",
  "グラファイト": "Graphite",
  "ブルー": "Blue",
  "レッド": "Red",
  "バイオレット": "Violet",
  "ピンクゴールド": "Pink Gold",
  // additional verified Galaxy colors seen on iosys
  "アイシーブルー": "Icy Blue",
  "オーサムアイシーブルー": "Awesome Icy Blue",
  "オーサムグレイ": "Awesome Gray",
  "オーサムグレー": "Awesome Gray",
  "コーラルレッド": "Coral Red",
  "シルバーシャドウ": "Silver Shadow",
  "ジェットブラック": "Jet Black",
  "スカイブルー": "Sky Blue",
  "ダークブルー": "Dark Blue",
  "ブルーシャドウ": "Blue Shadow",
  "プリズムブラック": "Prism Black",
  "プリズムホワイト": "Prism White",
  "プリズムブルー": "Prism Blue",
  "ミスティックブラック": "Mystic Black",
  "ライトブルー": "Light Blue",
  "バーガンティ": "Burgundy", // katakana spelling variant of バーガンディ
  // NOTE: deliberately NOT mapped (uncertain official EN name) — left flagged, never guessed:
  //   プリズムブリックスブラック / プリズムブリックスホワイト, チタニウムシルバーブルー,
  //   チタニウムピンクゴールド
}

export function galaxyColorJaToEn(ja: string | null): string | null {
  if (!ja) return null
  return GALAXY_COLORS_JA_EN[ja] ?? null
}

export const GALAXY_CONFIG: AndroidBrandConfig = {
  brand: "Samsung",
  brandPrefixes: ["Samsung"],
  modelNameRe: /^galaxy\b/i,
  // Samsung JP codes: SIM-free SM-..(Q/C); au SCG##/SCV##; docomo SC-##L. First match wins.
  modelCodeRe: /\b(SM-[A-Z0-9]+|SCG\d+|SCV\d+|SC-\d+[A-Z])\b/,
  canonicalModelName: (seg) =>
    seg
      .replace(/\b5G\b/gi, "")
      .replace(/\b(Single|Dual)[- ]?SIM\b/gi, "")
      .replace(/\+\s*\(Plus\)/gi, "+") // iosys writes "S9+ (Plus)" — collapse the redundancy
      .replace(/\s+/g, " ")
      .trim(),
  colorJaToEn: galaxyColorJaToEn,
}

// ---------------------------------------------------------------------------
// Sony Xperia config
// ---------------------------------------------------------------------------

// Seed color map (observed on iosys + Sony official EN names). Extended by the verified
// research pass; unmapped JA colors stay null (flagged, never guessed). ASCII colors
// (e.g. "Frosted Black", "Liquid Silver", "Venus Pink") flow straight through as color_en.
export const XPERIA_COLORS_JA_EN: Record<string, string> = {
  // Generic / basic
  "ブラック": "Black",
  "ホワイト": "White",
  "ブルー": "Blue",
  "グレー": "Grey", // Sony uses British "Grey"
  "グレイ": "Grey",
  "シルバー": "Silver",
  "ゴールド": "Gold",
  "グリーン": "Green",
  "パープル": "Purple",
  "レッド": "Red",
  "ピンク": "Pink",
  "ラベンダー": "Lavender",
  // Xperia signature colors (Sony official EN — verified)
  "フロストブラック": "Frosted Black",
  "フロストシルバー": "Frosted Silver",
  "フロストパープル": "Frosted Purple",
  "スレートブラック": "Slate Black",
  "プラチナシルバー": "Platinum Silver",
  "セージグリーン": "Sage Green",
  "オーキッドパープル": "Orchid Purple",
  "エクリュホワイト": "Ecru White",
  "ネイティブゴールド": "Native Gold",
  "ガーネットレッド": "Garnet Red",
  "カーキグリーン": "Khaki Green",
  "モスグリーン": "Moss Green",
  "スカーレット": "Scarlet",
  "グラファイトブラック": "Graphite Black",
  "アイオライトシルバー": "Iolite Silver",
  "ミント": "Mint",
  "ターコイズ": "Turquoise",
  "ブリックオレンジ": "Brick Orange",
  // NOTE: deliberately NOT mapped (no official Sony EN name verified — flagged null, never
  // guessed; still promote as the JA token via coalesce in the fill-gaps): チャコールブラック,
  // アイスホワイト, ミストグレー, フロストグレー, フロストグリーン
}

export function xperiaColorJaToEn(ja: string | null): string | null {
  if (!ja) return null
  return XPERIA_COLORS_JA_EN[ja] ?? null
}

export const XPERIA_CONFIG: AndroidBrandConfig = {
  brand: "Sony",
  brandPrefixes: ["SONY", "Sony"],
  modelNameRe: /xperia/i, // lenient (contains): leading carrier/sub-brand junk handled in canonical
  // Sony JP codes: SIM-free XQ-..; docomo SO-..(K/L/M/A/B/C/D + optional lowercase, e.g. SO-51Aa);
  // au SOV##/SOG##; SoftBank (A)###SO; old global J####. First match wins.
  modelCodeRe: /\b(XQ-[A-Z]{2}\d{2}|SO-\d{2}[A-Za-z]+|SOG\d+|SOV\d+|A?\d{3}SO|J\d{4})\b/,
  canonicalModelName: (seg) =>
    seg
      .replace(/^((SONY|Sony|ahamo)\s+)+/i, "") // strip leaked brand / docomo sub-brand prefixes
      .replace(/\b5G\b/gi, "")
      .replace(/\b(Single|Dual)[- ]?SIM\b/gi, "")
      .replace(/^Xperia(?=\d)/i, "Xperia ") // "Xperia1" -> "Xperia 1"
      .replace(/\bAce(?=[IVX])/g, "Ace ") // "AceII" -> "Ace II"
      .replace(/\bPro[- ]?I\b/gi, "Pro I") // "Pro-I" / "ProI" -> "Pro I"
      .replace(/\s+/g, " ")
      .trim(),
  colorJaToEn: xperiaColorJaToEn,
}

// ---------------------------------------------------------------------------
// Sharp AQUOS config
// ---------------------------------------------------------------------------

// Seed color map (observed on iosys + Sharp official EN names; verified research pass 2026-06-28).
// Unmapped JA colors stay null (flagged, never guessed) — they still promote as the JA token via
// coalesce in the fill-gaps. ASCII colors (e.g. "Charcoal", "Olive Green") flow straight through.
// Deliberately NOT mapped (no verified Sharp EN spelling, ambiguous marketing name): クラッシィブルー,
// サクラ, アッシュイエロー, and the sense2-gen pastel cluster (ラベンダーブルー/ペールピンク/ミントグリーン/
// アクアブルー/コーラルマゼンタ/アイスグリーン/ブルーミングレッド/ボタニカルグリーン).
export const AQUOS_COLORS_JA_EN: Record<string, string> = {
  // Generic / basic (verified-direct)
  "ブラック": "Black",
  "ホワイト": "White",
  "シルバー": "Silver",
  "ブルー": "Blue",
  "グリーン": "Green",
  "ピンク": "Pink",
  "レッド": "Red",
  "ゴールド": "Gold",
  "ネイビー": "Navy",
  "パープル": "Purple",
  "コーラル": "Coral",
  // AQUOS signature colors (Sharp official EN — verified)
  "カシミヤホワイト": "Cashmere White", // R10 / R9
  "シルバーホワイト": "Silver White", // sense3 series
  "ライトカッパー": "Light Copper", // sense4/5G/6/7/8/9
  "ディープカッパー": "Deep Copper", // sense7 plus
  "チャコール": "Charcoal", // wish / wish2
  "オリーブグリーン": "Olive Green", // wish / wish2
  "ニュアンスブラック": "Nuance Black", // sense5G / sense2
  "アースブルー": "Earth Blue", // R5G
  "ミスティックホワイト": "Mystic White", // zero2
  "アストロブラック": "Astro Black", // zero2
  "チャコールブラック": "Charcoal Black", // R10 trio (Cashmere White / Charcoal Black / Trench Beige)
  "ペールグリーン": "Pale Green", // sense8 (verified)
  // Standard compound colors — direct katakana transliterations of generic color words (same basis
  // as the Galaxy/Xperia maps: Sky Blue, Coral Red, Cream, etc.). Not marketing-specific names.
  "ライトシルバー": "Light Silver",
  "ライラック": "Lilac",
  "ソフトピンク": "Soft Pink",
  "アイボリー": "Ivory",
  "スカイブルー": "Sky Blue",
  "コーラルレッド": "Coral Red",
  "イエローゴールド": "Yellow Gold",
  "オリーブシルバー": "Olive Silver",
  "クリーム": "Cream",
}

export function aquosColorJaToEn(ja: string | null): string | null {
  if (!ja) return null
  return AQUOS_COLORS_JA_EN[ja] ?? null
}

export const AQUOS_CONFIG: AndroidBrandConfig = {
  brand: "Sharp",
  brandPrefixes: ["SHARP", "Sharp"],
  modelNameRe: /aquos/i, // lenient (contains): leading carrier junk handled in canonical
  // Sharp JP codes: SIM-free SH-M##; Rakuten SH-RM##; docomo SH-##L (2 digits + letter);
  // au SHG##/SHV##; SoftBank A###SH. SH-RM listed before SH-M so it wins. First match wins.
  modelCodeRe: /\b(SH-RM\d+|SH-M\d+|SH-\d{2}[A-Z]|SHG\d+|SHV\d+|A\d{3}SH)\b/,
  canonicalModelName: (seg) =>
    seg
      .replace(/^.*?AQUOS/i, "AQUOS") // drop leaked carrier/brand prefix; normalise "AQUOS" casing
      .replace(/\b5G\b/gi, "") // safe: integral "sense5G"/"R5G"/"zero5G" have no word boundary before 5
      .replace(/\b(Single|Dual)[- ]?SIM\b/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
  colorJaToEn: aquosColorJaToEn,
}

// ---------------------------------------------------------------------------
// Google Pixel config
// ---------------------------------------------------------------------------

// Pixel listings are almost always in English (Obsidian / Porcelain / Bay / Jade / Indigo / Coral /
// Moonstone / Lemongrass…) — ASCII colors flow straight through as color_en, so this map only covers
// the katakana spellings that appear for older Pixels. Quirky official Google names ("Clearly White",
// "Just Black", "Purple-ish", "Sorta Sage"…) are already ASCII and need no mapping. Verified Sharp-style
// research pass 2026-06-28; アイス/ソルベ deliberately NOT mapped (unverified as official Pixel colors).
export const PIXEL_COLORS_JA_EN: Record<string, string> = {
  "オブシディアン": "Obsidian",
  "ポーセリン": "Porcelain",
  "ヘーゼル": "Hazel",
  "ヘイゼル": "Hazel",
  "ベイ": "Bay",
  "ローズ": "Rose",
  "スノー": "Snow",
  "チャコール": "Charcoal",
  "セージ": "Sage",
  "コーラル": "Coral",
  "クラウディーホワイト": "Cloudy White",
  "ジャストブラック": "Just Black",
  "クリアーホワイト": "Clearly White",
  "バーリーブルー": "Barely Blue",
  "レモングラス": "Lemongrass",
  // Generic / basic fallbacks
  "ブラック": "Black",
  "ホワイト": "White",
}

export function pixelColorJaToEn(ja: string | null): string | null {
  if (!ja) return null
  return PIXEL_COLORS_JA_EN[ja] ?? null
}

export const PIXEL_CONFIG: AndroidBrandConfig = {
  brand: "Google",
  brandPrefixes: ["Google"],
  modelNameRe: /pixel/i, // lenient (contains): leading carrier/Google junk handled in canonical
  // Google model code: "G" + 4 uppercase-alnum (GL066 / GM66V / GN4F5 / G020D). Carrier-agnostic;
  // storage/color never encoded. Case-sensitive G + [A-Z0-9] so "Google"/"Green" never match.
  modelCodeRe: /\bG[A-Z0-9]{4}\b/,
  canonicalModelName: (seg) =>
    seg
      .replace(/^.*?Pixel/i, "Pixel") // drop leaked carrier/Google prefix; normalise "Pixel" casing
      // NB: do NOT strip 5G — for Pixel it's a model distinguisher ("Pixel 4a 5G" ≠ "Pixel 4a"),
      // never spurious noise (unlike Galaxy/Xperia/AQUOS).
      .replace(/\b(Single|Dual)[- ]?SIM\b/gi, "")
      .replace(/^Pixel(?=\d)/i, "Pixel ") // "Pixel10"->"Pixel 10", "Pixel7a"->"Pixel 7a"
      .replace(/\s+/g, " ")
      .trim(),
  colorJaToEn: pixelColorJaToEn,
}
