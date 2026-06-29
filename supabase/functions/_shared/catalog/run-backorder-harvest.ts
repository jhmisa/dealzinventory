// Backorder-candidate harvester.
//
// Unlike run-harvest-local.ts (which captures MODEL IDENTITY for product_models), this crawl
// captures per-LISTING facts iosys exposes on each card — condition rank, stock count, price,
// detail URL, accessories — so we can populate the BACKORDER (backorder_lines) with desirable,
// sourceable SKUs: Grade S (新品/未使用) or A (中古Aランク), with MORE THAN ONE unit in stock.
//
// Each iosys card is a <form id="form_NNNN"> with hidden inputs (gn/name/rank/spec/url) followed
// by a body carrying 在庫数 (stock) + price. We parse those directly, then reuse the existing
// per-pipeline single-title parsers (parseListingTitle / parseAndroidListingTitle /
// parseAppleWatchListingTitle) to derive model identity from the title.
//
// Output: SQL that (re)loads a staging table `iosys_backorder_candidates`. A follow-up data-op
// matches candidates -> product_models and inserts backorder_lines (dedup-guarded). Supabase is
// CLI-only here — this script never touches the DB.
//
// Usage (from supabase/functions/_shared/catalog):
//   deno run --allow-net run-backorder-harvest.ts                 > /tmp/backorder.sql 2>/tmp/bo.log
//   deno run --allow-net run-backorder-harvest.ts iphone watch    > /tmp/bo.sql        # subset
//   deno run --allow-read run-backorder-harvest.ts --fixtures     # offline parser smoke-test

import { type Carrier, parseListingTitle } from "./iosys-listing.ts"
import {
  type AndroidBrandConfig,
  AQUOS_CONFIG,
  ARROWS_CONFIG,
  ASUS_CONFIG,
  GALAXY_CONFIG,
  HUAWEI_CONFIG,
  MOTOROLA_CONFIG,
  OPPO_CONFIG,
  parseAndroidListingTitle,
  PIXEL_CONFIG,
  XIAOMI_CONFIG,
  XPERIA_CONFIG,
} from "./android-listing.ts"
import { parseAppleWatchListingTitle } from "./apple-watch-listing.ts"

const BASE_URL = "https://iosys.co.jp"
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

// ---- common normalized identity across all three pipelines ----------------

interface Identity {
  brand: string
  model_name: string
  model_number: string | null
  part_number: string | null
  storage_gb: number | null
  color_ja: string | null
  color_en: string | null
  is_unlocked: boolean | null
}

// ---- per-card listing facts (parsed from the <form> + body) ---------------

interface CardMeta {
  code: string // iosys gn, e.g. "412256"
  title: string // hidden name="name"
  rankText: string // hidden name="rank", e.g. "中古Aランク" / "未使用品"
  url: string // detail path
  stock: number | null // 在庫数：N (units of THIS exact listing)
  price: number | null // card price (¥) = supplier cost
  accessoriesJa: string | null // 付属品: ...
  imageUrl: string | null
}

// ---- condition rank -> grade ----------------------------------------------

function rankToGrade(rankText: string): "S" | "A" | "B" | "C" | "D" | "J" | null {
  const t = rankText.trim()
  if (/新品|未使用/.test(t)) return "S"
  const m = t.match(/中古\s*([SABCDJ])\s*ランク/i) ?? t.match(/^([SABCDJ])\s*ランク$/i)
  if (m) return m[1].toUpperCase() as "S" | "A" | "B" | "C" | "D" | "J"
  return null
}

// ---- card parsing ----------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
}

function hidden(chunk: string, name: string): string | null {
  const m = chunk.match(new RegExp(`name="${name}"\\s+value="([^"]*)"`))
  return m ? decodeEntities(m[1].trim()) : null
}

/** Parse every product card on a listing page into CardMeta, in document order. */
export function parseCards(html: string): CardMeta[] {
  const out: CardMeta[] = []
  // Each card opens with <form id="form_NNNN"> — split there so each chunk holds one card's
  // hidden inputs AND its trailing body (stock/price), up to the next card's form.
  const parts = html.split(/<form id="form_/)
  for (let i = 1; i < parts.length; i++) {
    const chunk = "form_" + parts[i]
    const code = (chunk.match(/^form_(\d+)/) ?? [])[1] ?? hidden(chunk, "gn")
    const title = hidden(chunk, "name")
    const url = hidden(chunk, "url")
    const rankText = hidden(chunk, "rank")
    if (!code || !title || !url || !rankText) continue // not a SKU card
    const stockM = chunk.match(/在庫数[：:]\s*(\d+)/)
    const priceM = chunk.match(/class="price">[\s\S]*?<p>\s*([\d,]+)/)
    const accM = chunk.match(/付属品[:：]\s*([^<]+?)\s*</)
    const imgM =
      chunk.match(new RegExp(`(https://[^"']*?/${code}_\\d+_[LMS]\\.jpg)`)) ??
      chunk.match(new RegExp(`(https://[^"']*?/${code}_\\d+_[LMS]\\.webp)`))
    out.push({
      code,
      title,
      rankText,
      url: url.startsWith("http") ? url : BASE_URL + url,
      stock: stockM ? Number(stockM[1]) : null,
      price: priceM ? Number(priceM[1].replace(/,/g, "")) : null,
      accessoriesJa: accM ? accM[1].trim() : null,
      imageUrl: imgM ? imgM[1] : null,
    })
  }
  return out
}

// ---- iPhone model floor: include iPhone X and newer (+ SE 2nd/3rd gen) -----

function iphoneAtOrAboveX(modelName: string): boolean {
  const n = modelName.toLowerCase()
  if (/iphone\s*(x|xr|xs)/.test(n)) return true // X / XR / XS / XS Max
  const numM = n.match(/iphone\s*(\d{2})/) // 11..17
  if (numM && Number(numM[1]) >= 11) return true
  // SE: only 2nd (2020) / 3rd (2022) gen, not the 2016 original.
  if (/iphone\s*se/.test(n) && /(2nd|3rd|2020|2022|第[23]世代)/.test(n)) return true
  return false
}

// ---- category registry -----------------------------------------------------

interface Category {
  key: string
  device: "IPHONE" | "ANDROID" | "WATCH"
  brand: string
  pathPrefix: string
  sections: { path: string; carrier: Carrier | null }[]
  identityFromTitle: (title: string, carrier: Carrier | null) => Identity | null
  modelFloor?: (modelName: string) => boolean
}

const ANDROID_SECTIONS: { path: string; carrier: Carrier | null }[] = [
  { path: "simfree", carrier: "SIM-Free" },
  { path: "docomo", carrier: "docomo" },
  { path: "au", carrier: "au" },
  { path: "softbank", carrier: "SoftBank" },
  { path: "rakuten", carrier: "Rakuten" },
]

function androidCat(brand: string, path: string, config: AndroidBrandConfig): Category {
  return {
    key: path.split("/").pop()!,
    device: "ANDROID",
    brand,
    pathPrefix: path,
    sections: ANDROID_SECTIONS,
    identityFromTitle: (title, carrier) => {
      const sku = parseAndroidListingTitle(title, config, carrier)
      if (!sku) return null
      return {
        brand: sku.brand,
        model_name: sku.model_name,
        model_number: sku.model_number,
        part_number: null,
        storage_gb: sku.storage_gb,
        color_ja: sku.color_ja,
        color_en: sku.color_en,
        is_unlocked: sku.is_unlocked,
      }
    },
  }
}

const CATEGORIES: Category[] = [
  {
    key: "iphone",
    device: "IPHONE",
    brand: "Apple",
    pathPrefix: "items/smartphone/iphone",
    sections: [
      { path: "simfree", carrier: "SIM-Free" },
      { path: "docomo", carrier: "docomo" },
      { path: "au", carrier: "au" },
      { path: "softbank", carrier: "SoftBank" },
      { path: "rakuten", carrier: "Rakuten" },
    ],
    identityFromTitle: (title, carrier) => {
      const sku = parseListingTitle(title, carrier)
      if (!sku) return null
      return {
        brand: "Apple",
        model_name: sku.model_name,
        model_number: sku.model_number,
        part_number: sku.part_number,
        storage_gb: sku.storage_gb,
        color_ja: sku.color_ja,
        color_en: sku.color_en,
        is_unlocked: sku.is_unlocked,
      }
    },
    modelFloor: iphoneAtOrAboveX,
  },
  androidCat("Samsung", "items/smartphone/galaxy", GALAXY_CONFIG),
  androidCat("Sony", "items/smartphone/xperia", XPERIA_CONFIG),
  androidCat("Sharp", "items/smartphone/aquos", AQUOS_CONFIG),
  androidCat("Google", "items/smartphone/pixel", PIXEL_CONFIG),
  androidCat("Xiaomi", "items/smartphone/xiaomi", XIAOMI_CONFIG),
  androidCat("Oppo", "items/smartphone/oppo", OPPO_CONFIG),
  androidCat("Fujitsu", "items/smartphone/arrows", ARROWS_CONFIG),
  androidCat("Huawei", "items/smartphone/huawei", HUAWEI_CONFIG),
  androidCat("ASUS", "items/smartphone/zenfone", ASUS_CONFIG),
  androidCat("ASUS", "items/smartphone/rog", ASUS_CONFIG),
  androidCat("Motorola", "items/smartphone/motorola", MOTOROLA_CONFIG),
  {
    key: "watch",
    device: "WATCH",
    brand: "Apple",
    pathPrefix: "items/wearable/apple",
    sections: [{ path: "", carrier: null }],
    identityFromTitle: (title) => {
      const sku = parseAppleWatchListingTitle(title)
      if (!sku) return null
      return {
        brand: "Apple",
        model_name: sku.model_name,
        model_number: sku.model_number,
        part_number: sku.part_number,
        storage_gb: null,
        color_ja: sku.color_ja,
        color_en: sku.color_en,
        is_unlocked: null,
      }
    },
  },
]

// ---- a fully-resolved candidate row ---------------------------------------

interface Candidate extends Identity {
  iosys_code: string
  device: string
  section: string
  title: string
  carrier: Carrier | null
  grade: "S" | "A"
  rank_text: string
  stock: number
  supplier_price: number | null
  accessories_ja: string | null
  image_url: string | null
  supplier_url: string
}

// ---- crawl -----------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface CrawlOpts {
  fetchPage: (url: string) => Promise<string>
  maxPagesPerSection?: number
  throttleMs?: number
  log?: (m: string) => void
}

async function crawl(categories: Category[], opts: CrawlOpts): Promise<Candidate[]> {
  const maxPages = opts.maxPagesPerSection ?? 25
  const throttle = opts.throttleMs ?? 500
  const log = opts.log ?? (() => {})
  const byCode = new Map<string, Candidate>()

  for (const cat of categories) {
    for (const section of cat.sections) {
      const sectionUrl = section.path
        ? `${BASE_URL}/${cat.pathPrefix}/${section.path}`
        : `${BASE_URL}/${cat.pathPrefix}`
      let kept = 0
      for (let page = 1; page <= maxPages; page++) {
        // sort=vh => "在庫が多い順" (stock descending). We walk down until a whole page has no
        // card with stock>=2, then stop — the rest of the (globally sorted) section is stock<2.
        const url = page === 1
          ? `${sectionUrl}?sort=vh`
          : `${sectionUrl}?sort=vh&page=${page}`
        let html: string
        try {
          html = await opts.fetchPage(url)
        } catch (e) {
          log(`[${cat.key}/${section.path}] page ${page} fetch error: ${(e as Error).message}`)
          break
        }
        const cards = parseCards(html)
        if (cards.length === 0) {
          log(`[${cat.key}/${section.path}] page ${page}: 0 cards — end of section`)
          break
        }
        const pageHasStock = cards.some((c) => (c.stock ?? 0) >= 2)
        if (!pageHasStock) {
          log(`[${cat.key}/${section.path}] page ${page}: no card stock≥2 — past the head, stopping`)
          break
        }
        let keptOnPage = 0
        for (const card of cards) {
          const grade = rankToGrade(card.rankText)
          if (grade !== "S" && grade !== "A") continue // only S (new/unused) + A (美品)
          if (!card.stock || card.stock < 2) continue // MORE THAN ONE in stock
          const id = cat.identityFromTitle(card.title, section.carrier)
          if (!id) continue
          if (cat.modelFloor && !cat.modelFloor(id.model_name)) continue
          // SIM-free section, or carrier-unlocked elsewhere.
          const eligibleLock = section.path === "simfree" || section.path === "" || id.is_unlocked === true
          if (!eligibleLock) continue
          if (byCode.has(card.code)) continue
          byCode.set(card.code, {
            ...id,
            iosys_code: card.code,
            device: cat.device,
            section: section.path || "(none)",
            title: card.title,
            carrier: section.carrier,
            grade,
            rank_text: card.rankText,
            stock: card.stock,
            supplier_price: card.price,
            accessories_ja: card.accessoriesJa,
            image_url: card.imageUrl,
            supplier_url: card.url,
          })
          keptOnPage++
          kept++
        }
        log(
          `[${cat.key}/${section.path}] page ${page}: ${cards.length} cards, ${keptOnPage} kept (S/A, stock≥2, unlocked)`,
        )
        if (page < maxPages) await sleep(throttle)
      }
      if (kept > 0) log(`[${cat.key}/${section.path}] => ${kept} candidates`)
    }
  }
  return [...byCode.values()]
}

// ---- SQL emission ----------------------------------------------------------

function sqlStr(v: string | null): string {
  if (v == null) return "NULL"
  return "'" + v.replace(/'/g, "''") + "'"
}
function sqlNum(v: number | null): string {
  return v == null || !Number.isFinite(v) ? "NULL" : String(v)
}
function sqlBool(v: boolean | null): string {
  return v == null ? "NULL" : v ? "TRUE" : "FALSE"
}

function emitSql(rows: Candidate[]): string {
  const lines: string[] = []
  lines.push("-- iosys backorder candidates (Grade S/A, stock>=2, SIM-free + carrier-unlocked)")
  lines.push("-- Generated by run-backorder-harvest.ts. Re-runnable: TRUNCATE + reload.")
  lines.push(`CREATE TABLE IF NOT EXISTS public.iosys_backorder_candidates (
  iosys_code text PRIMARY KEY,
  device text NOT NULL,
  section text,
  brand text,
  model_name text,
  model_number text,
  part_number text,
  storage_gb integer,
  color_ja text,
  color_en text,
  carrier text,
  is_unlocked boolean,
  grade text NOT NULL,
  rank_text text,
  stock integer,
  supplier_price integer,
  accessories_ja text,
  image_url text,
  supplier_url text,
  title text,
  harvested_at timestamptz NOT NULL DEFAULT now()
);`)
  lines.push("TRUNCATE public.iosys_backorder_candidates;")
  for (const r of rows) {
    lines.push(
      `INSERT INTO public.iosys_backorder_candidates ` +
        `(iosys_code, device, section, brand, model_name, model_number, part_number, storage_gb, color_ja, color_en, carrier, is_unlocked, grade, rank_text, stock, supplier_price, accessories_ja, image_url, supplier_url, title) VALUES (` +
        [
          sqlStr(r.iosys_code),
          sqlStr(r.device),
          sqlStr(r.section),
          sqlStr(r.brand),
          sqlStr(r.model_name),
          sqlStr(r.model_number),
          sqlStr(r.part_number),
          sqlNum(r.storage_gb),
          sqlStr(r.color_ja),
          sqlStr(r.color_en),
          sqlStr(r.carrier),
          sqlBool(r.is_unlocked),
          sqlStr(r.grade),
          sqlStr(r.rank_text),
          sqlNum(r.stock),
          sqlNum(r.supplier_price),
          sqlStr(r.accessories_ja),
          sqlStr(r.image_url),
          sqlStr(r.supplier_url),
          sqlStr(r.title),
        ].join(", ") +
        ");",
    )
  }
  return lines.join("\n") + "\n"
}

// ---- main ------------------------------------------------------------------

async function main() {
  const args = [...Deno.args]
  const fixtureMode = args.includes("--fixtures")
  const wanted = args.filter((a) => !a.startsWith("--"))
  const cats = wanted.length > 0
    ? CATEGORIES.filter((c) => wanted.includes(c.key) || wanted.includes(c.device.toLowerCase()))
    : CATEGORIES

  if (fixtureMode) {
    // Offline smoke-test: parse the iPhone simfree fixture and report kept candidates.
    const html = await Deno.readTextFile("__fixtures__/iosys-iphone-simfree-p1.html")
    const cards = parseCards(html)
    console.error(`fixture cards parsed: ${cards.length}`)
    const iphone = CATEGORIES.find((c) => c.key === "iphone")!
    let kept = 0
    for (const card of cards) {
      const grade = rankToGrade(card.rankText)
      const id = iphone.identityFromTitle(card.title, "SIM-Free")
      const ok = (grade === "S" || grade === "A") && (card.stock ?? 0) >= 2 && id && iphoneAtOrAboveX(id.model_name)
      if (ok) {
        kept++
        console.error(
          `  KEEP ${card.code} g=${grade} stock=${card.stock} ¥${card.price} | ${id!.model_name} ${id!.storage_gb}GB ${id!.color_en ?? id!.color_ja} (${id!.part_number})`,
        )
      }
    }
    console.error(`fixture kept (S/A, stock>=2, >=X): ${kept}`)
    return
  }

  const log = (m: string) => console.error(m)
  const rows = await crawl(cats, {
    fetchPage: async (url) => {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja,en;q=0.8" } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    },
    log,
  })

  // Summary to stderr; SQL to stdout.
  const byDevice: Record<string, number> = {}
  const byGrade: Record<string, number> = {}
  for (const r of rows) {
    byDevice[r.device] = (byDevice[r.device] ?? 0) + 1
    byGrade[r.grade] = (byGrade[r.grade] ?? 0) + 1
  }
  log(`\n=== HARVEST STATS ===`)
  log(`total candidates: ${rows.length}`)
  log(`by device: ${JSON.stringify(byDevice)}`)
  log(`by grade:  ${JSON.stringify(byGrade)}`)
  console.log(emitSql(rows))
}

if (import.meta.main) await main()
