// Parser for iosys Mac *listing* pages (MacBook Air / Pro, later iMac / mini / Studio).
// Mac titles are the THIRD Apple part#-keyed grammar (after iPhone and iPad). Unlike Android, the
// full config (chip / RAM / SSD / GPU) is printed IN the title's trailing 【...】 bracket, so no
// external spec reference is needed — identity + specs are both read verbatim from iosys. Example
// <img alt> titles:
//   MacBook Air 13インチ MGN63J/A Late 2020 スペースグレイ【Apple M1/16GB/512GB SSD】
//   MacBook Pro 14インチ MRX33J/A Late 2023 スペースブラック【Apple M3 Pro(11コア)/18GB/512GB SSD】
//   MacBook Pro 13インチ MUHR2J/A Mid 2019 シルバー【Core i5(1.4GHz)/16GB/128GB SSD】
//   MacBook Pro 14インチ MDE64J/A Late 2025 シルバー【Apple M5(10コア)/24GB/1TB/10コアGPU】
//
// We parse titles directly and dedupe by part_number. The product_models identity collapses on the
// CONFIG (model, size, chip, RAM, SSD, color) — several part#s share one config; part# is the coarse
// representative (like Android's model_number). Colors via apple-colors.ts; unknowns stay null.

import { colorJaToEn } from "./apple-colors.ts"

export type MacLine = "MacBook Air" | "MacBook Pro" | "MacBook"

export interface MacListingSku {
  model_name: MacLine
  size_inch: number | null // 13 / 14 / 15 / 16
  part_number: string // Apple SKU incl. region suffix, e.g. "MGN63J/A"
  period: string // "Late 2020" / "Mid 2022" / "Early 2025"
  year: number | null // parsed from the period
  chip: string // "Apple M2" / "Apple M3 Pro" / "Core i5" (parenthetical stripped)
  is_intel: boolean
  cpu_cores: number | null // from "(11コア)"; null for Intel/unlabelled
  gpu_cores: number | null // from a trailing "10コアGPU" segment
  ram_gb: number | null
  ssd_gb: number | null // storage in GB (1TB -> 1024)
  color_ja: string | null
  color_en: string | null
  region_code: string | null // J=Japan, LL=USA, ZP=HK/SG, etc.
  is_domestic: boolean | null
  raw_title: string
}

const LEADING_BRACKET = /^【([^】]*)】\s*/
// {line} {size}インチ {PART/A} {Early|Mid|Late} {year} {color_ja} 【config】
const TAIL_RE =
  /^MacBook(?:\s+(Air|Pro))?\s+(\d+(?:\.\d+)?)\s*インチ\s+([A-Z0-9]+\/A)\s+((?:Early|Mid|Late)\s+\d{4})\s+(\S+?)\s*【([^】]+)】\s*$/i

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

function toGb(num: string, unit: string): number | null {
  const n = parseFloat(num)
  if (!Number.isFinite(n)) return null
  return /tb/i.test(unit) ? Math.round(n * 1024) : Math.round(n)
}

/** Parse the trailing config bracket "chip/RAM/SSD[/GPU]" into structured fields. */
function parseConfig(config: string): {
  chip: string
  is_intel: boolean
  cpu_cores: number | null
  ram_gb: number | null
  ssd_gb: number | null
  gpu_cores: number | null
} {
  const segs = config.split("/").map((s) => s.trim()).filter(Boolean)
  const chipRaw = segs[0] ?? ""
  const cpuCoreM = chipRaw.match(/\((\d+)\s*コア\)/)
  const chip = chipRaw.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim()
  const is_intel = /core\s*i/i.test(chip)

  // RAM = first remaining GB-only token; SSD = the next storage token (GB or TB).
  let ram_gb: number | null = null
  let ssd_gb: number | null = null
  for (let i = 1; i < segs.length; i++) {
    const gb = segs[i].match(/^(\d+)\s*GB\b/i)
    const sto = segs[i].match(/^(\d+)\s*(GB|TB)\b/i)
    if (ram_gb == null && gb) {
      ram_gb = parseInt(gb[1], 10)
    } else if (ssd_gb == null && sto) {
      ssd_gb = toGb(sto[1], sto[2])
    }
  }
  const gpuM = config.match(/(\d+)\s*コア\s*GPU/)

  return {
    chip,
    is_intel,
    cpu_cores: cpuCoreM ? parseInt(cpuCoreM[1], 10) : null,
    ram_gb,
    ssd_gb,
    gpu_cores: gpuM ? parseInt(gpuM[1], 10) : null,
  }
}

/** Parse one Mac listing-card title into a SKU, or null if it doesn't match the shape. */
export function parseMacListingTitle(rawTitle: string): MacListingSku | null {
  if (!rawTitle) return null
  const raw = decodeEntities(rawTitle).replace(/[\s　]+/g, " ").trim()

  // Peel leading 【...】 brackets (condition markers, e.g. 【電源アダプタ・ケーブル欠品】).
  let rest = raw
  for (let m = rest.match(LEADING_BRACKET); m; m = rest.match(LEADING_BRACKET)) {
    rest = rest.slice(m[0].length)
  }

  const m = rest.match(TAIL_RE)
  if (!m) return null
  const [, tier, sizeRaw, partNumber, period, colorRaw, config] = m

  const model_name: MacLine = tier
    ? (`MacBook ${tier.replace(/^a/i, "A").replace(/^p/i, "P")}` as MacLine)
    : "MacBook"
  const size_inch = sizeRaw ? parseFloat(sizeRaw) : null
  const yearM = period.match(/(\d{4})/)
  const year = yearM ? parseInt(yearM[1], 10) : null

  const cfg = parseConfig(config)
  const color_ja = colorRaw.trim() || null
  const color_en = colorJaToEn(color_ja)
  const region_code = regionCode(partNumber)

  return {
    model_name,
    size_inch,
    part_number: partNumber,
    period: period.replace(/\s+/g, " ").trim(),
    year,
    chip: cfg.chip,
    is_intel: cfg.is_intel,
    cpu_cores: cfg.cpu_cores,
    gpu_cores: cfg.gpu_cores,
    ram_gb: cfg.ram_gb,
    ssd_gb: cfg.ssd_gb,
    color_ja,
    color_en,
    region_code,
    is_domestic: region_code == null ? null : region_code === "J",
    raw_title: raw,
  }
}

/** All Mac listing-card <img alt> titles on a page (those with a part#/A and an インチ size). */
export function extractMacCardTitles(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<img[^>]*\salt="([^"]*)"/g)) {
    const t = decodeEntities(m[1] ?? "").trim()
    if (t && /MacBook/i.test(t) && /[A-Z0-9]+\/A/.test(t) && /インチ/.test(t)) out.push(t)
  }
  return out
}

/** Parse a full Mac listing page into deduped SKUs (by part_number, first occurrence wins). */
export function parseMacListingPage(html: string): MacListingSku[] {
  const byPart = new Map<string, MacListingSku>()
  for (const title of extractMacCardTitles(html)) {
    const sku = parseMacListingTitle(title)
    if (!sku) continue
    if (!byPart.has(sku.part_number)) byPart.set(sku.part_number, sku)
  }
  return [...byPart.values()]
}
