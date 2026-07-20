// Parser for iosys Microsoft Surface *listing* pages — Surface Go / Pro / Book (tablet path
// items/tablet/windows/surface) and the Surface Laptop family (items/notepc/mobilenote/microsoft/
// surface_laptop). Surface is the second config-in-title shape after Mac: Microsoft's retail SKU
// part number (STV-00012) encodes model+config+color like an Apple part#, and the full config
// (CPU / RAM / storage+type / Windows edition) is printed in the trailing 【...】 bracket — so
// identity = part_number and no per-SKU spec research is needed. Example <img alt> titles:
//   Surface Go2 STV-00012【Pentium(1.7GHz)/4GB/64GB eMMC/Win11Home】            (colorless Go line)
//   Surface Go3 8V6-00015 プラチナ【Pentium(1.1GHz)/4GB/64GB eMMC/Win11Pro】
//   Surface Pro7+ LTE Advanced 1S3-00013 プラチナ【Core i5(2.4GHz)/8GB/256GB SSD/Win11Pro】
//   【電源アダプタ欠品】Surface Pro8 8PX-00010 プラチナ【Core i7(3.0GHz)/16GB/512GB SSD/Win11Pro】
//
// We split each title on the Microsoft part# (head | part | tail): head = model name (+ optional
// "LTE Advanced"), tail = optional JA color + config bracket. Screen size / year are NOT in the
// title — enriched from surface-specs.ts. Go-line cards omit the color; the verified part#→color
// reference (SURFACE_PART_COLORS) fills those, and unverified part#s stay null (never guessed).

export interface SurfaceListingSku {
  model_name: string // canonical, spaced: "Surface Go 2", "Surface Pro 7+", "Surface Laptop Go 2"
  lte: boolean // "LTE Advanced" variant word before the part#
  part_number: string // Microsoft retail SKU, e.g. "STV-00012" — the identity
  chip: string // "Pentium" / "Core m3" / "Core i5" / "SQ1" (GHz parenthetical stripped)
  cpu_ghz: number | null // from "(1.7GHz)"
  ram_gb: number | null
  storage_gb: number | null // 1TB -> 1024
  storage_type: string | null // "eMMC" / "SSD"
  os: string | null // "Win11Home" -> "Windows 11 Home"
  color_ja: string | null
  color_en: string | null
  raw_title: string
}

export const SURFACE_COLORS_JA_EN: Record<string, string> = {
  "プラチナ": "Platinum",
  "ブラック": "Black",
  "マットブラック": "Matte Black",
  "グラファイト": "Graphite",
  "サファイア": "Sapphire",
  "フォレスト": "Forest",
  "アイスブルー": "Ice Blue",
  "サンドストーン": "Sandstone",
  "コバルトブルー": "Cobalt Blue",
  "セージ": "Sage",
  "デューン": "Dune",
  "バーガンディ": "Burgundy",
  "グラファイトゴールド": "Graphite Gold",
}

const LEADING_BRACKET = /^【([^】]*)】\s*/
// Microsoft retail SKU: 3 alphanumerics, dash, 5 digits (STV-00012, 1S3-00013, 8V6-00015).
const PART_SPLIT = /^(.*?)\s*\b([A-Z0-9]{3}-\d{5})\b\s*(.*)$/
const TAIL_RE = /^(.*?)\s*【([^】]+)】/

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
}

function toGb(num: string, unit: string): number | null {
  const n = parseFloat(num)
  if (!Number.isFinite(n)) return null
  return /tb/i.test(unit) ? Math.round(n * 1024) : Math.round(n)
}

/** "Surface Go2" -> "Surface Go 2", "Surface Pro7+" -> "Surface Pro 7+", "Laptop studio" -> title-cased. */
function canonicalModelName(head: string): string | null {
  let s = head.replace(/\s+/g, " ").trim()
  s = s.replace(/^(?:MICROSOFT|Microsoft)\s+/, "")
  if (!/^Surface\b/.test(s)) return null
  // Insert the space Microsoft's official styling uses between the line word and the number
  // ("Go2" -> "Go 2", "Pro7+" -> "Pro 7+", "Laptop2" -> "Laptop 2"). Already-spaced names no-op.
  s = s.replace(/([A-Za-z])(\d)/g, "$1 $2")
  // Title-case lowercase tier words iosys sometimes prints ("Laptop studio" -> "Laptop Studio").
  s = s.replace(/\b(studio|go|pro|book|laptop)\b/g, (w) => w[0].toUpperCase() + w.slice(1))
  return s.replace(/\s+/g, " ").trim()
}

/** "Win11Home" -> "Windows 11 Home"; "Win10Pro" -> "Windows 10 Pro". Null if not a Win token. */
function canonicalOs(seg: string): string | null {
  const m = seg.match(/^Win\s*(\d+)\s*(Home|Pro|S)?$/i)
  if (!m) return null
  return ["Windows", m[1], m[2] ?? ""].filter(Boolean).join(" ")
}

/** Parse the config bracket "chip(GHz)/RAM/storage type/WinNN{Home|Pro}". */
function parseConfig(config: string): {
  chip: string
  cpu_ghz: number | null
  ram_gb: number | null
  storage_gb: number | null
  storage_type: string | null
  os: string | null
} {
  const segs = config.split("/").map((s) => s.trim()).filter(Boolean)
  const chipRaw = segs[0] ?? ""
  const ghzM = chipRaw.match(/\((\d+(?:\.\d+)?)\s*GHz\)/i)
  const chip = chipRaw.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim()

  // RAM then storage: first bare "{n}GB" = RAM; a "{n}GB|TB {type}" token = storage.
  let ram_gb: number | null = null
  let storage_gb: number | null = null
  let storage_type: string | null = null
  let os: string | null = null
  for (let i = 1; i < segs.length; i++) {
    const seg = segs[i]
    const osTok = canonicalOs(seg)
    if (osTok) {
      os = osTok
      continue
    }
    const stoM = seg.match(/^(\d+(?:\.\d+)?)\s*(GB|TB)\b\s*(.*)$/i)
    if (!stoM) continue
    const gb = toGb(stoM[1], stoM[2])
    const type = stoM[3].trim() || null
    if (ram_gb == null && !type && !/tb/i.test(stoM[2])) {
      ram_gb = gb
    } else {
      storage_gb = gb
      storage_type = type
    }
  }
  return { chip, cpu_ghz: ghzM ? parseFloat(ghzM[1]) : null, ram_gb, storage_gb, storage_type, os }
}

/** Parse one Surface listing-card title into a SKU, or null if it doesn't match the shape. */
export function parseSurfaceListingTitle(rawTitle: string): SurfaceListingSku | null {
  if (!rawTitle) return null
  const raw = decodeEntities(rawTitle).replace(/[\s　]+/g, " ").trim()

  // Peel leading 【...】 condition brackets (e.g. 【電源アダプタ欠品】).
  let rest = raw
  for (let m = rest.match(LEADING_BRACKET); m; m = rest.match(LEADING_BRACKET)) {
    rest = rest.slice(m[0].length)
  }

  const pm = rest.match(PART_SPLIT)
  if (!pm) return null
  const [, headRaw, part_number, tail] = pm

  // "LTE Advanced" is a connectivity variant word, not part of the model name.
  const lte = /\bLTE(\s+Advanced)?\s*$/i.test(headRaw.trim())
  const head = headRaw.replace(/\bLTE(\s+Advanced)?\s*$/i, "").trim()
  const model_name = canonicalModelName(head)
  if (!model_name) return null

  const tm = tail.match(TAIL_RE)
  if (!tm) return null
  const [, colorRaw, config] = tm
  const cfg = parseConfig(config)
  if (!cfg.os) return null // every real Surface card ends the bracket with the Windows edition

  const color_ja = colorRaw.trim() || null
  const color_en = color_ja ? SURFACE_COLORS_JA_EN[color_ja] ?? null : null

  return {
    model_name,
    lte,
    part_number,
    chip: cfg.chip,
    cpu_ghz: cfg.cpu_ghz,
    ram_gb: cfg.ram_gb,
    storage_gb: cfg.storage_gb,
    storage_type: cfg.storage_type,
    os: cfg.os,
    color_ja,
    color_en,
    raw_title: raw,
  }
}

/** All Surface listing-card <img alt> titles on a page (part# + config bracket present). */
export function extractSurfaceCardTitles(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<img[^>]*\salt="([^"]*)"/g)) {
    const t = decodeEntities(m[1] ?? "").trim()
    if (t && /Surface/i.test(t) && /[A-Z0-9]{3}-\d{5}/.test(t) && /【[^】]*\/\s*Win/i.test(t)) {
      out.push(t)
    }
  }
  return out
}

/** Parse a full Surface listing page into deduped SKUs (by part_number, first occurrence wins). */
export function parseSurfaceListingPage(html: string): SurfaceListingSku[] {
  const byPart = new Map<string, SurfaceListingSku>()
  for (const title of extractSurfaceCardTitles(html)) {
    const sku = parseSurfaceListingTitle(title)
    if (!sku) continue
    if (!byPart.has(sku.part_number)) byPart.set(sku.part_number, sku)
  }
  return [...byPart.values()]
}
