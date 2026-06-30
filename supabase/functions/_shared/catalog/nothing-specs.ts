// Nothing + CMF-by-Nothing spec reference. Keyed by the canonical model_name the parser produces
// (see NOTHING_CONFIG.canonicalModelName) — Nothing phones are "Phone (N)" (brand="Nothing" is
// prepended on display → "Nothing Phone (1)"); CMF keeps its sub-brand word in the name ("CMF Phone
// 2 Pro" → "Nothing CMF Phone 2 Pro", mirroring ZTE's "nubia …"). model_number is always null —
// Nothing/CMF sell in Japan ONLY as SIM-free / Rakuten, with no carrier model codes (code-less brand
// like Xiaomi SIM-free; handled by NOTHING_CONFIG.nameConsumeRe).
//
// Research-verified 2026-07-01 (Nothing.tech / Nothing Japan PRTimes press / Rakuten Mobile spec
// pages / Impress k-tai Watch / Kakaku / GSMArena). Values are the JP base tier; never guessed.
//
// Notes carried from research:
//  - Phone (3) is the 2025 FLAGSHIP (Snapdragon 8s Gen 4); the (3a) tier is the cheaper Snapdragon
//    7s Gen 3 — distinct SoCs, do not conflate. Phone (3) JP base is genuinely 12GB (no 8GB JP tier).
//  - Phone (2a) PLAIN = Dimensity 7200 Pro (the (2a) Plus's 7350 Pro is a different model, not here).
//  - Phone (3a) Lite = Rakuten-first JP launch 2026-01, Dimensity 7300 Pro, 8/128 single config.
//  - Phone (4a) = 2026 model (JP sale 2026-05), Snapdragon 7s Gen 4.
//  - CMF Phone 2 Pro shares the Dimensity 7300 Pro with Phone (3a) Lite.

export interface NothingModelSpec {
  chipset: string
  screen_size: number // inches
  year: number // first JP release year
  ram_gb: number // base tier (a title-parsed 【RAM..GB】 overrides this per-SKU)
  os_family: "Android"
}

export const NOTHING_SPECS: Record<string, NothingModelSpec> = {
  "Phone (1)": { chipset: "Snapdragon 778G+ 5G", screen_size: 6.55, year: 2022, ram_gb: 8, os_family: "Android" },
  "Phone (2)": { chipset: "Snapdragon 8+ Gen 1", screen_size: 6.7, year: 2023, ram_gb: 8, os_family: "Android" },
  "Phone (2a)": { chipset: "MediaTek Dimensity 7200 Pro", screen_size: 6.7, year: 2024, ram_gb: 8, os_family: "Android" },
  "Phone (3)": { chipset: "Snapdragon 8s Gen 4", screen_size: 6.67, year: 2025, ram_gb: 12, os_family: "Android" },
  "Phone (3a)": { chipset: "Snapdragon 7s Gen 3", screen_size: 6.77, year: 2025, ram_gb: 8, os_family: "Android" },
  "Phone (3a) Lite": { chipset: "MediaTek Dimensity 7300 Pro", screen_size: 6.77, year: 2026, ram_gb: 8, os_family: "Android" },
  "Phone (4a)": { chipset: "Snapdragon 7s Gen 4", screen_size: 6.78, year: 2026, ram_gb: 8, os_family: "Android" },
  "CMF Phone 2 Pro": { chipset: "MediaTek Dimensity 7300 Pro", screen_size: 6.77, year: 2025, ram_gb: 8, os_family: "Android" },
}

/** Look up Nothing/CMF specs by canonical model name, or null if not in the reference. */
export function nothingSpec(modelName: string | null | undefined): NothingModelSpec | null {
  if (!modelName) return null
  return NOTHING_SPECS[modelName.trim()] ?? null
}
