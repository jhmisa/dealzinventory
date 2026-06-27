// Parser for iosys iPad *listing* pages (the by-carrier/connectivity grids).
// iPad titles have a DIFFERENT grammar from iPhone — the part/A numbers sit at the END
// (no parens), generation is a leading 【第N世代】 bracket, and Wi-Fi vs Cellular plus
// screen size are intrinsic SKU attributes. Example <img alt> titles:
//   【第5世代】 iPad mini5 Wi-Fi+Cellular 64GB スペースグレイ MUX52J/A A2124 【国内版SIMフリー】
//   【SIMロック解除済】【第4世代】 SoftBank iPad mini4 Wi-Fi+Cellular 16GB シルバー MK702J/A A1550
//   【第6世代】 iPad Air(M2) 11インチ  Wi-Fi 128GB スターライト MUWE3J/A A2902
//   【第1世代】 iPad Pro 9.7インチ Wi-Fi 128GB スペースグレイ MLMV2J/A A1673
//
// We parse titles directly and dedupe by part_number. Identity (line/gen/size/connectivity/
// storage/color/part/A) is taken verbatim from iosys (always accurate). Chipset/year/RAM and
// a tidy canonical name are enrichment layered on by the harvest runner (keyed by A-number);
// unknowns stay null and are flagged, never guessed.

import { colorJaToEn } from "./apple-colors.ts"

export type IpadConnectivity = "Wi-Fi" | "Wi-Fi + Cellular"
export type Carrier = "SIM-Free" | "docomo" | "au" | "SoftBank" | "Rakuten"
export type IpadLine = "iPad" | "iPad mini" | "iPad Air" | "iPad Pro"

export interface IpadListingSku {
  model_name: string // provisional canonical incl. connectivity, e.g. "iPad Air (5th generation) Wi-Fi"
  base_line: IpadLine
  generation: number | null // from 【第N世代】
  size_inch: number | null // from {n}インチ (null where the title omits it)
  chip: string | null // from (M2)/(M3)/(M4)/(M5)/(A17 Pro)
  connectivity: IpadConnectivity
  model_number: string | null // A-number, e.g. "A2124"
  part_number: string // Apple SKU incl. region suffix, e.g. "MUX52J/A"
  storage_gb: number | null
  color_ja: string | null
  color_en: string | null
  carrier: Carrier | null // network sold under; null for Wi-Fi-only units
  is_unlocked: boolean | null
  region_code: string | null // part-number region letters (J=Japan, LL=USA, ZP=HK/SG, TA=Taiwan)
  is_domestic: boolean | null
  region_note: string | null // trailing bracket text
  glass: string | null // 標準ガラス / ナノテクスチャ (M4/M5 Pro option), usually null
  raw_title: string
}

const LEADING_BRACKET = /^【([^】]*)】\s*/
const GEN_RE = /第(\d+)世代/
const CARRIER_WORD = /^(docomo|au|softbank|rakuten)\s+/i
// {model+size} {connectivity} {storage}{GB|TB} [glass ]{color_ja} {PART/A} {A-number} 【region】
const TAIL_RE =
  /^(.+?)\s+(Wi-Fi(?:\s*\+\s*Cellular)?)\s+(\d+)\s*(GB|TB)\s+(.+?)\s+([A-Z0-9]+\/A)\s+(A\d{4,5})\s*(?:【([^】]*)】)?\s*$/i
const SIZE_RE = /(\d+(?:\.\d+)?)\s*インチ/
const CHIP_RE = /\((M\d|A\d+(?:\s*Pro)?)\)/i
const GLASS_TOKENS = ["標準ガラス", "ナノテクスチャ", "ナノテクスチャガラス"]

const CARRIER_MAP: Record<string, Carrier> = {
  docomo: "docomo",
  au: "au",
  softbank: "SoftBank",
  rakuten: "Rakuten",
}

function regionCode(partNumber: string): string | null {
  const m = partNumber.match(/(\d)([A-Z]+)\/A$/)
  return m ? m[2] : null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

/** Build the provisional canonical model name (without connectivity) from parsed parts. */
function canonicalBase(
  line: IpadLine,
  gen: number | null,
  size: number | null,
  chip: string | null,
): string {
  const ord = gen ? ordinal(gen) : null
  switch (line) {
    case "iPad":
      return ord ? `iPad (${ord} generation)` : "iPad"
    case "iPad mini":
      return chip ? `iPad mini (${chip})` : ord ? `iPad mini (${ord} generation)` : "iPad mini"
    case "iPad Air":
      if (chip && size) return `iPad Air ${size}-inch (${chip})`
      return ord ? `iPad Air (${ord} generation)` : "iPad Air"
    case "iPad Pro": {
      if (chip && size) return `iPad Pro ${size}-inch (${chip})`
      // The lone 9.7" (2016) and 10.5" (2017) Pros have no generation label.
      if (size === 9.7 || size === 10.5) return `iPad Pro ${size}-inch`
      if (size) return ord ? `iPad Pro ${size}-inch (${ord} generation)` : `iPad Pro ${size}-inch`
      return "iPad Pro"
    }
  }
}

function detectLine(modelPart: string): IpadLine | null {
  const s = modelPart.trim()
  if (/^iPad\s*mini/i.test(s)) return "iPad mini"
  if (/^iPad\s*Air/i.test(s)) return "iPad Air"
  if (/^iPad\s*Pro/i.test(s)) return "iPad Pro"
  if (/^iPad/i.test(s)) return "iPad"
  return null
}

/**
 * Parse one iPad listing-card title into a SKU, or null if it doesn't match the shape.
 * `pathCarrier` is the carrier of the URL section crawled — a fallback only when the title
 * carries no carrier signal of its own. Wi-Fi-only units always resolve carrier = null.
 */
export function parseIpadListingTitle(
  rawTitle: string,
  pathCarrier?: Carrier | null,
): IpadListingSku | null {
  if (!rawTitle) return null
  const raw = decodeEntities(rawTitle).replace(/[\s　]+/g, " ").trim()

  // Peel leading 【...】 brackets (condition / lock / generation).
  let rest = raw
  let generation: number | null = null
  let leadingHasUnlock = false
  for (let m = rest.match(LEADING_BRACKET); m; m = rest.match(LEADING_BRACKET)) {
    const inner = m[1].trim()
    const g = inner.match(GEN_RE)
    if (g) generation = parseInt(g[1], 10)
    if (/SIMロック解除済|SIMフリー/i.test(inner)) leadingHasUnlock = true
    rest = rest.slice(m[0].length)
  }

  // Optional carrier word before the model.
  let prefixCarrier: Carrier | null = null
  const cw = rest.match(CARRIER_WORD)
  if (cw) {
    prefixCarrier = CARRIER_MAP[cw[1].toLowerCase()] ?? null
    rest = rest.slice(cw[0].length)
  }

  const m = rest.match(TAIL_RE)
  if (!m) return null
  const [, modelPart, connRaw, storageNum, storageUnit, colorChunk, partNumber, aNumber, regionRaw] = m

  const base_line = detectLine(modelPart)
  if (!base_line) return null

  const sizeM = modelPart.match(SIZE_RE)
  const size_inch = sizeM ? parseFloat(sizeM[1]) : null
  const chipM = modelPart.match(CHIP_RE)
  const chip = chipM ? chipM[1].replace(/\s+/g, " ").toUpperCase().replace("PRO", "Pro") : null

  const connectivity: IpadConnectivity = /\+/.test(connRaw) ? "Wi-Fi + Cellular" : "Wi-Fi"
  const storage_gb = storageUnit.toUpperCase() === "TB"
    ? Math.round(parseFloat(storageNum) * 1024)
    : Math.round(parseFloat(storageNum))

  // colorChunk may carry a leading glass token (M4/M5 Pro option) before the color word.
  let glass: string | null = null
  let colorText = colorChunk.trim()
  for (const g of GLASS_TOKENS) {
    if (colorText.includes(g)) {
      glass = g
      colorText = colorText.replace(g, "").trim()
    }
  }
  // Color is the last whitespace-delimited token.
  const colorTokens = colorText.split(" ").filter(Boolean)
  const color_ja = colorTokens.length ? colorTokens[colorTokens.length - 1] : null
  const color_en = colorJaToEn(color_ja)

  const region_note = regionRaw ? regionRaw.trim() : null
  const region_code = regionCode(partNumber)
  const is_domestic = region_code == null ? null : region_code === "J"

  // Carrier: Wi-Fi-only units have none. Otherwise prefix word > 版 bracket > path.
  let carrier: Carrier | null = null
  let is_unlocked: boolean | null = null
  if (connectivity === "Wi-Fi + Cellular") {
    const noteCarrier = region_note?.match(/^(docomo|au|softbank|rakuten)版/i)
    carrier = prefixCarrier ??
      (noteCarrier ? CARRIER_MAP[noteCarrier[1].toLowerCase()] : null) ??
      (region_note && /(国内版|海外版).*SIMフリー/.test(region_note) ? "SIM-Free" : null) ??
      pathCarrier ??
      null
    is_unlocked = leadingHasUnlock || /SIMフリー/.test(region_note ?? "") ? true : null
  }

  const model_name = `${canonicalBase(base_line, generation, size_inch, chip)} ${connectivity}`

  return {
    model_name,
    base_line,
    generation,
    size_inch,
    chip,
    connectivity,
    model_number: aNumber ?? null,
    part_number: partNumber,
    storage_gb: Number.isFinite(storage_gb) ? storage_gb : null,
    color_ja,
    color_en,
    carrier,
    is_unlocked,
    region_code,
    is_domestic,
    region_note,
    glass,
    raw_title: raw,
  }
}

/** All iPad listing-card <img alt> titles on a page, in document order (with dupes). */
export function extractIpadCardTitles(html: string): string[] {
  const out: string[] = []
  // iPad cards: <img ... alt="...PART/A A1234..."> — match any img alt that contains an
  // Apple part number followed (after at least one space) by an A-number. Unique to SKU cards.
  for (const m of html.matchAll(/<img[^>]*\salt="([^"]*[A-Z0-9]+\/A\s+A\d{4,5}[^"]*)"/g)) {
    const t = (m[1] ?? "").trim()
    if (t) out.push(t)
  }
  return out
}

/** Parse a full iPad listing page into deduped SKUs (by part_number, first occurrence wins). */
export function parseIpadListingPage(
  html: string,
  pathCarrier?: Carrier | null,
): IpadListingSku[] {
  const byPart = new Map<string, IpadListingSku>()
  for (const title of extractIpadCardTitles(html)) {
    const sku = parseIpadListingTitle(title, pathCarrier)
    if (!sku) continue
    if (!byPart.has(sku.part_number)) byPart.set(sku.part_number, sku)
  }
  return [...byPart.values()]
}
