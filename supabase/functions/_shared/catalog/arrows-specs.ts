// Built-in Fujitsu / FCNT arrows model -> spec reference.
// iosys does not surface chipset / screen size / release year / RAM for Android, so we enrich
// harvested SKUs from this table. Keyed by the *canonical* model name the Android listing parser
// produces (lowercase "arrows", e.g. "arrows N", "arrows We", "arrows Be4 Plus", "arrows Alpha").
//
// JAPAN-MARKET: ram_gb is the base JP tier. screen_size = main display (inches). year = JP launch.
// os_family always "Android". Values verified by a research subagent (2026-06-28 pass). Models not
// listed harvest as spec_known=false (flagged, never guessed).

export interface ArrowsModelSpec {
  chipset: string
  screen_size: number // inches
  year: number // JP launch year
  ram_gb: number // base JP tier
  os_family: "Android"
}

export const ARROWS_SPECS: Record<string, ArrowsModelSpec> = {
  // Current FCNT lineup
  "arrows Alpha": { chipset: "MediaTek Dimensity 8350 Extreme", screen_size: 6.4, year: 2025, ram_gb: 12, os_family: "Android" }, // SIM-free M08 / docomo F-51F twin; MediaTek (NOT Snapdragon), 2025
  "arrows N": { chipset: "Snapdragon 695", screen_size: 6.24, year: 2023, ram_gb: 8, os_family: "Android" }, // docomo F-51C (on sale Feb 2023)
  "arrows We": { chipset: "Snapdragon 480 5G", screen_size: 5.7, year: 2021, ram_gb: 4, os_family: "Android" }, // F-51B / FCG01 / A101FC
  "arrows We2": { chipset: "MediaTek Dimensity 7025", screen_size: 6.1, year: 2024, ram_gb: 4, os_family: "Android" }, // F-52E / FCG02 / A402FC / M07
  "arrows We2 Plus": { chipset: "Snapdragon 7s Gen 2", screen_size: 6.6, year: 2024, ram_gb: 8, os_family: "Android" }, // F-51E / M06

  // Be line
  "arrows Be3": { chipset: "Snapdragon 450", screen_size: 5.6, year: 2019, ram_gb: 3, os_family: "Android" }, // F-02L
  "arrows Be4": { chipset: "Snapdragon 450", screen_size: 5.6, year: 2020, ram_gb: 3, os_family: "Android" }, // F-41A
  "arrows Be4 Plus": { chipset: "Snapdragon 460", screen_size: 5.6, year: 2021, ram_gb: 4, os_family: "Android" }, // F-41B

  // Flagship / NX (2020 era)
  "arrows 5G": { chipset: "Snapdragon 865", screen_size: 6.7, year: 2020, ram_gb: 8, os_family: "Android" }, // F-51A
  "arrows NX9": { chipset: "Snapdragon 765G", screen_size: 6.3, year: 2021, ram_gb: 8, os_family: "Android" }, // F-52A (on sale Jan 2021)
}

/** Look up arrows specs by canonical model name, or null if not in the reference. */
export function arrowsSpec(modelName: string | null | undefined): ArrowsModelSpec | null {
  if (!modelName) return null
  return ARROWS_SPECS[modelName.trim()] ?? null
}
