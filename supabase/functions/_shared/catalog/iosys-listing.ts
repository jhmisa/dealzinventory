// Parser for iosys iPhone *listing* pages (the by-carrier grids).
// Each listing card's <img alt="..."> carries the full SKU title, e.g.:
//   【バッテリー80%未満】iPhone16 Pro Max A3295 (MYWG3J/A) 256GB ブラックチタニウム 【国内版SIMフリー】
// We parse those titles directly — no per-product page fetch needed — and dedupe by
// part_number. The model-group <a href> path also encodes the carrier segment.
//
// Design: store raw iosys facts verbatim (always accurate). English color + per-model
// specs are enrichment layered on top by the harvest runner; unknown values stay null
// and are flagged, never guessed.

import { normalizeIphoneModelName } from "./iphone-specs.ts"
import { colorJaToEn } from "./apple-colors.ts"

export type Carrier = "SIM-Free" | "docomo" | "au" | "SoftBank" | "Rakuten"

export interface ListingSku {
  model_name: string // canonical, e.g. "iPhone 16 Pro Max"
  model_number: string | null // A-number, e.g. "A3295"
  part_number: string // Apple SKU incl. region suffix, e.g. "MYWG3J/A"
  storage_gb: number | null // integer GB (TB folded to *1024)
  color_ja: string | null
  color_en: string | null // derived via the Apple color map; null if unmapped (flag)
  carrier: Carrier | null // network sold under (title prefix beats crawl path); null if unknown
  is_unlocked: boolean | null // lock state, distinct from carrier; null if unknown
  region_code: string | null // part-number region letters, e.g. "J" (Japan), "VC" (Canada)
  is_domestic: boolean | null // true if part_number region = Japan (J)
  region_note: string | null // trailing bracket text, e.g. "国内版SIMフリー" / "カナダ版SIMフリー"
  raw_title: string
}

// All leading 【...】 brackets (condition / lock state), captured greedily one at a time.
const LEADING_BRACKET = /^【([^】]*)】\s*/
// Optional original-carrier prefix before the model.
const CARRIER_PREFIX = /^(docomo|au|softbank|rakuten|楽天モバイル|楽天)\s+/i
// {model} {A-number} ({part-number}) {storage}{GB|TB} {color_ja} 【region/lock】
const TITLE_RE =
  /^(.+?)\s+(A\d{4,5})\s+\(([A-Z0-9]+(?:[A-Z]{1,3})?\/A)\)\s+(\d+)\s*(GB|TB)\s+([^【]+?)\s*(?:【([^】]*)】)?\s*$/

const CARRIER_MAP: Record<string, Carrier> = {
  docomo: "docomo",
  au: "au",
  softbank: "SoftBank",
  rakuten: "Rakuten",
  "楽天": "Rakuten",
  "楽天モバイル": "Rakuten",
}

/** Region letters trailing an Apple part number (e.g. MGHN3J/A -> "J", MU093VC/A -> "VC"). */
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

/**
 * Parse one listing-card title into a SKU, or null if it doesn't match the shape.
 * `pathCarrier` is the carrier of the URL section being crawled — used as a fallback
 * only when the title carries no carrier signal of its own.
 */
export function parseListingTitle(
  rawTitle: string,
  pathCarrier?: Carrier | null,
): ListingSku | null {
  if (!rawTitle) return null
  const raw = decodeEntities(rawTitle).replace(/[\s　]+/g, " ").trim()

  // Peel leading 【...】 brackets (condition + lock state).
  let rest = raw
  const leadingBrackets: string[] = []
  for (let m = rest.match(LEADING_BRACKET); m; m = rest.match(LEADING_BRACKET)) {
    leadingBrackets.push(m[1].trim())
    rest = rest.slice(m[0].length)
  }

  // Optional original-carrier prefix before the model word.
  let prefixCarrier: Carrier | null = null
  const cm = rest.match(CARRIER_PREFIX)
  if (cm) {
    prefixCarrier = CARRIER_MAP[cm[1].toLowerCase()] ?? CARRIER_MAP[cm[1]] ?? null
    rest = rest.slice(cm[0].length)
  }

  const m = rest.match(TITLE_RE)
  if (!m) return null
  const [, modelRaw, aNumber, partNumber, storageNum, storageUnit, colorJaRaw, regionRaw] = m

  const model_name = normalizeIphoneModelName(modelRaw) ?? modelRaw.trim()
  const storage_gb = storageUnit.toUpperCase() === "TB"
    ? Math.round(parseFloat(storageNum) * 1024)
    : Math.round(parseFloat(storageNum))
  const color_ja = colorJaRaw ? colorJaRaw.trim() : null
  const color_en = colorJaToEn(color_ja)
  const region_note = regionRaw ? regionRaw.trim() : null
  const region_code = regionCode(partNumber)
  const is_domestic = region_code == null ? null : region_code === "J"

  // Lock state: a 解除済 / SIMフリー signal means unlocked.
  const lockText = [...leadingBrackets, region_note ?? ""].join(" ")
  const is_unlocked = /解除済|SIMフリー|simフリー|sim-?free/i.test(lockText)
    ? true
    : /SIMロック(?!解除)/i.test(lockText)
      ? false
      : null

  // Carrier: title prefix wins; else a SIMフリー bracket -> SIM-Free; else the crawl path.
  const carrier: Carrier | null = prefixCarrier ??
    (region_note && /SIMフリー/.test(region_note) ? "SIM-Free" : null) ??
    pathCarrier ??
    null

  return {
    model_name,
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
    raw_title: raw,
  }
}

/** All listing-card <img alt> titles on a listing page, in document order (with dupes). */
export function extractCardTitles(html: string): string[] {
  const out: string[] = []
  // Cards live inside <li class="...item"> ... <img ... alt="...(PART/A)..."> — we match
  // any img alt that contains a parenthesized Apple part number, which is unique to SKU cards.
  for (const m of html.matchAll(/<img[^>]*\salt="([^"]*\([A-Z0-9]+[A-Z]*\/A\)[^"]*)"/g)) {
    const t = (m[1] ?? "").trim()
    if (t) out.push(t)
  }
  return out
}

/**
 * Parse a full listing page into deduped SKUs (by part_number, first occurrence wins).
 * `carrierPath` is the URL segment crawled (simfree/docomo/au/softbank/rakuten); it is
 * the authoritative carrier source and is returned to the caller, not stored here.
 */
export function parseListingPage(html: string, pathCarrier?: Carrier | null): ListingSku[] {
  const byPart = new Map<string, ListingSku>()
  for (const title of extractCardTitles(html)) {
    const sku = parseListingTitle(title, pathCarrier)
    if (!sku) continue
    if (!byPart.has(sku.part_number)) byPart.set(sku.part_number, sku)
  }
  return [...byPart.values()]
}
