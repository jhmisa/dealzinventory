// ZTE-family (nubia / RED MAGIC / Libero / Axon) spec reference. Keyed by the canonical model_name
// the parser produces (see ZTE_CONFIG.canonicalModelName). model_number + carrier are coarse
// attributes, NOT identity. Research-verified 2026-07-01 (Yodobashi / nubia·RED MAGIC JP / Y!mobile /
// SoftBank / ZTE Device Japan / GSMArena). Values are the JP base tier; never guessed.
//
// Notes carried from research:
//  - RED MAGIC 10 Pro / 10S Pro / 11 Air / 11 Pro true panel is 6.85" (retailer titles round to 6.8).
//  - iosys labels the NX733J card "nubia Z70 Ultra" (officially the Z70S Ultra refresh; same SD 8
//    Elite) — keyed to "nubia Z70 Ultra" to match the harvested model_name.
//  - All nubia S2 (Lite/R/e) share the UNISOC T8100, 6.7", 4GB single tier.

export interface ZteModelSpec {
  chipset: string
  screen_size: number // inches
  year: number // first JP release year
  ram_gb: number // base tier
  os_family: "Android"
}

export const ZTE_SPECS: Record<string, ZteModelSpec> = {
  // --- RED MAGIC (gaming) ---
  "RED MAGIC 7": { chipset: "Snapdragon 8 Gen 1", screen_size: 6.8, year: 2022, ram_gb: 12, os_family: "Android" },
  "RED MAGIC 8 Pro": { chipset: "Snapdragon 8 Gen 2", screen_size: 6.8, year: 2023, ram_gb: 12, os_family: "Android" },
  "RED MAGIC 10 Air": { chipset: "Snapdragon 8 Gen 3", screen_size: 6.8, year: 2025, ram_gb: 12, os_family: "Android" },
  "RED MAGIC 10 Pro": { chipset: "Snapdragon 8 Elite", screen_size: 6.85, year: 2025, ram_gb: 12, os_family: "Android" },
  "RED MAGIC 10S Pro": { chipset: "Snapdragon 8 Elite Leading Version", screen_size: 6.85, year: 2025, ram_gb: 12, os_family: "Android" },
  "RED MAGIC 11 Air": { chipset: "Snapdragon 8 Elite", screen_size: 6.85, year: 2026, ram_gb: 12, os_family: "Android" },
  "RED MAGIC 11 Pro": { chipset: "Snapdragon 8 Elite Gen 5", screen_size: 6.85, year: 2026, ram_gb: 12, os_family: "Android" },

  // --- nubia flagship / mid ---
  "nubia Z70 Ultra": { chipset: "Snapdragon 8 Elite", screen_size: 6.8, year: 2025, ram_gb: 12, os_family: "Android" },
  "nubia S2 Lite": { chipset: "UNISOC T8100", screen_size: 6.7, year: 2026, ram_gb: 4, os_family: "Android" },
  "nubia S2R": { chipset: "UNISOC T8100", screen_size: 6.7, year: 2025, ram_gb: 4, os_family: "Android" }, // Rakuten Z6305R
  "nubia S2e": { chipset: "UNISOC T8100", screen_size: 6.7, year: 2025, ram_gb: 4, os_family: "Android" }, // SoftBank A506ZT

  // --- Libero (Y!mobile mass-market) + Axon ---
  "Libero 5G III": { chipset: "MediaTek Dimensity 700", screen_size: 6.67, year: 2022, ram_gb: 4, os_family: "Android" }, // A202ZT
  "Libero Flip": { chipset: "Snapdragon 7 Gen 1", screen_size: 6.9, year: 2024, ram_gb: 6, os_family: "Android" }, // A304ZT, foldable
  "Libero S10": { chipset: "Snapdragon 450", screen_size: 5.7, year: 2019, ram_gb: 3, os_family: "Android" }, // 901ZT
  "Axon 10 Pro 5G": { chipset: "Snapdragon 865", screen_size: 6.47, year: 2020, ram_gb: 6, os_family: "Android" }, // 902ZT
}

/** Look up ZTE-family specs by canonical model name, or null if not in the reference. */
export function zteSpec(modelName: string | null | undefined): ZteModelSpec | null {
  if (!modelName) return null
  return ZTE_SPECS[modelName.trim()] ?? null
}
