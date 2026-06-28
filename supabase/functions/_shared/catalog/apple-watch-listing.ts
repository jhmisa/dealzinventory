// Parser for iosys Apple Watch *listing* pages. Apple Watch is the FOURTH Apple part#-keyed grammar
// (after iPhone, iPad, Mac). Unlike Mac, the SiP/year is NOT in the title, so a small verified spec
// reference (`apple-watch-specs.ts`) enriches chipset + year. Example <img alt> titles:
//   Apple Watch Series7 45mm GPSモデル MKN53J/A A2474【ミッドナイトアルミニウムケース/ミッドナイトスポーツバンド】
//   Apple Watch SE3 44mm GPS+Cellularモデル MEPJ4J/A A3328【ミッドナイトアルミニウムケース/ミッドナイトスポーツバンド(M/L)】
//   Apple Watch Ultra2 49mm GPS+Cellularモデル MX4U3J/A A2986【ブラックチタニウムケース/ブラックトレイルループ】
//   Apple Watch Nike Series7 45mm GPS+Cellularモデル MKL53J/A A2478【ミッドナイトアルミニウムケース/…Nikeスポーツバンド】
//   【第2世代】Apple Watch SE 40mm GPSモデル MXEF3J/A A2722【スターライトアルミニウムケース/スターライトスポーツバンド】
//   【バンド無し】Apple Watch Edition Series6 40mm GPS+Cellularモデル MJ4M3J/A A2375【チタニウムケース】
//
// Identity collapses on CASE config (model + case size + material + case color + has_cellular); the
// BAND is a swappable accessory and is dropped from identity. part# is the coarse representative.

import { colorJaToEn } from "./apple-colors.ts"

export type WatchCollection = "Nike" | "Hermes" | "Edition" | null

export interface AppleWatchListingSku {
  model_name: string // canonical, e.g. "Apple Watch Series 7", "Apple Watch Nike SE (2nd gen)"
  collection: WatchCollection
  generation: number | null // from a leading 【第N世代】 (SE 2nd gen)
  case_size_mm: number // 40 / 41 / 42 / 44 / 45 / 46 / 49
  case_material: string | null // "Aluminum" / "Titanium" / "Stainless Steel" / "Ceramic"
  case_material_ja: string | null
  connectivity: string // "GPS" / "GPS + Cellular"
  has_cellular: boolean
  band_less: boolean // 【バンド無し】 — case only, no band included
  form_factor: string // "45mm Aluminum" — size + material (per product_models mapping)
  part_number: string // primary Apple SKU incl. region suffix, e.g. "MKN53J/A"
  band_part_number: string | null // secondary +part# when present (the band SKU)
  model_number: string // A-number, e.g. "A2474"
  color_ja: string | null // case color JP token
  color_en: string | null // case color canonical EN
  band_ja: string | null // raw band text (informational; not identity)
  region_code: string | null // J=Japan, LL=USA, etc.
  is_domestic: boolean | null
  raw_title: string
}

const LEADING_BRACKET = /^【([^】]*)】\s*/
// After "Apple Watch [collection] ": line + size + connectivity + モデル + part#[+band#] + A# + 【case】
const BODY_RE =
  /^(?:(Nike|Hermes|Hermès|Edition)\s+)?(SE\d*|Series\s*\d+|Ultra\d*)\s+(\d+)\s*mm\s+(GPS\s*\+\s*Cellular|GPS|Cellular)\s*モデル\s+([A-Z0-9]+\/A)(?:\+([A-Z0-9]+\/A))?\s+(A\d{4,5})\s*【(.+?)】\s*$/

const MATERIALS: { ja: string; en: string }[] = [
  { ja: "アルミニウム", en: "Aluminum" },
  { ja: "ステンレススチール", en: "Stainless Steel" },
  { ja: "ステンレス", en: "Stainless Steel" }, // colloquial short form
  { ja: "チタニウム", en: "Titanium" },
  { ja: "チタン", en: "Titanium" }, // colloquial short form
  { ja: "セラミック", en: "Ceramic" },
]

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
}

function regionCode(partNumber: string): string | null {
  const m = partNumber.match(/(\d)([A-Z]+)\/A$/)
  return m ? m[2] : null
}

/** Canonical model name from line word + collection + generation. */
function canonicalModelName(line: string, collection: WatchCollection, generation: number | null): string {
  const compact = line.replace(/\s+/g, "")
  let core: string
  const seriesM = compact.match(/^Series(\d+)$/i)
  const ultraM = compact.match(/^Ultra(\d*)$/i)
  const seM = compact.match(/^SE(\d*)$/i)
  if (seriesM) {
    core = `Series ${seriesM[1]}`
  } else if (ultraM) {
    core = ultraM[1] ? `Ultra ${ultraM[1]}` : "Ultra"
  } else if (seM) {
    if (seM[1]) core = `SE ${seM[1]}` // SE3 -> "SE 3"
    else if (generation && generation >= 2) core = `SE (${ordinal(generation)} gen)` // 【第2世代】SE
    else core = "SE" // 1st gen
  } else {
    core = line
  }
  // model_name OMITS the "Apple" brand prefix (the display layer prepends brand, like iPhone/iPad/Mac;
  // matches the legacy "Watch Series 7" rows) → renders as "Apple Watch Series 7".
  const collectionWord = collection ? `${collection} ` : ""
  return `Watch ${collectionWord}${core}`
}

function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`
}

/** Split the trailing case bracket into { case color (ja), material, band }. */
function parseCaseBracket(spec: string): {
  color_ja: string | null
  color_en: string | null
  material_ja: string | null
  material_en: string | null
  band_ja: string | null
} {
  // Band (if any) follows the FIRST "/" — bands themselves can contain "/" e.g. "(S/M)".
  const slash = spec.indexOf("/")
  const casePartRaw = (slash >= 0 ? spec.slice(0, slash) : spec).trim()
  const band_ja = slash >= 0 ? spec.slice(slash + 1).trim() || null : null

  // Strip the trailing ケース marker.
  let casePart = casePartRaw.replace(/ケース\s*$/, "").trim()

  // Identify the material as a suffix of the case part; remainder is the color token.
  let material_ja: string | null = null
  let material_en: string | null = null
  for (const m of MATERIALS) {
    if (casePart.endsWith(m.ja)) {
      material_ja = m.ja
      material_en = m.en
      casePart = casePart.slice(0, casePart.length - m.ja.length).trim()
      break
    }
  }

  const color_ja = casePart || null
  let color_en = colorJaToEn(color_ja)
  // A bare material with no color word resolves to its standard finish (no guess): plain titanium
  // is "Natural", plain stainless steel is the silver finish (space-black stainless always carries
  // its スペースブラック token explicitly, so an unqualified stainless case is silver).
  if (!color_en && !color_ja) {
    if (material_en === "Titanium") color_en = "Natural"
    else if (material_en === "Stainless Steel") color_en = "Silver"
  }

  return { color_ja, color_en, material_ja, material_en, band_ja }
}

/** Parse one Apple Watch listing-card title into a SKU, or null if it doesn't match the shape. */
export function parseAppleWatchListingTitle(rawTitle: string): AppleWatchListingSku | null {
  if (!rawTitle) return null
  const raw = decodeEntities(rawTitle).replace(/[\s　]+/g, " ").trim()

  // Peel leading 【...】 brackets, capturing 第N世代 (generation) and バンド無し (band-less).
  let rest = raw
  let generation: number | null = null
  let band_less = false
  for (let m = rest.match(LEADING_BRACKET); m; m = rest.match(LEADING_BRACKET)) {
    const inner = m[1]
    const genM = inner.match(/第\s*(\d+)\s*世代/)
    if (genM) generation = parseInt(genM[1], 10)
    if (/バンド\s*無し/.test(inner)) band_less = true
    rest = rest.slice(m[0].length)
  }

  // Require the Apple Watch prefix.
  const awM = rest.match(/^Apple\s+Watch\s+(.*)$/i)
  if (!awM) return null
  const body = awM[1]

  const bm = body.match(BODY_RE)
  if (!bm) return null
  const [, collectionRaw, line, sizeStr, connRaw, part_number, band_part_number, model_number, caseSpec] = bm

  const collection: WatchCollection = collectionRaw
    ? (/herm/i.test(collectionRaw) ? "Hermes" : (collectionRaw as WatchCollection))
    : null
  const model_name = canonicalModelName(line, collection, generation)

  const case_size_mm = parseInt(sizeStr, 10)
  const has_cellular = /cellular/i.test(connRaw)
  const connectivity = has_cellular ? "GPS + Cellular" : "GPS"

  const cb = parseCaseBracket(caseSpec)
  const case_material = cb.material_en
  const form_factor = `${case_size_mm}mm${case_material ? " " + case_material : ""}`
  const region_code = regionCode(part_number)

  return {
    model_name,
    collection,
    generation,
    case_size_mm,
    case_material,
    case_material_ja: cb.material_ja,
    connectivity,
    has_cellular,
    band_less,
    form_factor,
    part_number,
    band_part_number: band_part_number ?? null,
    model_number,
    color_ja: cb.color_ja,
    color_en: cb.color_en,
    band_ja: cb.band_ja,
    region_code,
    is_domestic: region_code == null ? null : region_code === "J",
    raw_title: raw,
  }
}

/** All Apple Watch listing-card <img alt> titles on a page (those with a part#/A, "mm", and a bracket). */
export function extractAppleWatchCardTitles(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<img[^>]*\salt="([^"]*)"/g)) {
    const t = decodeEntities(m[1] ?? "").trim()
    if (t && /Apple\s+Watch/i.test(t) && /[A-Z0-9]+\/A/.test(t) && /\dmm/.test(t) && /【/.test(t)) {
      out.push(t)
    }
  }
  return out
}

/** Parse a full Apple Watch listing page into deduped SKUs (by part_number, first occurrence wins). */
export function parseAppleWatchListingPage(html: string): AppleWatchListingSku[] {
  const byPart = new Map<string, AppleWatchListingSku>()
  for (const title of extractAppleWatchCardTitles(html)) {
    const sku = parseAppleWatchListingTitle(title)
    if (!sku) continue
    if (!byPart.has(sku.part_number)) byPart.set(sku.part_number, sku)
  }
  return [...byPart.values()]
}
