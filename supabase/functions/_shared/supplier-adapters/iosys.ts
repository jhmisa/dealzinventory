import type { NormalizedSupplierProduct, SupplierAdapter } from "./types.ts"

const IMAGE_HOST = "https://d27ea4kkb8flj9.cloudfront.net"

const RANK_TO_GRADE: Record<string, NormalizedSupplierProduct["conditionGrade"]> = {
  "新品": "S",
  "未使用": "S",
  "未使用品": "S",
  "new": "S",
  "a": "A",
  "aランク": "A",
  "b": "B",
  "bランク": "B",
  "c": "C",
  "cランク": "C",
  "d": "D",
  "dランク": "D",
}

// ---- small local helpers ---------------------------------------------------

function safeHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return null
  }
}

/** First capture group of `regex` against `html`, trimmed, or null. */
function pick(html: string, regex: RegExp): string | null {
  const m = html.match(regex)
  if (!m) return null
  const v = (m[1] ?? "").trim()
  return v.length > 0 ? v : null
}

/** Resolve a possibly-relative image src to an absolute URL. */
function absolutize(src: string, base: string): string {
  if (/^https?:\/\//i.test(src)) return src
  if (src.startsWith("//")) return "https:" + src
  try {
    return new URL(src, base).toString()
  } catch {
    return src
  }
}

/** All matches (capture group 1) of `regex`, deduped, resolved to absolute urls. */
function pickAll(html: string, regex: RegExp, base: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of html.matchAll(regex)) {
    const raw = (m[1] ?? "").trim()
    if (!raw) continue
    const abs = absolutize(raw, base)
    if (!seen.has(abs)) {
      seen.add(abs)
      out.push(abs)
    }
  }
  return out
}

/** "¥104,800" / "104,800円" / "104800" -> 104800. Null if no digits. */
function parseYen(str: string | null): number | null {
  if (!str) return null
  const digits = str.replace(/[^\d]/g, "")
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}

/** "128GB" -> 128, "1TB" -> 1024, "512 GB" -> 512. Null if not parseable. */
function parseStorage(str: string | null): number | null {
  if (!str) return null
  const m = str.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB)/i)
  if (!m) return null
  const value = parseFloat(m[1])
  if (!Number.isFinite(value)) return null
  const unit = m[2].toUpperCase()
  if (unit === "TB") return Math.round(value * 1024)
  if (unit === "MB") return Math.round(value / 1024)
  return Math.round(value)
}

function mapRank(rankText: string | null): NormalizedSupplierProduct["conditionGrade"] {
  if (!rankText) return null
  const key = rankText.trim().toLowerCase()
  return RANK_TO_GRADE[key] ?? RANK_TO_GRADE[rankText.trim()] ?? null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
}

/** Pull a value from the JSON-LD Product description string (e.g. "ストレージ:128GB"). */
function pickSpec(description: string | null, label: string): string | null {
  if (!description) return null
  const re = new RegExp(label + "\\s*[:：]\\s*([^\\s]+)")
  const m = description.match(re)
  return m ? m[1].trim() : null
}

// ---- adapter ---------------------------------------------------------------

function extractCode(input: string): string | null {
  if (!input) return null
  const trimmed = input.trim()
  // bare numeric string
  if (/^\d{4,}$/.test(trimmed)) return trimmed
  // trailing numeric path segment: strip query/hash, then take the last
  // path component if it is purely numeric (avoids matching digits embedded
  // in model slugs like "iphone15_plus_a3093").
  const pathOnly = trimmed.split(/[?#]/)[0].replace(/\/+$/, "")
  const lastSeg = pathOnly.split("/").pop() ?? ""
  if (/^\d{4,}$/.test(lastSeg)) return lastSeg
  return null
}

function parse(html: string, input: string): NormalizedSupplierProduct {
  const sourceUrl = input
  const supplierProductCode = extractCode(input) ?? ""

  // Prefer the Product JSON-LD block (robust, structured).
  let ld: Record<string, unknown> | null = null
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const obj = JSON.parse(m[1].trim())
      if (obj && obj["@type"] === "Product") {
        ld = obj as Record<string, unknown>
        break
      }
    } catch {
      // ignore malformed block
    }
  }

  const ldName = ld && typeof ld.name === "string" ? (ld.name as string) : null
  const ldDescription = ld && typeof ld.description === "string" ? (ld.description as string) : null
  const ldBrand =
    ld && ld.brand && typeof (ld.brand as Record<string, unknown>).name === "string"
      ? ((ld.brand as Record<string, unknown>).name as string)
      : null
  const ldOffers = (ld?.offers ?? null) as Record<string, unknown> | null
  const ldPrice =
    ldOffers && (typeof ldOffers.price === "string" || typeof ldOffers.price === "number")
      ? String(ldOffers.price)
      : null

  // Title: JSON-LD name, fall back to og:title / h1.
  const title =
    ldName ??
    pick(html, /<meta property="og:title" content="([^"]+)"/) ??
    pick(html, /<h1[^>]*>([^<]+)<\/h1>/)
  const modelText = title ? decodeEntities(title.split("|")[0].split("【")[0].trim()) : null

  const brandText = ldBrand ? decodeEntities(ldBrand) : null

  // Color: from the title (storage token followed by a color word before any 【...】 bracket).
  let color: string | null = null
  if (title) {
    const cm = title.match(/\d+\s*(?:GB|TB)\s+([^【|]+)/i)
    if (cm) color = decodeEntities(cm[1].trim())
  }

  // Storage: from JSON-LD spec description ("ストレージ:128GB"), fall back to title.
  const storageGb =
    parseStorage(pickSpec(ldDescription, "ストレージ")) ?? parseStorage(title)

  // RAM: not surfaced on iOS device pages; attempt spec, else null.
  const ramGb = parseStorage(pickSpec(ldDescription, "メモリ"))

  // Rank / condition: the main item header carries <p class="condition">新品</p>.
  const rankText =
    pick(html, /<p class="condition">\s*([^<]+?)\s*<\/p>/) ??
    pickSpec(ldDescription, "状態")
  const conditionGrade = mapRank(rankText)

  // Price: prefer JSON-LD, fall back to the visible price block.
  const supplierPrice =
    parseYen(ldPrice) ?? parseYen(pick(html, /<div class="price">[\s\S]*?<p>([\d,]+)/))

  // Stock: main item total stock count "総在庫数：272".
  const stock = (() => {
    const m = html.match(/総在庫数[：:]\s*(\d+)/)
    return m ? Number(m[1]) : null
  })()

  // Gallery: this product's own images are keyed by its code (e.g. 384323_1_L.jpg).
  // Pull both JSON-LD images and the main gallery <img>/data-src refs for this code.
  const imageUrls = (() => {
    const seen = new Set<string>()
    const out: string[] = []
    const add = (u: string) => {
      if (!seen.has(u)) {
        seen.add(u)
        out.push(u)
      }
    }
    // JSON-LD image array
    if (ld && Array.isArray(ld.image)) {
      for (const i of ld.image as unknown[]) {
        if (typeof i === "string") add(absolutize(i, sourceUrl))
      }
    } else if (ld && typeof ld.image === "string") {
      add(absolutize(ld.image as string, sourceUrl))
    }
    // Gallery refs scoped to this product code (data-src or src on cloudfront host).
    if (supplierProductCode) {
      const re = new RegExp(
        `(${IMAGE_HOST.replace(/[.]/g, "\\.")}/${supplierProductCode}_[0-9]+_[LMS]\\.jpg)`,
        "g",
      )
      for (const u of pickAll(html, re, sourceUrl)) add(u)
    }
    return out
  })()

  return {
    supplierKey: "iosys",
    supplierProductCode,
    sourceUrl,
    brandText,
    modelText,
    color,
    storageGb,
    ramGb,
    rankText,
    conditionGrade,
    supplierPrice,
    stock,
    imageUrls,
  }
}

export const iosysAdapter: SupplierAdapter = {
  key: "iosys",
  matches(url: string): boolean {
    const host = safeHost(url)
    return host !== null && (host === "iosys.co.jp" || host.endsWith(".iosys.co.jp"))
  },
  extractCode,
  parse,
}
