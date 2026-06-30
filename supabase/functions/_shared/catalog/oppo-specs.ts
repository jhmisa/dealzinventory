// Built-in OPPO (A-series / Reno / Find / older R) model -> spec reference.
// iosys does not surface chipset / screen size / release year / RAM for Android, so we enrich
// harvested SKUs from this table. Keyed by the *canonical* model name the Android listing parser
// produces — OPPO's official JP branding GLUES the number to "Reno" ("Reno5 A", "Reno10 Pro") and
// the parser KEEPS the "5G" suffix (it's a model distinguisher for OPPO: "A5 5G" ≠ "A5 2020"). So
// keys read e.g. "Reno5 A", "A54 5G", "Find X3 Pro 5G", "Reno10 Pro 5G".
//
// JAPAN-MARKET: ram_gb is the base JP tier. screen_size = main display (inches). year = JP launch.
// os_family always "Android". Values verified by a research subagent vs oppo.com/jp + GSMArena +
// KHwang9883 MobileModels DB (2026-06-28 pass).
//
// A77 (JP) = Helio G35 4G, NOT the global A77 5G — keyed here as the JP entry model.
// A5 5G keyed to the JP Rakuten Mobile CPH2735 config (Dimensity 6300, 4GB) — distinct from the
// global A5 5G's 4/6/8GB tiers; do NOT conflate with "A5 Pro 5G" / "A5i".

export interface OppoModelSpec {
  chipset: string
  screen_size: number // inches
  year: number // JP launch year
  ram_gb: number // base JP tier
  os_family: "Android"
}

export const OPPO_SPECS: Record<string, OppoModelSpec> = {
  // --- A-series ---
  "A5 2020": { chipset: "Snapdragon 665", screen_size: 6.5, year: 2020, ram_gb: 4, os_family: "Android" },
  "A5 5G": { chipset: "MediaTek Dimensity 6300", screen_size: 6.7, year: 2025, ram_gb: 4, os_family: "Android" }, // JP Rakuten CPH2735, 4GB only
  "A54 5G": { chipset: "Snapdragon 480 5G", screen_size: 6.5, year: 2021, ram_gb: 4, os_family: "Android" }, // au OPG02
  "A55s 5G": { chipset: "MediaTek Dimensity 700", screen_size: 6.5, year: 2021, ram_gb: 4, os_family: "Android" }, // CPH2309
  "A73": { chipset: "Snapdragon 662", screen_size: 6.44, year: 2020, ram_gb: 4, os_family: "Android" }, // CPH2099
  "A77": { chipset: "MediaTek Helio G35", screen_size: 6.5, year: 2022, ram_gb: 4, os_family: "Android" }, // JP 4G entry (CPH2385) — NOT global A77 5G
  "A79 5G": { chipset: "MediaTek Dimensity 6020", screen_size: 6.72, year: 2024, ram_gb: 4, os_family: "Android" }, // A303OP
  "AX7": { chipset: "Snapdragon 450", screen_size: 6.2, year: 2018, ram_gb: 4, os_family: "Android" }, // code-less (CPH1903)

  // --- Find series ---
  "Find X3 Pro 5G": { chipset: "Snapdragon 888 5G", screen_size: 6.7, year: 2021, ram_gb: 12, os_family: "Android" }, // au OPG03
  "Find X8": { chipset: "MediaTek Dimensity 9400", screen_size: 6.59, year: 2024, ram_gb: 12, os_family: "Android" }, // JP CPH2651
  "Find X9": { chipset: "MediaTek Dimensity 9500", screen_size: 6.59, year: 2025, ram_gb: 12, os_family: "Android" },
  "Find N6 5G": { chipset: "Snapdragon 8 Elite Gen 5", screen_size: 8.12, year: 2026, ram_gb: 12, os_family: "Android" }, // foldable, inner display

  // --- R / Reno (older + A-line + Pro) ---
  "R17 Pro": { chipset: "Snapdragon 710", screen_size: 6.4, year: 2018, ram_gb: 6, os_family: "Android" }, // CPH1877
  "Reno A": { chipset: "Snapdragon 710", screen_size: 6.4, year: 2019, ram_gb: 6, os_family: "Android" }, // CPH1983
  "Reno3 A": { chipset: "Snapdragon 665", screen_size: 6.44, year: 2020, ram_gb: 6, os_family: "Android" }, // CPH2013
  "Reno5 A": { chipset: "Snapdragon 765G 5G", screen_size: 6.5, year: 2021, ram_gb: 6, os_family: "Android" }, // CPH2199 / A101OP / A103OP
  "Reno7 A": { chipset: "Snapdragon 695 5G", screen_size: 6.4, year: 2022, ram_gb: 6, os_family: "Android" }, // CPH2353 / OPG04 / A201OP
  "Reno9 A": { chipset: "Snapdragon 695 5G", screen_size: 6.4, year: 2023, ram_gb: 8, os_family: "Android" }, // CPH2523 / A301OP
  "Reno10 Pro 5G": { chipset: "Snapdragon 778G 5G", screen_size: 6.7, year: 2023, ram_gb: 8, os_family: "Android" }, // A302OP / CPH2541
  "Reno11 A": { chipset: "MediaTek Dimensity 7050", screen_size: 6.7, year: 2024, ram_gb: 8, os_family: "Android" }, // CPH2603 / A401OP
  "Reno13 A": { chipset: "Snapdragon 6 Gen 1", screen_size: 6.67, year: 2025, ram_gb: 8, os_family: "Android" }, // CPH2699
}

/** Look up OPPO specs by canonical model name, or null if not in the reference. */
export function oppoSpec(modelName: string | null | undefined): OppoModelSpec | null {
  if (!modelName) return null
  return OPPO_SPECS[modelName.trim()] ?? null
}
