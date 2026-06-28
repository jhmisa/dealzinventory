// Parser for iosys Mac *listing* pages — MacBook Air/Pro, MacBook, Mac mini, iMac, Mac Studio, Mac
// Pro. Mac titles are the THIRD Apple part#-keyed grammar (after iPhone and iPad). Unlike Android,
// the full config (chip / RAM / SSD / GPU, and the iMac display size) is printed IN the title's
// trailing 【...】 bracket, so no external spec reference is needed — identity + specs are both read
// verbatim from iosys. Example <img alt> titles:
//   MacBook Air 13インチ MGN63J/A Late 2020 スペースグレイ【Apple M1/16GB/512GB SSD】
//   MacBook Pro 14インチ MRX33J/A Late 2023 スペースブラック【Apple M3 Pro(11コア)/18GB/512GB SSD】
//   Mac mini MGNR3J/A Late 2020【Apple M1/8GB/256GB SSD】                       (no size, no color)
//   iMac Retina 4.5K MWUF3J/A Late 2024 ブルー【Apple M4/24inch/16GB/256GB SSD】 (size in bracket)
//   iMac Retina 5K MXWU2J/A Mid2020【Core i5(3.3GHz)/27inch/24GB/512GB SSD】     (no color)
//
// We split each title on the Apple part# (head | part | tail), then parse head (line + MacBook size +
// iMac variant), tail (period + optional color + config bracket). The product_models identity
// collapses on the CONFIG (model, size, chip, RAM, storage, color); part# is the coarse representative.

import { colorJaToEn } from "./apple-colors.ts"

export type MacLine =
  | "MacBook Air"
  | "MacBook Pro"
  | "MacBook"
  | "Mac mini"
  | "iMac"
  | "Mac Studio"
  | "Mac Pro"

export interface MacListingSku {
  model_name: MacLine
  size_inch: number | null // MacBook from {n}インチ; iMac from {n}inch in the bracket
  imac_variant: string | null // "4.5K" / "4K" / "5K" (iMac only)
  part_number: string // Apple SKU incl. region suffix, e.g. "MGN63J/A"
  period: string // "Late 2020" / "Mid 2022" / "Mid2020"
  year: number | null
  chip: string // "Apple M2" / "Apple M3 Pro" / "Core i5" (parenthetical stripped)
  is_intel: boolean
  cpu_cores: number | null // from "(11コア)"
  gpu_cores: number | null // from a trailing "10コアGPU" segment
  ram_gb: number | null
  ssd_gb: number | null // storage in GB (1TB -> 1024)
  storage_type: string | null // "SSD" / "HDD" / "Fusion Drive"
  color_ja: string | null
  color_en: string | null
  region_code: string | null // J=Japan, LL=USA, ZP=HK/SG, etc.
  is_domestic: boolean | null
  raw_title: string
}

const LEADING_BRACKET = /^【([^】]*)】\s*/
const PART_SPLIT = /^(.*?)\s+([A-Z0-9]+\/A)\s+(.*)$/
const TAIL_RE = /^((?:Early|Mid|Late)\s*\d{4})\s*(.*?)\s*【([^】]+)】\s*$/
const SIZE_INCH_JP = /(\d+(?:\.\d+)?)\s*インチ/
const IMAC_VARIANT = /Retina\s+(\d+(?:\.\d+)?K)/i

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

function detectLine(head: string): MacLine | null {
  const s = head.trim()
  if (/^MacBook\s+Air/i.test(s)) return "MacBook Air"
  if (/^MacBook\s+Pro/i.test(s)) return "MacBook Pro"
  if (/^MacBook/i.test(s)) return "MacBook"
  if (/^Mac\s*mini/i.test(s)) return "Mac mini"
  if (/^Mac\s*Studio/i.test(s)) return "Mac Studio"
  if (/^Mac\s*Pro/i.test(s)) return "Mac Pro"
  if (/^iMac/i.test(s)) return "iMac"
  return null
}

/** Parse the trailing config bracket "chip/[size inch/]RAM/storage[ type][/GPU]" into fields. */
function parseConfig(config: string): {
  chip: string
  is_intel: boolean
  cpu_cores: number | null
  size_inch: number | null
  ram_gb: number | null
  ssd_gb: number | null
  storage_type: string | null
  gpu_cores: number | null
} {
  const segs = config.split("/").map((s) => s.trim()).filter(Boolean)
  const chipRaw = segs[0] ?? ""
  const cpuCoreM = chipRaw.match(/\((\d+)\s*コア\)/)
  const chip = chipRaw.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim()
  const is_intel = /core\s*[im]/i.test(chip)

  let size_inch: number | null = null
  const storageTokens: { gb: number | null; type: string | null }[] = []
  for (let i = 1; i < segs.length; i++) {
    const seg = segs[i]
    const inchM = seg.match(/(\d+(?:\.\d+)?)\s*inch/i)
    if (inchM) {
      size_inch = parseFloat(inchM[1])
      continue
    }
    const stoM = seg.match(/^(\d+)\s*(GB|TB)\b\s*(.*)$/i)
    if (stoM) storageTokens.push({ gb: toGb(stoM[1], stoM[2]), type: stoM[3].trim() || null })
  }
  // Order is always RAM then storage: first GB/TB token = RAM, last = storage.
  let ram_gb: number | null = null
  let ssd_gb: number | null = null
  let storage_type: string | null = null
  if (storageTokens.length === 1) {
    ssd_gb = storageTokens[0].gb
    storage_type = storageTokens[0].type
  } else if (storageTokens.length >= 2) {
    ram_gb = storageTokens[0].gb
    const last = storageTokens[storageTokens.length - 1]
    ssd_gb = last.gb
    storage_type = last.type
  }
  const gpuM = config.match(/(\d+)\s*コア\s*GPU/)

  return {
    chip,
    is_intel,
    cpu_cores: cpuCoreM ? parseInt(cpuCoreM[1], 10) : null,
    size_inch,
    ram_gb,
    ssd_gb,
    storage_type,
    gpu_cores: gpuM ? parseInt(gpuM[1], 10) : null,
  }
}

/** Parse one Mac listing-card title into a SKU, or null if it doesn't match the shape. */
export function parseMacListingTitle(rawTitle: string): MacListingSku | null {
  if (!rawTitle) return null
  const raw = decodeEntities(rawTitle).replace(/[\s　]+/g, " ").trim()

  // Peel leading 【...】 condition brackets (e.g. 【電源アダプタ・ケーブル欠品】).
  let rest = raw
  for (let m = rest.match(LEADING_BRACKET); m; m = rest.match(LEADING_BRACKET)) {
    rest = rest.slice(m[0].length)
  }

  // Split on the Apple part number: head | PART/A | tail.
  const pm = rest.match(PART_SPLIT)
  if (!pm) return null
  const [, head, part_number, tail] = pm

  const model_name = detectLine(head)
  if (!model_name) return null

  const tm = tail.match(TAIL_RE)
  if (!tm) return null
  const [, period, colorRaw, config] = tm

  const cfg = parseConfig(config)
  const inchM = head.match(SIZE_INCH_JP)
  const size_inch = inchM ? parseFloat(inchM[1]) : cfg.size_inch
  const imacM = model_name === "iMac" ? head.match(IMAC_VARIANT) : null

  const yearM = period.match(/(\d{4})/)
  const color_ja = colorRaw.trim() || null
  const color_en = colorJaToEn(color_ja)
  const region_code = regionCode(part_number)

  return {
    model_name,
    size_inch,
    imac_variant: imacM ? imacM[1].toUpperCase() : null,
    part_number,
    period: period.replace(/\s+/g, " ").trim(),
    year: yearM ? parseInt(yearM[1], 10) : null,
    chip: cfg.chip,
    is_intel: cfg.is_intel,
    cpu_cores: cfg.cpu_cores,
    gpu_cores: cfg.gpu_cores,
    ram_gb: cfg.ram_gb,
    ssd_gb: cfg.ssd_gb,
    storage_type: cfg.storage_type,
    color_ja,
    color_en,
    region_code,
    is_domestic: region_code == null ? null : region_code === "J",
    raw_title: raw,
  }
}

/** All Mac listing-card <img alt> titles on a page (those with a part#/A and a Mac line word). */
export function extractMacCardTitles(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<img[^>]*\salt="([^"]*)"/g)) {
    const t = decodeEntities(m[1] ?? "").trim()
    if (t && /(MacBook|Mac mini|Mac Studio|Mac Pro|iMac)/i.test(t) && /[A-Z0-9]+\/A/.test(t) && /【/.test(t)) {
      out.push(t)
    }
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
