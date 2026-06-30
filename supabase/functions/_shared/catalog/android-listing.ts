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
  // OPTIONAL: brands whose SIM-free cards carry NO model code (Xiaomi: only au XIG##/SoftBank
  // A###XM carry codes; SIM-free has none). When `modelCodeRe` fails to match, the engine falls
  // back to this anchored (^) regex to CONSUME the model-name prefix; the match is the name, the
  // remainder is the color/storage tail, and model_number is null. Must be anchored and /g-free.
  nameConsumeRe?: RegExp
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

  // 4. Find the model code — it splits the model name from the color/storage tail. Some brands
  //    (Xiaomi) only carry a code on carrier variants; SIM-free cards have none, so when the code
  //    fails to match we fall back to `nameConsumeRe` (anchored) to consume the model-name prefix.
  let nameSeg: string
  let model_number: string | null
  let tail: string
  const codeM = rest.match(config.modelCodeRe)
  if (codeM && codeM.index != null) {
    nameSeg = rest.slice(0, codeM.index).trim()
    model_number = codeM[0]
    tail = rest.slice(codeM.index + codeM[0].length).trim()
    // Drop a dual/single-SIM marker glued to the code, e.g. "SM-S948Q/DS 256GB ...".
    tail = tail.replace(/^\/(DS|SS)\b/i, "").trim()
    // Drop a parenthesized secondary carrier code, e.g. HUAWEI "ANE-LX2J (HWU34) Klein Blue".
    tail = tail.replace(/^\(\s*[A-Za-z0-9]+\s*\)\s*/, "").trim()
  } else if (config.nameConsumeRe) {
    const nameM = rest.match(config.nameConsumeRe)
    if (!nameM || nameM.index !== 0) return null
    nameSeg = nameM[0].trim()
    model_number = null
    tail = rest.slice(nameM[0].length).trim()
    // A dual/single-SIM marker can sit between the name and the color (no code to glue to),
    // e.g. "POCO F6 Pro 5G Dual-SIM White" — drop a leading one left on the tail.
    tail = tail.replace(/^(Single|Dual)[- ]?SIM\b/i, "").trim()
  } else {
    return null
  }

  // 4a. Drop a standalone Single/Dual-SIM word left at the head of the tail (ASUS
  //     "ZS620KL-SL128S6 Dual-SIM 【Silver 128GB ...】"). The "/DS"-glued form is handled above.
  tail = tail.replace(/^(Single|Dual)[- ]?SIM\b\s*/i, "").trim()

  // 4b. Storage/RAM can sit in the NAME segment, immediately before the code (OPPO
  //     "Reno3 A 6GB 128GB CPH2013 White"). Pull a trailing "{ram}GB {rom}GB" (or lone "{n}GB") run
  //     out of the name so it doesn't pollute the model name; keep it as a storage/RAM fallback.
  let nameStorage: number | null = null
  let nameRam: number | null = null
  const nameSto = nameSeg.match(/\s+((?:\d+\s*GB\s+)*\d+\s*(?:GB|TB))\s*$/i)
  if (nameSto && nameSto.index != null) {
    const nums = [...nameSto[1].matchAll(/(\d+)\s*(GB|TB)/gi)]
      .map((m) => toStorageGb(m[1], m[2]))
      .filter((n): n is number => n != null)
    if (nums.length) {
      nameStorage = Math.max(...nums)
      if (nums.length >= 2) nameRam = Math.min(...nums)
      nameSeg = nameSeg.slice(0, nameSto.index).trim()
    }
  }

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

  // A code-less parse with no spec bracket is nav noise ("Redmi 12シリーズ の画像"), not a SKU —
  // every real code-less Xiaomi card carries a 【RAM../ROM../版】 bracket. (Coded cards may omit it.)
  if (model_number == null && region_note == null) return null

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

  // 8c. Fall back to storage/RAM pulled from the name segment (step 4b) if still unresolved.
  if (storage_gb == null) storage_gb = nameStorage
  if (ram_gb == null) ram_gb = nameRam

  // 9. Color: prefer the text after the code; strip any trailing full-SKU / code-like token
  //    (ASCII alnum with a digit, e.g. "ブラック SCV46SKV") and the corporate-channel marketing
  //    marker 法人モデル (business SKU; brand-agnostic JP retail noise, e.g. "ブラック 法人モデル").
  //    Else recover the color from inside the note bracket (the "everything in bracket" 楽天版 grammar).
  let colorText = tail
    .replace(/\s*法人モデル\s*$/, "")
    // Drop a Japanese "…付属" bundled-accessory suffix, e.g. "ブロッサムオレンジ OPPO AI Pen Kit付属"
    // (OPPO Find N6). 付属 = "included"; never part of a color — brand-agnostic JP retail noise.
    .replace(/\s+\S.*付属\s*$/, "")
    // Drop an accessory-bundle suffix joined by "+", e.g. "ブラック + Photography Kit" (Xiaomi 14
    // Ultra Photography Kit). A "+" never appears inside a real color, so this is safe brand-wide.
    .replace(/\s*\+\s*\S.*$/, "")
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
    if (!t) continue
    // Cheap filter: alts that carry a model code are SKU cards (nav thumbs are "…の画像").
    if (config.modelCodeRe.test(t)) {
      out.push(t)
      continue
    }
    // Code-less brands (Xiaomi SIM-free): keep alts whose name prefix matches and that carry a
    // spec bracket, excluding the bracket-less nav thumbnails ("Redmi 12シリーズ の画像").
    if (
      config.nameConsumeRe && config.nameConsumeRe.test(t) && /【/.test(t) &&
      !/シリーズ|の画像/.test(t)
    ) {
      out.push(t)
    }
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
  "チタニウムシルバーブルー": "Titanium Silverblue", // S25 Ultra (verified Samsung.com)
  "プリズムブリックスブラック": "Prism Bricks Black", // A51 5G (SCG07)
  "プリズムブリックスホワイト": "Prism Bricks White", // A51 5G (SCG07)
  // NOTE: deliberately NOT mapped (uncertain official EN name) — left flagged, never guessed:
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
  "チャコールブラック": "Charcoal Black", // Xperia 10 VI/VII (verified Amazon.co.jp EN title)
  "アイスホワイト": "Ice White", // Xperia 1 IV
  "ミストグレー": "Mist Gray", // Xperia 10 V Fun Edition (SO-52D)
  "フロストグレー": "Frost Gray", // Xperia 1 III Frost lineup
  // NOTE: deliberately NOT mapped (no official Sony EN name verified — flagged null, never
  // guessed; still promote as the JA token via coalesce in the fill-gaps): フロストグリーン
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
// Deliberately NOT mapped (no verified Sharp EN spelling, ambiguous marketing name):
// サクラ, アッシュイエロー, and the sense2-gen pastel cluster (ラベンダーブルー/ペールピンク/ミントグリーン/
// アクアブルー/コーラルマゼンタ/アイスグリーン/ブルーミングレッド/ボタニカルグリーン).
export const AQUOS_COLORS_JA_EN: Record<string, string> = {
  "フルブラック": "Full Black", // sense10 (2025)
  "トレンチベージュ": "Trench Beige", // R10
  "クラッシィブルー": "Classy Blue", // sense3 plus サウンド (SHV46)
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

// ---------------------------------------------------------------------------
// Xiaomi config (Xiaomi flagship / Redmi / POCO / Mi)
// ---------------------------------------------------------------------------

// Xiaomi is the first brand whose SIM-free cards carry NO model code — only au (XIG##) and
// SoftBank (A###XM) variants do (plus a few older POCO globals with an 8-digit number). So the
// config supplies `nameConsumeRe` for the code-less path. Colors come in katakana OR English;
// ASCII colors flow straight through. Verified research pass 2026-06-28; unmapped JA colors stay
// null (flagged, never guessed) and promote as the JA token via coalesce in the fill-gaps.
export const XIAOMI_COLORS_JA_EN: Record<string, string> = {
  // Generic / basic (verified-direct transliterations)
  "ブラック": "Black",
  "ホワイト": "White",
  "シルバー": "Silver",
  "グレー": "Gray",
  "グレイ": "Gray",
  "ブルー": "Blue",
  "グリーン": "Green",
  "イエロー": "Yellow",
  "レッド": "Red",
  "ピンク": "Pink",
  "パープル": "Purple",
  "ゴールド": "Gold",
  // T-series "Titan" finish — Xiaomi's official EN word is "Titan", NOT "Titanium" (verified).
  "チタングレー": "Titan Gray",
  "チタンブルー": "Titan Blue",
  "チタンブラック": "Titan Black",
  // Verified official Xiaomi/Redmi/POCO colorways (research pass 2026-06-28, cross-checked to
  // specific JP SKU pages).
  "ミッドナイトブラック": "Midnight Black",
  "スターリーブルー": "Starry Blue", // Redmi 14C
  "レモングリーン": "Lemon Green", // Xiaomi 14T
  "アルパインブルー": "Alpine Blue", // Xiaomi 13T
  "メドウグリーン": "Meadow Green", // Xiaomi 13T
  "シルバークローム": "Silver Chrome", // Xiaomi 15 Ultra
  "ナイトフォールブラック": "Nightfall Black", // Redmi Note 9T (JP)
  "デイブレイクパープル": "Daybreak Purple", // Redmi Note 9T (JP)
  "オーロラパープル": "Aurora Purple", // Redmi Note 13 Pro+
  "ムーンライトホワイト": "Moonlight White", // Redmi Note 13 Pro+
  "セージグリーン": "Sage Green", // Redmi 14C
  "モカゴールド": "Mocha Gold", // Xiaomi 15T Pro
  "リキッドシルバー": "Liquid Silver", // Xiaomi 15
  "サイバーシルバー": "Cyber Silver", // POCO F7
  "フォレストグリーン": "Forest Green", // Redmi Note 13 Pro
  "ラベンダーパープル": "Lavender Purple", // Redmi Note 13 Pro
  // Transliteration-confident standard Xiaomi color words (same basis as the Galaxy/Xperia maps).
  "グラファイトグレー": "Graphite Gray",
  "グレイシャーブルー": "Glacier Blue",
  "コズミックグレー": "Cosmic Gray",
  "クロームシルバー": "Chrome Silver", // NB: distinct katakana ordering from シルバークローム — kept separate
  "ドリームホワイト": "Dream White",
  "スターリットグリーン": "Starlit Green", // Xiaomi 17 Ultra (2026)
  "リップルグリーン": "Ripple Green", // Redmi 15
  "チタニウムグレー": "Titan Gray", // Xiaomi uses "Titan" not "Titanium" (14T/Redmi 15; JP also タイタングレー)
  // NOTE: deliberately UNMAPPED (research flagged UNVERIFIED — promote as the JA token via coalesce,
  // never guessed): レイクブルー, ディープブルー, ナイトタイムブルー.
}

export function xiaomiColorJaToEn(ja: string | null): string | null {
  if (!ja) return null
  return XIAOMI_COLORS_JA_EN[ja] ?? null
}

export const XIAOMI_CONFIG: AndroidBrandConfig = {
  brand: "Xiaomi",
  brandPrefixes: [], // "Xiaomi" is NOT a blanket prefix — it's the flagship model line; sub-brand
  // peeling (Xiaomi POCO/Redmi/Mi → POCO/Redmi/Mi) is handled in canonicalModelName.
  modelNameRe: /xiaomi|redmi|poco|\bmi/i,
  // Xiaomi JP codes: au XIG##; SoftBank A###XM; older POCO globals an 8-digit number (+letter).
  // SIM-free cards have NO code — handled by nameConsumeRe below.
  modelCodeRe: /\b(XIG\d+|A\d{3}XM|\d{8}[A-Z]?)\b/,
  // Code-less SIM-free fallback: consume the model-name prefix. Starts with an optional leading
  // "Xiaomi " brand word, then a sub-brand/flagship line word, then model tokens (anything with a
  // digit, or a tier word, or a "+"). Stops at the first color token (katakana, or an ASCII word
  // with no digit that isn't a tier word).
  nameConsumeRe:
    /^(?:Xiaomi\s+)?(?:POCO|Redmi|Mi|Xiaomi)(?:\s*(?:[A-Za-z]*\d[A-Za-z0-9]*\+?|Note|Pro|Ultra|Max|Lite|Plus|GT|JE|Dual-SIM|Single-SIM|[45]G|\+))+/i,
  canonicalModelName: (seg) => {
    let s = seg.replace(/\s+/g, " ").trim()
    // 1. Peel a leading "Xiaomi " brand prefix ONLY when it precedes a sub-brand (POCO/Redmi/Mi);
    //    for the flagship line ("Xiaomi 15T Pro", "Xiaomi11T") the "Xiaomi" IS the model name.
    // (no \b after Mi/Redmi — names glue the number on, e.g. "Mi11", "Redmi12C")
    s = s.replace(/^Xiaomi\s+(?=POCO|Redmi|Mi)/i, "")
    // 2. Normalize the leading brand-line word's casing (iosys writes XIAOMI / REDMI / POCO).
    s = s.replace(/^xiaomi/i, "Xiaomi").replace(/^redmi/i, "Redmi").replace(/^poco/i, "POCO")
      .replace(/^mi/i, "Mi")
    // 3. Insert a space between the brand-line word and a glued number (Xiaomi11T→Xiaomi 11T,
    //    Redmi12C→Redmi 12C, Mi10→Mi 10, Redmi15→Redmi 15).
    s = s.replace(/^(Xiaomi|Redmi|POCO|Mi)(?=\d)/, "$1 ")
    // 4. Space after "Note" before a number (Note11→Note 11, Note9S→Note 9S).
    s = s.replace(/\bNote(?=\d)/g, "Note ")
    // 4b. Title-case tier words (iosys writes "Mi11 lite" with a lowercase l) so they match the
    //     spec-table keys ("Mi 11 Lite", "POCO F7 Ultra").
    s = s.replace(/\b(pro|ultra|max|lite|plus)\b/gi, (m) => m[0].toUpperCase() + m.slice(1).toLowerCase())
    // 5. Strip network-generation + SIM markers (JP Xiaomi: 5G is not a model distinguisher,
    //    unlike Pixel — every JP variant is the 5G one, so collapsing avoids spurious dupes).
    s = s.replace(/\b[45]G\b/gi, "").replace(/\b(Single|Dual)[- ]?SIM\b/gi, "")
    return s.replace(/\s+/g, " ").trim()
  },
  colorJaToEn: xiaomiColorJaToEn,
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

// ---------------------------------------------------------------------------
// OPPO config (OPPO A-series / Reno / Find / older R / Reno A)
// ---------------------------------------------------------------------------

// OPPO is a CODED brand (unlike Xiaomi): almost every card carries a model code — CPH#### (global
// SIM-free / Rakuten), OPG## (au), A###OP (SoftBank / Y!mobile). A few old models (AX7) are code-
// less, handled by nameConsumeRe. JP-specific grammars handled by the generic engine: storage in
// the name segment before the code ("Reno3 A 6GB 128GB CPH2013 White", step 4b) and the "…付属"
// accessory-bundle suffix ("Find N6 … OPPO AI Pen Kit付属", step 9). Colors come in katakana OR
// English; verified research pass 2026-06-28, unmapped JA colors stay null (flagged, never guessed).
export const OPPO_COLORS_JA_EN: Record<string, string> = {
  "スターグレー": "Star Grey", // Find X8 (OPPO official copy uses British "Grey")
  // Generic / basic (verified-direct transliterations)
  "ブラック": "Black",
  "ホワイト": "White",
  "シルバー": "Silver",
  "グレー": "Gray",
  "グレイ": "Gray",
  "ブルー": "Blue",
  "グリーン": "Green",
  "レッド": "Red",
  "ピンク": "Pink",
  "パープル": "Purple",
  "ゴールド": "Gold",
  "オレンジ": "Orange",
  // OPPO official EN colorways (verified research pass 2026-06-28 vs oppo.com/jp + GSMArena).
  "アイスブルー": "Ice Blue", // Reno5 A / Reno13 A
  "シルバーブラック": "Silver Black", // Reno5 A
  "ナイトブラック": "Night Black", // Reno9 A
  "ムーンホワイト": "Moon White", // Reno9 A
  "ドリームブルー": "Dream Blue", // Reno7 A
  "スターリーブラック": "Starry Black", // Reno7 A
  "ダークグリーン": "Dark Green", // Reno11 A
  "コーラルパープル": "Coral Purple", // Reno11 A
  "グローグリーン": "Glow Green", // A79 5G
  "ブロッサムオレンジ": "Blossom Orange", // Find N6
  "スペースブラック": "Space Black", // Find X9
  "チタニウムグレー": "Titanium Gray", // Find X9 (OPPO uses "Titanium", unlike Xiaomi's "Titan")
  "グロッシーパープル": "Glossy Purple", // Reno10 Pro
  "シルバーグレー": "Silver Gray", // Reno10 Pro
  "ファンタスティックパープル": "Fantastic Purple", // A54 5G
  "エメラルドグリーン": "Emerald Green", // R17 Pro
  // Additional common JP OPPO colors (research, high confidence)
  "ミステリーブラック": "Mystery Black", // A79 5G
  "ルミナスネイビー": "Luminous Navy", // Reno13 A
  "チャコールグレー": "Charcoal Gray", // Reno13 A
  "ステラーチタニウム": "Stellar Titanium", // Find N6 (ー prolonged-mark spelling)
  "ステラ―チタニウム": "Stellar Titanium", // Find N6 (― horizontal-bar spelling iosys actually uses)
}

export function oppoColorJaToEn(ja: string | null): string | null {
  if (!ja) return null
  return OPPO_COLORS_JA_EN[ja] ?? null
}

export const OPPO_CONFIG: AndroidBrandConfig = {
  brand: "OPPO",
  brandPrefixes: ["OPPO", "Oppo"],
  // After the OPPO prefix is peeled the name starts with the line token: A##/AX##/Reno/Find/R##.
  modelNameRe: /^(A\s*\d|AX\d|Reno|Find\b|R\d{2})/i,
  // OPPO JP codes: global/SIM-free/Rakuten CPH####; au OPG##; SoftBank/Y!mobile A###OP.
  modelCodeRe: /\b(CPH\d+|OPG\d+|A\d{3}OP)\b/,
  // A few old code-less models (e.g. "OPPO AX7 ブルー【国内版SIMフリー】"). Consume the line token +
  // following model tokens (digits / tier words / the JP "A" suffix), stop at the color. The leading
  // "OPPO " prefix is optional so this also matches the raw title in the card extractor (which tests
  // before the prefix is peeled).
  nameConsumeRe:
    /^(?:OPPO\s+|Oppo\s+)?(?:A\s*\d[A-Za-z0-9]*|AX\d+|Reno[A-Za-z0-9]*|Find\s*[A-Za-z0-9]+|R\d{2}[A-Za-z0-9]*)(?:\s*(?:[A-Za-z]*\d[A-Za-z0-9]*|Pro|Plus|Lite|Neo|[45]G|A|Dual-SIM|Single-SIM|\d{4}))*/i,
  canonicalModelName: (seg) =>
    seg
      .replace(/^(OPPO|Oppo)\s+/i, "") // belt-and-suspenders if the prefix peel missed it
      // KEEP 5G — for OPPO it's a model distinguisher ("A5 5G" ≠ "A5 2020"), never spurious noise.
      .replace(/\b(Single|Dual)[- ]?SIM\b/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
  colorJaToEn: oppoColorJaToEn,
}

// ---------------------------------------------------------------------------
// Fujitsu / FCNT arrows config (arrows N / We / Be / Alpha / 5G / NX)
// ---------------------------------------------------------------------------

// arrows is a clean CODED brand: docomo F-##[A-Z], au FCG##, SoftBank A###FC, SIM-free M## (arrows
// Alpha = M08). "arrows" is the model line (kept in the name, lowercase per FCNT styling), like
// "Galaxy"/"Pixel"; brand column = "Fujitsu" (matches legacy + the brand-normalize trigger). KEEPS
// "5G" — "arrows 5G" (F-51A) is a model name, not noise. Verified research pass 2026-06-28.
export const ARROWS_COLORS_JA_EN: Record<string, string> = {
  // Generic / basic
  "ブラック": "Black",
  "ホワイト": "White",
  "ネイビー": "Navy", // arrows We (docomo F-51B)
  "ゴールド": "Gold",
  "レッド": "Red", // arrows We (docomo online-shop exclusive)
  "ピンク": "Pink",
  "パープル": "Purple", // arrows We (docomo exclusive)
  "ローズゴールド": "Rose Gold", // arrows We au FCG01 (direct transliteration of the iosys color token)
  // arrows N (F-51C) official colors (research-verified)
  "フォグホワイト": "Fog White",
  "フォレストブラック": "Forest Black",
  "ブラッシュネイビー": "Blush Navy", // ブラッシュ = Blush, NOT Brush
  // arrows We2 / We2 Plus official colors (research-verified)
  "ミストホワイト": "Mist White", // We2 (SoftBank)
  "ネイビーグリーン": "Navy Green", // We2
  "ライトオレンジ": "Light Orange", // We2
  "ライトブルー": "Light Blue", // We2 (Rakuten/au)
  "スレートグレイ": "Slate Gray", // We2 Plus (F-51E)
  "シャンパンシルバー": "Champagne Silver", // We2 Plus (F-51E)
  "ターコイズ": "Turquoise", // arrows We
}

export function arrowsColorJaToEn(ja: string | null): string | null {
  if (!ja) return null
  return ARROWS_COLORS_JA_EN[ja] ?? null
}

export const ARROWS_CONFIG: AndroidBrandConfig = {
  brand: "Fujitsu",
  brandPrefixes: [], // "arrows" is the model line, kept in the name (not a peelable prefix)
  modelNameRe: /arrows/i, // lenient (contains): leading carrier junk handled by the engine
  // arrows JP codes: docomo F-##[A-Z]; au FCG##; SoftBank A###FC; SIM-free M## (arrows Alpha M08).
  modelCodeRe: /\b(F-\d{2}[A-Z]|FCG\d+|A\d{3}FC|M\d{2})\b/,
  canonicalModelName: (seg) =>
    seg
      .replace(/^.*?arrows/i, "arrows") // drop any leaked carrier prefix; force lowercase "arrows"
      // KEEP 5G — "arrows 5G" (F-51A) is a model name, not spurious noise.
      .replace(/\b(Single|Dual)[- ]?SIM\b/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
  colorJaToEn: arrowsColorJaToEn,
}

// ---------------------------------------------------------------------------
// HUAWEI config (P-series / Mate / nova)
// ---------------------------------------------------------------------------

// HUAWEI is a coded brand: global model code = 3 uppercase letters + "-" + alnum (ANE-LX2J, ELS-NX9,
// LYA-L09); au HWV##; docomo HW-##[A-Z]. Most colors are already English (flow through); a few JP
// katakana ones are mapped. MVNO/carrier prefixes (Y!mobile / UQ / mineo) and a parenthesized
// secondary code "(HWU34)" are peeled. Verified research pass 2026-06-28.
export const HUAWEI_COLORS_JA_EN: Record<string, string> = {
  // Generic / basic
  "ブラック": "Black",
  "ホワイト": "White",
  "ブルー": "Blue",
  // Verified HUAWEI JP colorways (research pass 2026-06-28). Most colors print in English on iosys
  // already (flow through as color_en); these are the katakana spellings.
  "クラインブルー": "Klein Blue", // nova lite 3 / P20 lite (NOT Crush Blue — distinct color)
  "ミッドナイトブルー": "Midnight Blue", // P20 Pro (docomo)
  "ミッドナイトブラック": "Midnight Black",
  "オーロラブルー": "Aurora Blue", // nova lite 3
  "オーロラ": "Aurora", // P30 / P30 Pro gradient
  "パールホワイト": "Pearl White", // P30 lite
  "ピーコックブルー": "Peacock Blue", // P30 lite
  "サクラピンク": "Sakura Pink", // nova line
  "コーラルレッド": "Coral Red", // nova lite 3
  "クラッシュブルー": "Crush Blue", // nova 5T
  "クラッシュグリーン": "Crush Green", // nova 5T
  "ミッドサマーパープル": "Midsummer Purple", // nova 5T
  "グラファイトブラック": "Graphite Black", // P10 Plus / Mate line
  "シルバーフロスト": "Silver Frost", // P40 Pro 5G
  "ブリージングクリスタル": "Breathing Crystal", // P30 Pro
}

export function huaweiColorJaToEn(ja: string | null): string | null {
  if (!ja) return null
  return HUAWEI_COLORS_JA_EN[ja] ?? null
}

export const HUAWEI_CONFIG: AndroidBrandConfig = {
  brand: "Huawei",
  brandPrefixes: ["HUAWEI", "Huawei"],
  // Lenient (contains) — a leading MVNO word (Y!mobile/UQ) may still sit on the name segment before
  // canonicalization strips it; the model token is P##/Mate/nova. (honor is a SEPARATE brand in iosys
  // — deliberately excluded so "HUAWEI honor6" never lands under the Huawei brand column.)
  modelNameRe: /\b(P\d|Mate|nova)/i,
  // HUAWEI codes: global 3-letter "ABC-XYn[J]"; au HWV##; docomo HW-##[A-Z]. First match wins.
  modelCodeRe: /\b([A-Z]{3}-[A-Z]{1,2}\d{1,2}[A-Z]?|HWV\d+|HW-\d{2}[A-Z])\b/,
  canonicalModelName: (seg) =>
    seg
      // Strip a leading MVNO/carrier word the engine's CARRIER_WORD (docomo/au/softbank/rakuten only)
      // doesn't cover — "Y!mobile HUAWEI P30 lite", "UQ ...", "mineo ...".
      .replace(/^(Y!?mobile|UQ\s?mobile|UQ|mineo)\s+/i, "")
      .replace(/^(HUAWEI|Huawei)\s+/i, "") // brand prefix left when an MVNO word preceded it
      .replace(/\bnova(?=\d)/gi, "nova ") // "nova3"->"nova 3", "nova2"->"nova 2" (nova 5T already spaced)
      // KEEP 5G — Huawei uses it as a model marker ("P40 Pro 5G"); JP lineup rarely has a 4G twin.
      .replace(/\b(Single|Dual)[- ]?SIM\b/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
  colorJaToEn: huaweiColorJaToEn,
}

// ---------------------------------------------------------------------------
// ASUS config (Zenfone / ROG Phone)
// ---------------------------------------------------------------------------

// ASUS covers two lines under one brand: Zenfone and ROG Phone. Codes: modern (Zenfone 9+, ROG Phone
// 8+) = "AI####" project code; older Zenfone = "Z[SE]###[KL/KS]" with an optional "-XX###S##" SKU
// suffix (color/storage/RAM, e.g. ZS620KL-SL128S6). The canonicalizer normalizes "ZenFone"→"Zenfone"
// and inserts the space before the number ("Zenfone9"→"Zenfone 9", "ROG Phone8"→"ROG Phone 8") to
// match ASUS's official naming. Verified research pass 2026-06-28.
export const ASUS_COLORS_JA_EN: Record<string, string> = {
  // Generic / basic
  "ブラック": "Black",
  "ホワイト": "White",
  "シルバー": "Silver",
  "レッド": "Red",
  "ブルー": "Blue",
  // ASUS Zenfone / ROG official colorways
  "ファントムブラック": "Phantom Black", // ROG Phone 8 Pro
  "ミッドナイトブラック": "Midnight Black", // Zenfone 9
  "ムーンライトホワイト": "Moonlight White", // Zenfone 8 / 9
  "サンセットレッド": "Sunset Red", // Zenfone 9
  "スターリーブルー": "Starry Blue", // Zenfone 9
  "スターリー ブルー": "Starry Blue", // spaced spelling variant on iosys
  "レベルグレー": "Rebel Grey", // ROG Phone 8 (ASUS "Rebel Grey" — British spelling, verified)
  // Additional verified ASUS colorways (research pass 2026-06-28)
  "ストームホワイト": "Storm White", // ROG Phone 6 / 7
  "スノーホワイト": "Snow White", // ROG Phone 9
  "オーロラグリーン": "Aurora Green", // Zenfone 10
  "コメットホワイト": "Comet White", // Zenfone 10
  "エクリプスレッド": "Eclipse Red", // Zenfone 10
  "オブシディアンブラック": "Obsidian Black", // Zenfone 8
  "ホライゾンシルバー": "Horizon Silver", // Zenfone 8
  "デザートサンド": "Desert Sand", // Zenfone 11 Ultra
  "スカイラインブルー": "Skyline Blue", // Zenfone 11 Ultra
}

export function asusColorJaToEn(ja: string | null): string | null {
  if (!ja) return null
  return ASUS_COLORS_JA_EN[ja] ?? null
}

export const ASUS_CONFIG: AndroidBrandConfig = {
  brand: "ASUS",
  brandPrefixes: ["ASUS", "Asus"],
  modelNameRe: /^(Zenfone|ROG)/i, // after ASUS peel the name starts with Zenfone / ROG Phone
  // ASUS codes: modern AI####; older Z[SE]###[KL/KS] (+ optional "-XX###S##" SKU suffix). First wins.
  modelCodeRe: /\b(AI\d{4}|Z[A-Z]\d{3}[A-Z]{2}(?:-[A-Za-z0-9]+)?)\b/,
  canonicalModelName: (seg) =>
    seg
      .replace(/zenfone/i, "Zenfone") // normalize ASUS's inconsistent "ZenFone"/"Zenfone" casing
      .replace(/Zenfone(?=\d)/i, "Zenfone ") // "Zenfone9"->"Zenfone 9", "Zenfone5Z"->"Zenfone 5Z"
      .replace(/ROG\s*Phone(?=\d)/i, "ROG Phone ") // "ROG Phone8"->"ROG Phone 8"
      .replace(/\b(Single|Dual)[- ]?SIM\b/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
  colorJaToEn: asusColorJaToEn,
}

// ---------------------------------------------------------------------------
// Motorola config (moto g / edge / razr)
// ---------------------------------------------------------------------------

// Motorola covers three lines under one brand: moto g, edge, razr. Codes: global "XT####-#";
// SoftBank "A###MO"; docomo "M-##[A-Z]". Names are lowercase ("moto g52j 5G", "edge 20", "razr 40").
// The canonicalizer inserts the space razr40->razr 40; storage often sits in the name ("moto g30
// 128GB XT2129-2") and is pulled by the generic step 4b. Verified research pass 2026-06-28.
export const MOTOROLA_COLORS_JA_EN: Record<string, string> = {
  // Generic / basic
  "ブラック": "Black",
  "ホワイト": "White",
  "シルバー": "Silver",
  "グレイ": "Gray",
  "グレー": "Gray",
  "ブルー": "Blue",
  "ミッドナイトブルー": "Midnight Blue",
  "シルバーブルー": "Silver Blue",
  "ブラックビューティー": "Black Beauty", // edge 40 neo (long-vowel ー spelling variant)
  // Verified Motorola colorways (research pass 2026-06-28 — all cross-checked to specific JP models).
  "インクブラック": "Ink Black", // moto g53j 5G
  "パールホワイト": "Pearl White", // moto g52j 5G (+ II / SPECIAL)
  "ミネラルグレイ": "Mineral Gray", // moto g31 / g32
  "バニラクリーム": "Vanilla Cream", // razr 40 / 40s
  "インフィニットブラック": "Infinite Black", // razr 40 Ultra
  "イリディセントスカイ": "Iridescent Sky", // moto g100 (JP-exclusive launch color)
  "パステルスカイ": "Pastel Sky", // moto g30
  "アークティックシルバー": "Arctic Silver", // moto g53j 5G
  "フレッシュラベンダー": "Fresh Lavender", // moto g05
  "フロストオニキス": "Frost Onyx", // edge 20
  "エレキグラファイト": "Electric Graphite", // edge 20 fusion
  "ホワイトマーブル": "White Marble", // razr 50d (docomo)
  // Pantone-collaboration razr/edge colors (curated names, verified)
  "スカラベグリーン": "Scarab Green", // razr 60 Ultra
  "パルフェピンク": "Parfait Pink", // razr 60
  "サンドクリーム": "Sand Cream", // razr 50 / 50s
  "スプリッツオレンジ": "Spritz Orange", // razr 50 / 50s (NOT "Split Orange")
  "ジブラルタルシーネイビー": "Gibraltar Sea Navy", // edge 60 / razr 60
  "コアラグレイ": "Koala Grey", // razr 50 / 50s
  "サマーライラック": "Summer Lilac", // razr 40s
  "セージグリーン": "Sage Green", // razr 40 / 40s
  // edge / moto-g additional verified colors
  "イクリプスブラック": "Eclipse Black", // edge 40
  "ルナブルー": "Luna Blue", // edge 40
  "カリビアンブルー": "Caribbean Blue", // edge 40 neo
  "ブラックビューティ": "Black Beauty", // edge 40 neo
  "アイスグリーン": "Ice Green", // moto g24
  "ミスティブルー": "Misty Blue", // moto g05
  "ブラックオイスター": "Black Oyster", // moto g66j 5G (Pantone)
  "ディルグリーン": "Dill Green", // moto g66j 5G (Pantone)
  "グレーミスト": "Grey Mist", // moto g66j 5G (Pantone)
  "リュクスラベンダー": "Luxe Lavender", // edge 50 pro
  "コスモブルー": "Cosmos Blue", // edge 30 Pro (plural "Cosmos", not "Cosmo")
  "ライトスカイホワイト": "PANTONE Lightest Sky", // razr 60 / 60d / 60s (Pantone 11-4804 TPG)
}

export function motorolaColorJaToEn(ja: string | null): string | null {
  if (!ja) return null
  return MOTOROLA_COLORS_JA_EN[ja] ?? null
}

export const MOTOROLA_CONFIG: AndroidBrandConfig = {
  brand: "Motorola",
  brandPrefixes: ["Motorola", "motorola"],
  modelNameRe: /^(moto|edge|razr)/i, // after Motorola peel the name starts with moto/edge/razr
  // Motorola codes: global XT####-#; SoftBank A###MO; docomo M-##[A-Z]. First match wins.
  modelCodeRe: /\b(XT\d{4}-\d|A\d{3}MO|M-\d{2}[A-Z])\b/,
  canonicalModelName: (seg) =>
    seg
      .replace(/^motorola\s+/i, "") // belt-and-suspenders if the prefix peel missed it
      .replace(/^moto\b/i, "moto") // normalize the line casing ("Moto g64"->"moto g64")
      .replace(/\brazr(?=\d)/gi, "razr ") // "razr40"->"razr 40", "razr60 Ultra"->"razr 60 Ultra"
      .replace(/\bedge(?=\d)/gi, "edge ") // "edge30 Pro"->"edge 30 Pro"
      // KEEP 5G — Motorola uses it as a model marker ("moto g52j 5G", and the II/SPECIAL variants).
      .replace(/\b(Single|Dual)[- ]?SIM\b/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
  colorJaToEn: motorolaColorJaToEn,
}
