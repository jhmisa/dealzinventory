// Harvest runner: crawl iosys listing pages by section (carrier / connectivity), parse each
// page into SKUs, dedupe by part_number across the whole crawl, enrich with the built-in
// model->spec reference, and emit rows shaped for the iosys_catalog staging table.
//
// Category-driven: the same crawl/dedupe/converge loop serves iPhone (default) and iPad —
// each category supplies its URL path, its sections, and a page->rows function (parser +
// per-category enrichment). Android brands plug in the same way later.
//
// `fetchPage` is injected so the same logic runs from an edge function (real fetch +
// supabase upsert) and from a local runner (emit SQL) without change. Re-runnable and
// incremental: the caller upserts ON CONFLICT (part_number).

import { type Carrier, type ListingSku, parseListingPage } from "./iosys-listing.ts"
import { iphoneSpec } from "./iphone-specs.ts"
import { type IpadListingSku, parseIpadListingPage } from "./ipad-listing.ts"
import { ipadSpec } from "./ipad-specs.ts"
import { type MacListingSku, parseMacListingPage } from "./mac-listing.ts"
import { type AppleWatchListingSku, parseAppleWatchListingPage } from "./apple-watch-listing.ts"
import { appleWatchSpec } from "./apple-watch-specs.ts"
import {
  type AndroidBrandConfig,
  type AndroidListingSku,
  AQUOS_CONFIG,
  ARROWS_CONFIG,
  ASUS_CONFIG,
  GALAXY_CONFIG,
  HUAWEI_CONFIG,
  MOTOROLA_CONFIG,
  OPPO_CONFIG,
  parseAndroidListingPage,
  PIXEL_CONFIG,
  XIAOMI_CONFIG,
  XPERIA_CONFIG,
} from "./android-listing.ts"
import { galaxySpec } from "./galaxy-specs.ts"
import { xperiaSpec } from "./xperia-specs.ts"
import { aquosSpec } from "./aquos-specs.ts"
import { pixelSpec } from "./pixel-specs.ts"
import { xiaomiSpec } from "./xiaomi-specs.ts"
import { oppoSpec } from "./oppo-specs.ts"
import { arrowsSpec } from "./arrows-specs.ts"
import { huaweiSpec } from "./huawei-specs.ts"
import { asusSpec } from "./asus-specs.ts"
import { motorolaSpec } from "./motorola-specs.ts"
import { extractCardImageMap, normalizeAltKey } from "./card-images.ts"

export interface CarrierSection {
  path: string // url segment, e.g. "simfree" / "wifi"
  carrier: Carrier | null // network sold under (null for the Wi-Fi-only iPad section)
}

export const IPHONE_SECTIONS: CarrierSection[] = [
  { path: "simfree", carrier: "SIM-Free" },
  { path: "docomo", carrier: "docomo" },
  { path: "au", carrier: "au" },
  { path: "softbank", carrier: "SoftBank" },
  { path: "rakuten", carrier: "Rakuten" }, // tolerated if absent
]

export const IPAD_SECTIONS: CarrierSection[] = [
  { path: "simfree", carrier: "SIM-Free" },
  { path: "docomo", carrier: "docomo" },
  { path: "au", carrier: "au" },
  { path: "softbank", carrier: "SoftBank" },
  { path: "wifi", carrier: null }, // Wi-Fi-only units: no carrier
]

// Android brands share the iPhone-style carrier sections (no Wi-Fi-only).
export const ANDROID_SECTIONS: CarrierSection[] = [
  { path: "simfree", carrier: "SIM-Free" },
  { path: "docomo", carrier: "docomo" },
  { path: "au", carrier: "au" },
  { path: "softbank", carrier: "SoftBank" },
  { path: "rakuten", carrier: "Rakuten" }, // tolerated if absent
]

export interface CatalogRow {
  sku_key: string // dedupe identity: part_number (Apple) or brand|model|storage|color|carrier (Android)
  part_number: string | null // Apple SKU; null for Android (no equivalent code)
  model_number: string | null
  brand: string
  model_name: string
  storage_gb: number | null
  color_ja: string | null
  color_en: string | null
  carrier: Carrier | null
  connectivity: string | null // "Wi-Fi" / "Wi-Fi + Cellular" for tablets; null for phones
  device_category: string
  source_url: string
  carrier_path: string
  raw_title: string
  image_url?: string | null // representative listing photo, attached centrally post-parse
  listing_count: number
  specs: Record<string, unknown>
}

/** A harvest category: its iosys URL path, sections, and how to turn a page into rows. */
export interface HarvestCategory {
  pathPrefix: string // e.g. "items/smartphone/iphone" / "items/smartphone/galaxy"
  sections: CarrierSection[]
  pageToRows: (html: string, section: CarrierSection, sourceUrl: string) => CatalogRow[]
}

function iphoneRow(sku: ListingSku, section: CarrierSection, sourceUrl: string): CatalogRow {
  const spec = iphoneSpec(sku.model_name)
  return {
    sku_key: sku.part_number,
    part_number: sku.part_number,
    model_number: sku.model_number,
    brand: "Apple",
    model_name: sku.model_name,
    storage_gb: sku.storage_gb,
    color_ja: sku.color_ja,
    color_en: sku.color_en,
    carrier: sku.carrier,
    connectivity: null,
    device_category: "IPHONE",
    source_url: sourceUrl,
    carrier_path: section.path,
    raw_title: sku.raw_title,
    listing_count: 1,
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

function ipadRow(sku: IpadListingSku, section: CarrierSection, sourceUrl: string): CatalogRow {
  const spec = ipadSpec(sku.model_name)
  return {
    sku_key: sku.part_number,
    part_number: sku.part_number,
    model_number: sku.model_number,
    brand: "Apple",
    model_name: sku.model_name,
    storage_gb: sku.storage_gb,
    color_ja: sku.color_ja,
    color_en: sku.color_en,
    carrier: sku.carrier,
    connectivity: sku.connectivity,
    device_category: "TABLET",
    source_url: sourceUrl,
    carrier_path: section.path,
    raw_title: sku.raw_title,
    listing_count: 1,
    specs: {
      ...(spec ?? {}),
      connectivity: sku.connectivity,
      is_unlocked: sku.is_unlocked,
      is_domestic: sku.is_domestic,
      region_code: sku.region_code,
      region_note: sku.region_note,
      glass: sku.glass,
      generation: sku.generation,
      size_inch: sku.size_inch,
      chip: sku.chip,
      spec_known: spec != null,
    },
  }
}

export const IPHONE_CATEGORY: HarvestCategory = {
  pathPrefix: "items/smartphone/iphone",
  sections: IPHONE_SECTIONS,
  pageToRows: (html, section, src) =>
    parseListingPage(html, section.carrier).map((sku) => iphoneRow(sku, section, src)),
}

export const IPAD_CATEGORY: HarvestCategory = {
  pathPrefix: "items/tablet/ios/ipad",
  sections: IPAD_SECTIONS,
  pageToRows: (html, section, src) =>
    parseIpadListingPage(html, section.carrier).map((sku) => ipadRow(sku, section, src)),
}

// Mac (MacBook Air/Pro) — Apple part#-keyed, COMPUTER category. The full config (chip/RAM/SSD/GPU)
// is read from the title bracket, so spec_known is always true. Identity collapses on config in the
// fill-gaps (several part#s share one config); part# is the coarse representative.
function macRow(sku: MacListingSku, section: CarrierSection, sourceUrl: string): CatalogRow {
  return {
    sku_key: sku.part_number,
    part_number: sku.part_number,
    model_number: sku.part_number, // Mac has no separate A-number; the part# IS the identifier
    brand: "Apple",
    model_name: sku.model_name,
    storage_gb: sku.ssd_gb,
    color_ja: sku.color_ja,
    color_en: sku.color_en,
    carrier: null,
    connectivity: null,
    device_category: "COMPUTER",
    source_url: sourceUrl,
    carrier_path: section.path,
    raw_title: sku.raw_title,
    listing_count: 1,
    specs: {
      chipset: sku.chip,
      ram_gb: sku.ram_gb,
      screen_size: sku.size_inch,
      year: sku.year,
      is_intel: sku.is_intel,
      cpu_cores: sku.cpu_cores,
      gpu_cores: sku.gpu_cores,
      storage_type: sku.storage_type,
      imac_variant: sku.imac_variant,
      period: sku.period,
      region_code: sku.region_code,
      is_domestic: sku.is_domestic,
      spec_known: true, // config is printed in the title bracket — always known
    },
  }
}

export const MACBOOK_CATEGORY: HarvestCategory = {
  pathPrefix: "items/pc/notepc",
  sections: [{ path: "macbook", carrier: null }],
  pageToRows: (html, section, src) =>
    parseMacListingPage(html).map((sku) => macRow(sku, section, src)),
}

// Desktop Macs (iMac / Mac mini / Mac Studio / Mac Pro) — same parser + part# pipeline.
export const DESKMAC_CATEGORY: HarvestCategory = {
  pathPrefix: "items/pc/deskpc",
  sections: [{ path: "mac", carrier: null }],
  pageToRows: (html, section, src) =>
    parseMacListingPage(html).map((sku) => macRow(sku, section, src)),
}

// Apple Watch — Apple part#-keyed, device_category=OTHER (wearable). The SiP/year are NOT in the
// title, so we enrich from the verified apple-watch-specs reference. Identity collapses on the CASE
// config (model + size + material + case color + has_cellular); the band is dropped (swappable).
function watchRow(sku: AppleWatchListingSku, section: CarrierSection, sourceUrl: string): CatalogRow {
  const spec = appleWatchSpec(sku.model_name)
  return {
    sku_key: sku.part_number,
    part_number: sku.part_number,
    model_number: sku.model_number, // A-number
    brand: "Apple",
    model_name: sku.model_name,
    storage_gb: null, // watches have storage but iosys doesn't list it; not an identity attribute
    color_ja: sku.color_ja,
    color_en: sku.color_en,
    carrier: null,
    connectivity: sku.connectivity, // "GPS" / "GPS + Cellular"
    device_category: "OTHER",
    source_url: sourceUrl,
    carrier_path: section.path,
    raw_title: sku.raw_title,
    listing_count: 1,
    specs: {
      chipset: spec?.chipset ?? null,
      year: spec?.year ?? null,
      case_size_mm: sku.case_size_mm,
      case_material: sku.case_material,
      case_material_ja: sku.case_material_ja,
      form_factor: sku.form_factor,
      collection: sku.collection,
      generation: sku.generation,
      has_cellular: sku.has_cellular,
      connectivity: sku.connectivity,
      band_less: sku.band_less,
      band_part_number: sku.band_part_number,
      region_code: sku.region_code,
      is_domestic: sku.is_domestic,
      spec_known: spec != null,
    },
  }
}

export const APPLEWATCH_CATEGORY: HarvestCategory = {
  pathPrefix: "items/wearable",
  sections: [{ path: "apple", carrier: null }],
  pageToRows: (html, section, src) =>
    parseAppleWatchListingPage(html).map((sku) => watchRow(sku, section, src)),
}

// Android brands have no part_number → dedupe identity is (brand, model, storage, color, carrier).
// Carrier is kept in the key here (provenance) but COLLAPSED when promoting to product_models,
// where carrier lives per-unit on items.
function androidSkuKey(sku: AndroidListingSku): string {
  return [
    sku.brand,
    sku.model_name,
    sku.storage_gb ?? "",
    sku.color_en ?? sku.color_ja ?? "",
    sku.carrier ?? "",
  ].join("|")
}

function androidRow(
  sku: AndroidListingSku,
  spec: ReturnType<typeof galaxySpec>,
  deviceCategory: string,
  section: CarrierSection,
  sourceUrl: string,
): CatalogRow {
  return {
    sku_key: androidSkuKey(sku),
    part_number: null, // Android has no Apple-style SKU code
    model_number: sku.model_number,
    brand: sku.brand,
    model_name: sku.model_name,
    storage_gb: sku.storage_gb,
    color_ja: sku.color_ja,
    color_en: sku.color_en,
    carrier: sku.carrier,
    connectivity: null,
    device_category: deviceCategory,
    source_url: sourceUrl,
    carrier_path: section.path,
    raw_title: sku.raw_title,
    listing_count: 1,
    specs: {
      ...(spec ?? {}),
      ram_gb: sku.ram_gb ?? spec?.ram_gb ?? null,
      is_unlocked: sku.is_unlocked,
      is_domestic: sku.is_domestic,
      region_note: sku.region_note,
      spec_known: spec != null,
    },
  }
}

/** Build a HarvestCategory for an Android brand (path + spec lookup supplied per brand). */
export function androidCategory(
  pathPrefix: string,
  config: AndroidBrandConfig,
  specLookup: (modelName: string) => ReturnType<typeof galaxySpec>,
  deviceCategory = "ANDROID",
): HarvestCategory {
  return {
    pathPrefix,
    sections: ANDROID_SECTIONS,
    pageToRows: (html, section, src) =>
      parseAndroidListingPage(html, config, section.carrier).map((sku) =>
        androidRow(sku, specLookup(sku.model_name), deviceCategory, section, src)
      ),
  }
}

export const GALAXY_CATEGORY: HarvestCategory = androidCategory(
  "items/smartphone/galaxy",
  GALAXY_CONFIG,
  galaxySpec,
)

export const XPERIA_CATEGORY: HarvestCategory = androidCategory(
  "items/smartphone/xperia",
  XPERIA_CONFIG,
  xperiaSpec,
)

export const AQUOS_CATEGORY: HarvestCategory = androidCategory(
  "items/smartphone/aquos",
  AQUOS_CONFIG,
  aquosSpec,
)

export const PIXEL_CATEGORY: HarvestCategory = androidCategory(
  "items/smartphone/pixel",
  PIXEL_CONFIG,
  pixelSpec,
)

export const XIAOMI_CATEGORY: HarvestCategory = androidCategory(
  "items/smartphone/xiaomi",
  XIAOMI_CONFIG,
  xiaomiSpec,
)

export const OPPO_CATEGORY: HarvestCategory = androidCategory(
  "items/smartphone/oppo",
  OPPO_CONFIG,
  oppoSpec,
)

export const ARROWS_CATEGORY: HarvestCategory = androidCategory(
  "items/smartphone/arrows",
  ARROWS_CONFIG,
  arrowsSpec,
)

export const HUAWEI_CATEGORY: HarvestCategory = androidCategory(
  "items/smartphone/huawei",
  HUAWEI_CONFIG,
  huaweiSpec,
)

// ASUS has two iosys paths (Zenfone + ROG Phone) under one brand/config.
export const ZENFONE_CATEGORY: HarvestCategory = androidCategory(
  "items/smartphone/zenfone",
  ASUS_CONFIG,
  asusSpec,
)

export const ROG_CATEGORY: HarvestCategory = androidCategory(
  "items/smartphone/rog",
  ASUS_CONFIG,
  asusSpec,
)

export const MOTOROLA_CATEGORY: HarvestCategory = androidCategory(
  "items/smartphone/motorola",
  MOTOROLA_CONFIG,
  motorolaSpec,
)

export interface HarvestOptions {
  baseUrl?: string // default https://iosys.co.jp
  category?: HarvestCategory // default IPHONE_CATEGORY
  sections?: CarrierSection[] // override category.sections
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

export async function harvestCatalog(opts: HarvestOptions): Promise<HarvestResult> {
  const baseUrl = opts.baseUrl ?? "https://iosys.co.jp"
  const category = opts.category ?? IPHONE_CATEGORY
  const sections = opts.sections ?? category.sections
  const maxPages = opts.maxPagesPerSection ?? 30
  const stopAfterDry = opts.stopAfterDryPages ?? 2
  const throttleMs = opts.throttleMs ?? 800
  const log = opts.onProgress ?? (() => {})

  const bySku = new Map<string, CatalogRow>()
  const counts = new Map<string, number>() // sku_key -> times seen across crawl
  const perCarrier: Record<string, number> = {}
  let pagesFetched = 0

  for (const section of sections) {
    const before = bySku.size
    let dry = 0
    for (let page = 1; page <= maxPages; page++) {
      const sectionUrl = `${baseUrl}/${category.pathPrefix}/${section.path}`
      const url = page === 1 ? sectionUrl : `${sectionUrl}?page=${page}`
      let html: string
      try {
        html = await opts.fetchPage(url)
        pagesFetched++
      } catch (e) {
        log(`[${section.path}] page ${page} fetch error: ${(e as Error).message} — stopping section`)
        break
      }
      const rows = category.pageToRows(html, section, sectionUrl)
      if (rows.length === 0) {
        log(`[${section.path}] page ${page} had 0 cards — end of section`)
        break
      }
      // Attach the representative listing photo to each row (central join; parsers untouched).
      const imgMap = extractCardImageMap(html, baseUrl)
      for (const row of rows) {
        row.image_url = imgMap.get(normalizeAltKey(row.raw_title)) ?? null
      }
      let newOnPage = 0
      for (const row of rows) {
        counts.set(row.sku_key, (counts.get(row.sku_key) ?? 0) + 1)
        if (!bySku.has(row.sku_key)) {
          bySku.set(row.sku_key, row)
          newOnPage++
        }
      }
      log(`[${section.path}] page ${page}: ${rows.length} cards, ${newOnPage} new (total ${bySku.size})`)
      dry = newOnPage === 0 ? dry + 1 : 0
      if (dry >= stopAfterDry) {
        log(`[${section.path}] converged (${dry} dry pages) — stopping section`)
        break
      }
      if (page < maxPages) await sleep(throttleMs)
    }
    perCarrier[section.path] = bySku.size - before
  }

  // finalize listing_count from the cross-crawl tally
  for (const row of bySku.values()) row.listing_count = counts.get(row.sku_key) ?? 1

  const rows = [...bySku.values()]
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
