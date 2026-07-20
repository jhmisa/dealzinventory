// Verified spec reference for Microsoft Surface devices sold in Japan (screen size + first JP
// release year per model). The CONFIG (CPU/RAM/storage/OS) comes verbatim from the iosys title
// bracket — this file only carries what the title omits. Models not listed here harvest with
// spec_known=false (flagged, never guessed).
//
// Research pass 2026-07-20 (sources: News Center Japan / Windows Blog Japan / PC Watch / ITmedia /
// kakaku + per-SKU retailer listings). Verified traps baked in:
//   - JP year ≠ global year for: Surface Book (JP 2016), Pro X (JP 2020), Laptop Studio (JP 2022).
//   - Two-size lines (Book 2/3, Laptop 3/4/5/6) have NO single screen size — the size is per
//     part# with no reliable prefix rule, so screen_size stays null (the iosys detail page's
//     spec table backfills it per unit via the Add-Backorder enrichment).
//   - "Surface Pro" alone is ambiguous (2013 original vs 2017 5th-gen — both officially just
//     "Surface Pro") → deliberately NOT in the table; such a card flags as unknownModels.
//   - Pro 11 is officially "Surface Pro (第11世代)" but iosys/JP retail writes "Surface Pro 11";
//     we key on the retail form the parser produces.

export interface SurfaceSpec {
  screen_size: number | null
  year: number
}

export const SURFACE_SPECS: Record<string, SurfaceSpec> = {
  "Surface 3": { screen_size: 10.8, year: 2015 },
  "Surface Go": { screen_size: 10.0, year: 2018 },
  "Surface Go 2": { screen_size: 10.5, year: 2020 },
  "Surface Go 3": { screen_size: 10.5, year: 2021 },
  "Surface Go 4": { screen_size: 10.5, year: 2023 },
  "Surface Pro 2": { screen_size: 10.6, year: 2013 },
  "Surface Pro 3": { screen_size: 12.0, year: 2014 },
  "Surface Pro 4": { screen_size: 12.3, year: 2015 },
  "Surface Pro 6": { screen_size: 12.3, year: 2018 },
  "Surface Pro 7": { screen_size: 12.3, year: 2019 },
  "Surface Pro 7+": { screen_size: 12.3, year: 2021 },
  "Surface Pro 8": { screen_size: 13.0, year: 2021 },
  "Surface Pro 9": { screen_size: 13.0, year: 2022 },
  "Surface Pro X": { screen_size: 13.0, year: 2020 }, // JP; global 2019
  "Surface Pro 10": { screen_size: 13.0, year: 2024 }, // business channel only
  "Surface Pro 11": { screen_size: 13.0, year: 2024 },
  "Surface Book": { screen_size: 13.5, year: 2016 }, // JP; global 2015
  "Surface Book 2": { screen_size: null, year: 2017 }, // 13.5"/15" — size is per part#
  "Surface Book 3": { screen_size: null, year: 2020 }, // 13.5"/15"
  "Surface Laptop": { screen_size: 13.5, year: 2017 },
  "Surface Laptop 2": { screen_size: 13.5, year: 2018 },
  "Surface Laptop 3": { screen_size: null, year: 2019 }, // 13.5"/15"
  "Surface Laptop 4": { screen_size: null, year: 2021 }, // 13.5"/15"
  "Surface Laptop 5": { screen_size: null, year: 2022 }, // 13.5"/15"
  "Surface Laptop 6": { screen_size: null, year: 2024 }, // 13.5"/15", business only
  "Surface Laptop Go": { screen_size: 12.4, year: 2020 },
  "Surface Laptop Go 2": { screen_size: 12.4, year: 2022 },
  "Surface Laptop Go 3": { screen_size: 12.4, year: 2023 },
  "Surface Laptop Studio": { screen_size: 14.4, year: 2022 }, // JP; global 2021
  "Surface Laptop Studio 2": { screen_size: 14.4, year: 2023 },
}

// The Go line's iosys cards omit the color; these RESEARCH-VERIFIED part#→color entries fill
// them (Go 2 sold ONLY in Platinum; each Go 3 SKU below is explicitly listed as Platinum by JP
// retailers — Bic/Yodobashi/kakaku/Amazon JP; the Matte Black Go 3 was the separate 8VA-00030).
// Part#s not listed stay colorless and are skipped by the fill-gaps — never guessed.
export const SURFACE_PART_COLORS: Record<string, string> = {
  "STV-00012": "Platinum", // Go 2 Pentium/4/64 consumer
  "STZ-00012": "Platinum", // Go 2 Pentium/4/64 education (Win Pro)
  "RRX-00012": "Platinum", // Go 2 Core m3/4/64 commercial
  "TFZ-00011": "Platinum", // Go 2 LTE Advanced m3/8/128
  "8V6-00015": "Platinum", // Go 3 Pentium/4/64 consumer
  "8V7-00015": "Platinum", // Go 3 Pentium/4/64 education
  "8V9-00015": "Platinum", // Go 3 Core i3/4/64 commercial
  "8VA-00030": "Matte Black", // Go 3 Pentium/8/128 consumer (kakaku K0001420561)
}

export function surfaceSpec(modelName: string): SurfaceSpec | null {
  return SURFACE_SPECS[modelName] ?? null
}

/** Verified retail color for a colorless-card part#, or null (never guessed). */
export function surfacePartColor(partNumber: string): string | null {
  return SURFACE_PART_COLORS[partNumber] ?? null
}
