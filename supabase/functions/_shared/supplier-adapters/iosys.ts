import type { NormalizedSupplierProduct, SupplierAdapter } from "./types.ts"
import { colorJaToEn } from "../catalog/apple-colors.ts"

const IMAGE_HOST = "https://d27ea4kkb8flj9.cloudfront.net"

const RANK_TO_GRADE: Record<string, NormalizedSupplierProduct["conditionGrade"]> = {
  "新品": "S",
  "未使用": "S",
  "未使用品": "S",
  "new": "S",
  "s": "S",
  "a": "A",
  "aランク": "A",
  "b": "B",
  "bランク": "B",
  "c": "C",
  "cランク": "C",
  "d": "D",
  "dランク": "D",
  "j": "J",
  "jランク": "J",
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
  const trimmed = rankText.trim()
  const key = trimmed.toLowerCase()
  const direct = RANK_TO_GRADE[key] ?? RANK_TO_GRADE[trimmed]
  if (direct) return direct
  // Tolerate "中古Cランク" / "Cランク" forms reaching this path.
  const m = trimmed.match(/中古\s*([SABCDJ])\s*ランク/i) ?? trimmed.match(/^([SABCDJ])\s*ランク$/i)
  return m ? RANK_TO_GRADE[m[1].toLowerCase()] ?? null : null
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

/** Strip inline tags, decode entities, collapse whitespace. */
function cleanCell(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
}

// iosys 付属品 vocabulary → English. The accessory list is a small, finite set of phrases;
// longest keys are tried first so compound terms (元箱, 取扱説明書, USBケーブル) win over their
// substrings. Unknown tokens are kept verbatim so nothing is silently dropped.
const ACCESSORY_JA_EN: Record<string, string> = {
  "付属品なし": "None",
  "なし": "None",
  "元箱": "Original Box",
  "純正箱": "Original Box",
  "化粧箱": "Box",
  "箱": "Box",
  "取扱説明書": "Manual",
  "取説": "Manual",
  "説明書": "Manual",
  "マニュアル": "Manual",
  "クイックスタートガイド": "Quick Start Guide",
  "保証書": "Warranty Card",
  "純正充電器": "Charger",
  "充電器": "Charger",
  "ACアダプタ": "Power Adapter",
  "ACアダプター": "Power Adapter",
  "電源アダプタ": "Power Adapter",
  "電源アダプター": "Power Adapter",
  "アダプタ": "Adapter",
  "アダプター": "Adapter",
  "USBケーブル": "USB Cable",
  "USB-Cケーブル": "USB-C Cable",
  "充電ケーブル": "Charging Cable",
  "ケーブル": "Cable",
  "イヤホン": "Earphones",
  "イヤフォン": "Earphones",
  "純正イヤホン": "Earphones",
  "SIMピン": "SIM Ejector Pin",
  "SIM取り出しピン": "SIM Ejector Pin",
  "SIMトレイ": "SIM Tray",
  "ケース": "Case",
  "カバー": "Cover",
  "保護フィルム": "Screen Protector",
  "フィルム": "Film",
  "クロス": "Cloth",
  "ステッカー": "Stickers",
  "Apple純正": "Apple Genuine",
  "純正": "Genuine",
}

/**
 * Translate an iosys 付属品 string to English. Splits on the separators iosys uses
 * (／/、,・ and spaces), maps each token via ACCESSORY_JA_EN (longest-key-first), keeps
 * unknown tokens as-is, and re-joins with " / ". Returns null for empty input.
 */
export function translateAccessories(raw: string | null): string | null {
  if (!raw) return null
  const tokens = raw.split(/[\/／、,・\s]+/).map((t) => t.trim()).filter(Boolean)
  if (tokens.length === 0) return null
  const keysByLen = Object.keys(ACCESSORY_JA_EN).sort((a, b) => b.length - a.length)
  const out = tokens.map((tok) => {
    if (ACCESSORY_JA_EN[tok]) return ACCESSORY_JA_EN[tok]
    // Token may be a compound without separators (e.g. "箱マニュアル"): translate the
    // longest known substrings greedily, leaving any unknown remainder verbatim.
    let rest = tok
    let translated = ""
    let matchedAny = false
    while (rest.length > 0) {
      const key = keysByLen.find((k) => rest.startsWith(k))
      if (key) {
        translated += (translated ? " " : "") + ACCESSORY_JA_EN[key]
        rest = rest.slice(key.length)
        matchedAny = true
      } else {
        // consume one char into a pending-unknown buffer
        const next = keysByLen.find((k) => rest.indexOf(k) > 0)
        const cut = next ? rest.indexOf(next) : rest.length
        translated += (translated ? " " : "") + rest.slice(0, cut)
        rest = rest.slice(cut)
      }
    }
    return matchedAny ? translated : tok
  })
  // De-dup consecutive repeats (e.g. two "Manual") while preserving order.
  const deduped = out.filter((v, i) => i === 0 || v !== out[i - 1])
  return deduped.join(" / ") || null
}

/** Parse the <div id="spec"> ... <table> ... </table> into a label->value map. */
function parseSpecTable(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  const block = html.match(/<div[^>]*id="spec"[\s\S]*?<table[\s\S]*?<\/table>/i)
  const scope = block ? block[0] : html
  for (const row of scope.matchAll(/<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
    const label = decodeEntities(row[1].replace(/<[^>]+>/g, "").trim())
    const value = cleanCell(row[2])
    if (label) out[label] = value
  }
  return out
}

/** Extract a Japanese carrier model code (SO-52C, SC-54D, A301SH, XQ-CT44, SCG14...) from text. */
function extractModelNumber(...candidates: (string | null)[]): string | null {
  const re =
    /\b(SO-\d{2}[A-Za-z]+|SOG\d+|SOV\d+|XQ-[A-Z]{2}\d{2}|SC-\d{2}[A-Z]|SCG\d+|SCV\d+|SM-[A-Z0-9]+|SH-(?:RM)?\d+[A-Z]?|SHG\d+|SHV\d+|F-\d{2}[A-Z]|FCG\d+|CPH\d+|OPG\d+|XIG\d+|G[A-Z0-9]{4}|A\d{3}(?:SH|SO|OP|XM|MO|FC)|XT\d{4}-\d|HWV\d+|HW-\d{2}[A-Z])\b/
  for (const c of candidates) {
    if (!c) continue
    const m = c.match(re)
    if (m) return m[1]
  }
  return null
}

/** "5.0インチ" / "6.1 inch" -> 6.1 (numeric). Null if not parseable. */
function parseScreenInches(str: string | null): number | null {
  if (!str) return null
  const m = str.match(/(\d+(?:\.\d+)?)\s*(?:インチ|inch|"|型)/i)
  if (!m) return null
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}

/**
 * Strip trailing Apple part-number / model-code tokens from a captured color segment.
 * iPad titles place the color BEFORE the part number ("128GB ブルー MH314J/A A3459"), so the
 * storage-anchored capture otherwise drags those codes into the color. iPhone titles put the
 * part number BEFORE the storage, so this is a no-op there. Examples removed:
 *   MH314J/A (xxxxx/A part numbers), A3459 (Annnn model codes), MU093VC/A.
 */
function stripTrailingCodes(s: string): string {
  return s
    .replace(/\s+[A-Z0-9]{3,}\/[A-Z](?=\s|$)/g, "") // part numbers like MH314J/A, MU093VC/A
    .replace(/\s+A\d{3,}(?=\s|$)/g, "") // Apple model codes like A3459, A3093
    .replace(/\s+/g, " ")
    .trim()
}

/** "2022年6月" / "2022/06" / "2022" -> 2022. Null if no 4-digit year. */
function parseYear(str: string | null): number | null {
  if (!str) return null
  const m = str.match(/(20\d{2})/)
  return m ? Number(m[1]) : null
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

  // Model number (carrier/region code) — from the URL slug and the title. Anchors the color.
  const modelNumber = extractModelNumber(modelText, title, input)

  // Color: iosys lists the Japanese token. For Apple titles it follows the storage
  // ("128GB ホワイト"); for Android titles there is NO storage token, so fall back to the
  // token after the model number (and before any 【...】 bracket). Keep colorJa raw and derive
  // canonical English (now consulting the Android color maps too). Unknown tokens stay raw.
  let colorJa: string | null = null
  if (title) {
    const storageAnchored = title.match(/\d+\s*(?:GB|TB)\s+([^【|]+)/i)
    if (storageAnchored) {
      colorJa = stripTrailingCodes(decodeEntities(storageAnchored[1].trim())) || null
    } else if (modelNumber) {
      // text after the model number up to the first 【 / | / end
      const afterCode = title.split(modelNumber)[1] ?? ""
      const codeAnchored = afterCode.match(/^\s*([^【|]+)/)
      if (codeAnchored) colorJa = stripTrailingCodes(decodeEntities(codeAnchored[1].trim())) || null
    }
  }
  const color = colorJaToEn(colorJa) ?? colorJa

  // Spec table (<div id="spec"><table>): authoritative for OS/CPU/RAM/ROM/screen/camera/etc.
  const spec = parseSpecTable(html)
  const specRamGb = parseStorage(spec["RAM"] ?? null)
  const specStorageGb = parseStorage(spec["ROM"] ?? spec["容量"] ?? null)

  // Storage: spec table ROM > JSON-LD ストレージ > title token.
  const storageGb =
    specStorageGb ??
    parseStorage(pickSpec(ldDescription, "ストレージ")) ??
    parseStorage(title)

  // RAM: spec table > JSON-LD メモリ.
  const ramGb = specRamGb ?? parseStorage(pickSpec(ldDescription, "メモリ"))

  const specs: NormalizedSupplierProduct["specs"] = {
    os: spec["OS"] ?? null,
    cpu: spec["CPU"] ?? null,
    ramGb: specRamGb,
    storageGb: specStorageGb,
    screenSize: parseScreenInches(spec["ディスプレイ"] ?? null),
    camera: spec["カメラ"] ?? null,
    comms: spec["通信"] ?? null,
    bands: spec["電波帯"] ?? null,
    externalMemory: spec["外部メモリ"] ?? null,
    year: parseYear(spec["発売日"] ?? null),
    ports: spec["接続端子"] ?? null,
  }

  // Rank / condition. The <h1> / meta carry the authoritative listing grade as a 中古Xランク
  // token (the SO-52C page expresses grade ONLY this way; <p class="condition"> blocks lower on
  // the page belong to related products and must not win). Prefer the <h1> token, then the spec
  // table 状態 / JSON-LD 状態, then the legacy <p class="condition"> header, then any body token.
  const h1 = pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/)
  const gradeToken = (s: string | null): string | null => {
    if (!s) return null
    const m = s.match(/中古\s*([SABCDJ])\s*ランク/i)
    return m ? m[1] : null
  }
  const rankText =
    gradeToken(h1) ??
    (spec["状態"] ?? null) ??
    pickSpec(ldDescription, "状態") ??
    pick(html, /<p class="condition">\s*([^<]+?)\s*<\/p>/) ??
    gradeToken(html)
  const conditionGrade = mapRank(rankText)

  // Included accessories (付属品): verbatim text. Spec table first, then the labelled
  // subtitle/content block (the SO-52C page lists it as a <p class="subtitle">付属品</p>
  // followed by a <div class="content"><p>箱/マニュアル</p></div>), then a <td> fallback.
  const includedAccessoriesJa =
    (spec["付属品"] ?? null) ??
    (() => {
      const m = html.match(
        /付属品\s*<\/p>\s*<div[^>]*class="content[^"]*"[^>]*>\s*<p>([\s\S]*?)<\/p>/i,
      )
      return m ? cleanCell(m[1]) || null : null
    })() ??
    (() => {
      const m = html.match(/付属品[\s\S]{0,40}?<td[^>]*>([\s\S]*?)<\/td>/i)
      return m ? cleanCell(m[1]) || null : null
    })()
  // Translate the small finite 付属品 vocabulary to English (unknown tokens kept verbatim),
  // so the field arrives English-ready for the (Filipino) customer-facing side. Still editable.
  const includedAccessories = translateAccessories(includedAccessoriesJa)

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
    modelNumber,
    color,
    colorJa,
    storageGb,
    ramGb,
    rankText,
    conditionGrade,
    supplierPrice,
    stock,
    imageUrls,
    specs,
    includedAccessories,
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
