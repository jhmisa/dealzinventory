// Parser for iosys AirPods *listing* pages. AirPods is the FIFTH (and final) Apple part#-keyed
// grammar (after iPhone, iPad, Mac, Watch). It is the SIMPLEST: identity = part_number (each Apple
// SKU is a genuinely distinct product — no band explosion like Watch, so NO collapse). The chip/year
// are not reliably in the title, so a small verified reference (`airpods-specs.ts`) enriches them
// (a title 【year】 marker overrides). Only AirPods Max has color variants; all earbuds are White.
//
// Example <img alt> titles:
//   AirPods Pro MWP22J/A
//   AirPods Pro MLWK3J/A【2021】
//   AirPods Pro2 MTJV3J/A【2023】          (2023 USB-C refresh — distinguished by part# + year)
//   AirPods Pro3 MFHP4J/A
//   AirPods4 MXP63J/A【2024年モデル】
//   AirPods4 アクティブノイズキャンセリング搭載 MXP93J/A【2024年モデル】   (ANC variant)
//   AirPods Max (USB-C) パープル MWW83ZA/A
//   AirPods Max 2 オレンジ MHWN4ZA/A        (REAL 2026 H2 model — NOT the 2024 USB-C Max)
//   【第2世代】AirPods with Charging Case MV7N2J/A
//   【第2世代】AirPods with Wireless Charging Case MRXJ2J/A
//   【第3世代】AirPods Lightning充電ケース付き MPNY3J/A
//   【箱傷み】AirPods Pro3 MFHP4J/A          (leading condition bracket — dropped)

// AirPods Max color map (the only AirPods line with colors). Research-verified 2026-07-01 from
// apple.com/jp store titles; original 2020 palette + the shared 2024 USB-C / Max-2 palette.
export const AIRPODS_MAX_COLORS_JA_EN: Record<string, string> = {
  "スペースグレイ": "Space Gray", // Apple JP house style ends in イ
  "シルバー": "Silver",
  "スカイブルー": "Sky Blue",
  "ピンク": "Pink",
  "グリーン": "Green",
  "ミッドナイト": "Midnight",
  "スターライト": "Starlight",
  "ブルー": "Blue",
  "パープル": "Purple",
  "オレンジ": "Orange",
}

export interface AirPodsListingSku {
  model_name: string // canonical, e.g. "AirPods Pro 2", "AirPods Max (USB-C)", "AirPods (2nd gen)"
  generation: number | null // from a leading 【第N世代】 (regular AirPods 2nd/3rd gen)
  year: number | null // from a trailing 【2021】/【2023】/【2024年モデル】 marker (overrides spec ref)
  part_number: string // primary Apple SKU incl. region suffix, e.g. "MWP22J/A" — the IDENTITY
  color_ja: string | null // Max case color JP token (null for white earbuds)
  color_en: string // canonical EN color ("White" for all non-Max AirPods)
  region_code: string | null // J=Japan, AM=Americas, ZA=Asia-Pacific, KH=…
  is_domestic: boolean | null
  raw_title: string
}

const LEADING_BRACKET = /^【([^】]*)】\s*/
const PART_RE = /\b([A-Z0-9]{5,}\/A)\b/
const TRAILING_YEAR = /【\s*(\d{4})\s*年?\s*(?:モデル)?\s*】\s*$/

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

function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`
}

/** Parse one AirPods listing-card title into a SKU, or null if it doesn't match the shape. */
export function parseAirPodsListingTitle(rawTitle: string): AirPodsListingSku | null {
  if (!rawTitle) return null
  const raw = decodeEntities(rawTitle).replace(/[\s　]+/g, " ").trim()

  // Peel leading 【...】 brackets, capturing 第N世代 (generation); ignore condition markers (箱傷み …).
  let rest = raw
  let generation: number | null = null
  for (let m = rest.match(LEADING_BRACKET); m; m = rest.match(LEADING_BRACKET)) {
    const genM = m[1].match(/第\s*(\d+)\s*世代/)
    if (genM) generation = parseInt(genM[1], 10)
    rest = rest.slice(m[0].length)
  }

  // A trailing 【year】 marker (overrides the spec-ref year).
  let year: number | null = null
  const ym = rest.match(TRAILING_YEAR)
  if (ym) {
    year = parseInt(ym[1], 10)
    rest = rest.slice(0, ym.index).trim()
  }

  // The part# is the identity; everything before it is "AirPods" + descriptor (+ Max color).
  const pm = rest.match(PART_RE)
  if (!pm || pm.index == null) return null
  const part_number = pm[1]
  const descriptorFull = rest.slice(0, pm.index).trim()

  // Must be an AirPods card; strip the "AirPods" prefix (may be glued: "AirPods4").
  const apM = descriptorFull.match(/^AirPods\s*(.*)$/i)
  if (!apM) return null
  const d = apM[1].trim()

  let model_name: string
  let color_ja: string | null = null
  let color_en = "White" // all AirPods earbuds are white; only Max carries a color

  if (/^Max\b/i.test(d)) {
    // AirPods Max — model token then an optional color token.
    let rafter: string
    if (/^Max\s*\(\s*USB-?C\s*\)/i.test(d)) {
      model_name = "AirPods Max (USB-C)"
      rafter = d.replace(/^Max\s*\(\s*USB-?C\s*\)\s*/i, "")
    } else if (/^Max\s*2\b/i.test(d)) {
      model_name = "AirPods Max 2"
      rafter = d.replace(/^Max\s*2\s*/i, "")
    } else {
      model_name = "AirPods Max"
      rafter = d.replace(/^Max\s*/i, "")
    }
    const colorText = rafter.trim()
    if (colorText) {
      color_ja = colorText
      color_en = AIRPODS_MAX_COLORS_JA_EN[colorText] ?? colorText // unmapped → keep token (flagged)
    } else {
      color_en = "—" // a Max card with no color token (shouldn't happen) — never guess
    }
  } else if (/^Pro\s*3\b/i.test(d)) {
    model_name = "AirPods Pro 3"
  } else if (/^Pro\s*2\b/i.test(d)) {
    model_name = "AirPods Pro 2"
  } else if (/^Pro\b/i.test(d)) {
    model_name = "AirPods Pro"
  } else if (/^4\b/.test(d)) {
    // AirPods 4 — plain or the ANC ("アクティブノイズキャンセリング搭載") variant.
    model_name = /アクティブノイズキャンセリング|ANC/i.test(d) ? "AirPods 4 (ANC)" : "AirPods 4"
  } else {
    // Regular AirPods (1st/2nd/3rd gen) — generation comes from the leading 【第N世代】 bracket.
    if (generation == null) return null // no gen marker → can't identify a plain "AirPods" card
    const wireless = /Wireless/i.test(d)
    model_name = `AirPods (${ordinal(generation)} gen)` +
      (wireless ? " (Wireless Charging Case)" : "")
  }

  const region_code = regionCode(part_number)
  return {
    model_name,
    generation,
    year,
    part_number,
    color_ja,
    color_en,
    region_code,
    is_domestic: region_code == null ? null : region_code === "J",
    raw_title: raw,
  }
}

/** All AirPods listing-card <img alt> titles on a page (those bearing a part#). */
export function extractAirPodsCardTitles(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<img[^>]*\salt="([^"]*)"/g)) {
    const t = decodeEntities(m[1] ?? "").trim()
    if (t && /AirPods/i.test(t) && PART_RE.test(t)) out.push(t)
  }
  return out
}

/** Parse a full AirPods listing page into deduped SKUs (by part_number, first occurrence wins). */
export function parseAirPodsListingPage(html: string): AirPodsListingSku[] {
  const byPart = new Map<string, AirPodsListingSku>()
  for (const title of extractAirPodsCardTitles(html)) {
    const sku = parseAirPodsListingTitle(title)
    if (!sku) continue
    if (!byPart.has(sku.part_number)) byPart.set(sku.part_number, sku)
  }
  return [...byPart.values()]
}
