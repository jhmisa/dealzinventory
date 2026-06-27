// Harvest runner: crawl iosys iPhone listing pages by carrier, parse each page into
// SKUs (via iosys-listing.ts), dedupe by part_number across the whole crawl, enrich
// with the built-in model->spec reference, and emit rows shaped for the iosys_catalog
// staging table.
//
// `fetchPage` is injected so the same logic runs from an edge function (real fetch +
// supabase upsert) and from a local runner (emit SQL) without change. Re-runnable and
// incremental: the caller upserts ON CONFLICT (part_number).

import { type Carrier, type ListingSku, parseListingPage } from "./iosys-listing.ts"
import { iphoneSpec } from "./iphone-specs.ts"

export interface CarrierSection {
  path: string // url segment, e.g. "simfree"
  carrier: Carrier
}

export const IPHONE_SECTIONS: CarrierSection[] = [
  { path: "simfree", carrier: "SIM-Free" },
  { path: "docomo", carrier: "docomo" },
  { path: "au", carrier: "au" },
  { path: "softbank", carrier: "SoftBank" },
  { path: "rakuten", carrier: "Rakuten" }, // tolerated if absent
]

export interface CatalogRow {
  part_number: string
  model_number: string | null
  brand: string
  model_name: string
  storage_gb: number | null
  color_ja: string | null
  color_en: string | null
  carrier: Carrier | null
  device_category: string
  source_url: string
  carrier_path: string
  raw_title: string
  listing_count: number
  specs: Record<string, unknown>
}

export interface HarvestOptions {
  baseUrl?: string // default https://iosys.co.jp
  sections?: CarrierSection[] // default IPHONE_SECTIONS
  maxPagesPerSection?: number // hard cap (politeness), default 30
  stopAfterDryPages?: number // stop a section after N consecutive pages with no new SKUs, default 2
  throttleMs?: number // delay between page fetches, default 800
  fetchPage: (url: string) => Promise<string> // injected fetcher
  onProgress?: (msg: string) => void
}

export interface HarvestResult {
  rows: CatalogRow[]
  stats: {
    perCarrier: Record<string, number>
    pagesFetched: number
    totalSkus: number
    unmappedColors: string[] // distinct color_ja that didn't map to English (flag for human)
    unknownModels: string[] // distinct model_name with no spec reference (flag)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function toRow(sku: ListingSku, section: CarrierSection, sourceUrl: string, count: number): CatalogRow {
  const spec = iphoneSpec(sku.model_name)
  return {
    part_number: sku.part_number,
    model_number: sku.model_number,
    brand: "Apple",
    model_name: sku.model_name,
    storage_gb: sku.storage_gb,
    color_ja: sku.color_ja,
    color_en: sku.color_en,
    carrier: sku.carrier,
    device_category: "IPHONE",
    source_url: sourceUrl,
    carrier_path: section.path,
    raw_title: sku.raw_title,
    listing_count: count,
    specs: {
      ...(spec ?? {}),
      is_unlocked: sku.is_unlocked,
      is_domestic: sku.is_domestic,
      region_code: sku.region_code,
      region_note: sku.region_note,
      spec_known: spec != null,
    },
  }
}

export async function harvestCatalog(opts: HarvestOptions): Promise<HarvestResult> {
  const baseUrl = opts.baseUrl ?? "https://iosys.co.jp"
  const sections = opts.sections ?? IPHONE_SECTIONS
  const maxPages = opts.maxPagesPerSection ?? 30
  const stopAfterDry = opts.stopAfterDryPages ?? 2
  const throttleMs = opts.throttleMs ?? 800
  const log = opts.onProgress ?? (() => {})

  const byPart = new Map<string, CatalogRow>()
  const counts = new Map<string, number>() // part_number -> times seen across crawl
  const perCarrier: Record<string, number> = {}
  let pagesFetched = 0

  for (const section of sections) {
    const before = byPart.size
    let dry = 0
    for (let page = 1; page <= maxPages; page++) {
      const sectionUrl = `${baseUrl}/items/smartphone/iphone/${section.path}`
      const url = page === 1 ? sectionUrl : `${sectionUrl}?page=${page}`
      let html: string
      try {
        html = await opts.fetchPage(url)
        pagesFetched++
      } catch (e) {
        log(`[${section.path}] page ${page} fetch error: ${(e as Error).message} — stopping section`)
        break
      }
      const skus = parseListingPage(html, section.carrier)
      if (skus.length === 0) {
        log(`[${section.path}] page ${page} had 0 cards — end of section`)
        break
      }
      let newOnPage = 0
      for (const sku of skus) {
        counts.set(sku.part_number, (counts.get(sku.part_number) ?? 0) + 1)
        if (!byPart.has(sku.part_number)) {
          byPart.set(sku.part_number, toRow(sku, section, sectionUrl, 1))
          newOnPage++
        }
      }
      log(`[${section.path}] page ${page}: ${skus.length} cards, ${newOnPage} new (total ${byPart.size})`)
      dry = newOnPage === 0 ? dry + 1 : 0
      if (dry >= stopAfterDry) {
        log(`[${section.path}] converged (${dry} dry pages) — stopping section`)
        break
      }
      if (page < maxPages) await sleep(throttleMs)
    }
    perCarrier[section.path] = byPart.size - before
  }

  // finalize listing_count from the cross-crawl tally
  for (const row of byPart.values()) row.listing_count = counts.get(row.part_number) ?? 1

  const rows = [...byPart.values()]
  const unmappedColors = [
    ...new Set(rows.filter((r) => r.color_ja && !r.color_en).map((r) => r.color_ja as string)),
  ]
  const unknownModels = [
    ...new Set(rows.filter((r) => !r.specs.spec_known).map((r) => r.model_name)),
  ]
  return {
    rows,
    stats: { perCarrier, pagesFetched, totalSkus: rows.length, unmappedColors, unknownModels },
  }
}
