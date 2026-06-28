// Built-in ASUS (Zenfone / ROG Phone) model -> spec reference.
// iosys does not surface chipset / screen size / release year / RAM for Android, so we enrich
// harvested SKUs from this table. Keyed by the *canonical* model name the Android listing parser
// produces ("ASUS" stripped, casing normalized, space inserted before the number — e.g. "Zenfone 9",
// "Zenfone 5Z", "ROG Phone 8", "ROG Phone 8 Pro"). ram_gb is the base JP tier; screen_size = main
// display (inches); year = JP launch; os_family always "Android". Verified by a research subagent
// (2026-06-28). Models not listed harvest as spec_known=false (flagged, never guessed).

export interface AsusModelSpec {
  chipset: string
  screen_size: number // inches
  year: number // JP launch year
  ram_gb: number // base JP tier
  os_family: "Android"
}

export const ASUS_SPECS: Record<string, AsusModelSpec> = {
  // --- Zenfone line ---
  "Zenfone 3": { chipset: "Snapdragon 625", screen_size: 5.5, year: 2016, ram_gb: 3, os_family: "Android" }, // ZE552KL
  "Zenfone 4": { chipset: "Snapdragon 660", screen_size: 5.5, year: 2017, ram_gb: 4, os_family: "Android" }, // ZE554KL (JP SoC SD660 vs SD630 — global SD660)
  "Zenfone 5": { chipset: "Snapdragon 636", screen_size: 6.2, year: 2018, ram_gb: 4, os_family: "Android" }, // ZE620KL (NOT the 5Z)
  "Zenfone 5Z": { chipset: "Snapdragon 845", screen_size: 6.2, year: 2018, ram_gb: 6, os_family: "Android" }, // ZS620KL
  "Zenfone 6": { chipset: "Snapdragon 855", screen_size: 6.4, year: 2019, ram_gb: 6, os_family: "Android" }, // ZS630KL
  "Zenfone 7": { chipset: "Snapdragon 865", screen_size: 6.67, year: 2020, ram_gb: 6, os_family: "Android" }, // ZS670KS
  "Zenfone 7 Pro": { chipset: "Snapdragon 865+", screen_size: 6.67, year: 2020, ram_gb: 8, os_family: "Android" }, // ZS671KS
  "Zenfone 8": { chipset: "Snapdragon 888", screen_size: 5.9, year: 2021, ram_gb: 8, os_family: "Android" }, // ZS590KS
  "Zenfone 9": { chipset: "Snapdragon 8+ Gen 1", screen_size: 5.9, year: 2022, ram_gb: 8, os_family: "Android" }, // AI2202
  "Zenfone 10": { chipset: "Snapdragon 8 Gen 2", screen_size: 5.92, year: 2023, ram_gb: 8, os_family: "Android" }, // AI2302
  "Zenfone 11 Ultra": { chipset: "Snapdragon 8 Gen 3", screen_size: 6.78, year: 2024, ram_gb: 12, os_family: "Android" }, // AI2401_H

  // --- ROG Phone line (no "ROG Phone 4" exists — ASUS skipped it) ---
  "ROG Phone II": { chipset: "Snapdragon 855+", screen_size: 6.59, year: 2019, ram_gb: 8, os_family: "Android" }, // ZS660KL
  "ROG Phone 3": { chipset: "Snapdragon 865+", screen_size: 6.59, year: 2020, ram_gb: 8, os_family: "Android" }, // ZS661KS
  "ROG Phone 5": { chipset: "Snapdragon 888", screen_size: 6.78, year: 2021, ram_gb: 8, os_family: "Android" }, // ZS673KS
  "ROG Phone 6": { chipset: "Snapdragon 8+ Gen 1", screen_size: 6.78, year: 2022, ram_gb: 12, os_family: "Android" }, // AI2201
  "ROG Phone 6 Pro": { chipset: "Snapdragon 8+ Gen 1", screen_size: 6.78, year: 2022, ram_gb: 18, os_family: "Android" }, // AI2201_D
  "ROG Phone 7": { chipset: "Snapdragon 8 Gen 2", screen_size: 6.78, year: 2023, ram_gb: 12, os_family: "Android" }, // AI2205
  "ROG Phone 7 Ultimate": { chipset: "Snapdragon 8 Gen 2", screen_size: 6.78, year: 2023, ram_gb: 16, os_family: "Android" }, // AI2205
  "ROG Phone 8": { chipset: "Snapdragon 8 Gen 3", screen_size: 6.78, year: 2024, ram_gb: 12, os_family: "Android" }, // AI2401
  "ROG Phone 8 Pro": { chipset: "Snapdragon 8 Gen 3", screen_size: 6.78, year: 2024, ram_gb: 16, os_family: "Android" }, // AI2401_A
  "ROG Phone 9": { chipset: "Snapdragon 8 Elite", screen_size: 6.78, year: 2025, ram_gb: 12, os_family: "Android" }, // AI2501 (JP on-sale 2025)
  "ROG Phone 9 Pro": { chipset: "Snapdragon 8 Elite", screen_size: 6.78, year: 2025, ram_gb: 16, os_family: "Android" }, // AI2501
  // OMITTED as UNVERIFIED-for-JP (harvest as spec_known=false): ROG Phone (1) (JP year), ROG Phone
  // 5s/5s Pro (JP release), and the Zenfone Max/Live/Max Plus series (likely not ASUS-Japan official).
}

/** Look up ASUS specs by canonical model name, or null if not in the reference. */
export function asusSpec(modelName: string | null | undefined): AsusModelSpec | null {
  if (!modelName) return null
  return ASUS_SPECS[modelName.trim()] ?? null
}
