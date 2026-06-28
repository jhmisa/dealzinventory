// Built-in Motorola (moto g / edge / razr) model -> spec reference.
// iosys does not surface chipset / screen size / release year / RAM for Android, so we enrich
// harvested SKUs from this table. Keyed by the *canonical* model name the Android listing parser
// produces ("Motorola" stripped, razr spaced before the number, lowercase line names — e.g.
// "moto g52j 5G", "edge 20", "razr 40 Ultra"). ram_gb is the base JP tier; screen_size = main
// display (inches); year = JP launch; os_family always "Android". Verified by a research subagent
// (2026-06-28). Models not listed harvest as spec_known=false (flagged, never guessed).

export interface MotorolaModelSpec {
  chipset: string
  screen_size: number // inches (foldables = main/outer per note)
  year: number // JP launch year
  ram_gb: number // base JP tier
  os_family: "Android"
}

export const MOTOROLA_SPECS: Record<string, MotorolaModelSpec> = {
  // --- moto g line ---
  "moto g05": { chipset: "MediaTek Helio G81 Extreme", screen_size: 6.67, year: 2025, ram_gb: 8, os_family: "Android" }, // XT2523-5
  "moto g30": { chipset: "Snapdragon 662", screen_size: 6.5, year: 2021, ram_gb: 4, os_family: "Android" }, // XT2129-2
  "moto g32": { chipset: "Snapdragon 680 4G", screen_size: 6.5, year: 2022, ram_gb: 4, os_family: "Android" }, // XT2235-3
  "moto g52j 5G": { chipset: "Snapdragon 695 5G", screen_size: 6.8, year: 2022, ram_gb: 6, os_family: "Android" }, // XT2219-1 (JP-exclusive, FeliCa)
  "moto g52j 5G II": { chipset: "Snapdragon 695 5G", screen_size: 6.8, year: 2023, ram_gb: 8, os_family: "Android" }, // XT2219-1 (8GB refresh)
  "moto g52j 5G SPECIAL": { chipset: "Snapdragon 695 5G", screen_size: 6.8, year: 2023, ram_gb: 8, os_family: "Android" }, // XT2219-1 (8/256 + bundle)
  "moto g53j 5G": { chipset: "Snapdragon 480+ 5G", screen_size: 6.5, year: 2023, ram_gb: 8, os_family: "Android" }, // XT2335-5 (JP-exclusive)
  "moto g100": { chipset: "Snapdragon 870 5G", screen_size: 6.7, year: 2021, ram_gb: 8, os_family: "Android" }, // XT2125-4

  // --- edge line ---
  "edge 20": { chipset: "Snapdragon 778G 5G", screen_size: 6.7, year: 2021, ram_gb: 6, os_family: "Android" }, // XT2143-1
  "edge 20 fusion": { chipset: "MediaTek Dimensity 800U", screen_size: 6.7, year: 2021, ram_gb: 6, os_family: "Android" }, // XT2139-2
  "edge 60": { chipset: "MediaTek Dimensity 7400", screen_size: 6.67, year: 2025, ram_gb: 8, os_family: "Android" }, // XT2505-5 (JP got 7400, not global 7300)

  // --- razr line (foldable; screen_size = main/internal display) ---
  "razr 40": { chipset: "Snapdragon 7 Gen 1", screen_size: 6.9, year: 2023, ram_gb: 8, os_family: "Android" }, // XT2323-4
  "razr 40 Ultra": { chipset: "Snapdragon 8+ Gen 1", screen_size: 6.9, year: 2023, ram_gb: 8, os_family: "Android" }, // XT2321-1
  "razr 40s": { chipset: "Snapdragon 7 Gen 1", screen_size: 6.9, year: 2023, ram_gb: 8, os_family: "Android" }, // SoftBank A303MO (rebadge of razr 40)
  "razr 50": { chipset: "MediaTek Dimensity 7300X", screen_size: 6.9, year: 2024, ram_gb: 8, os_family: "Android" }, // XT2453-9
  "razr 50d": { chipset: "MediaTek Dimensity 7300X", screen_size: 6.9, year: 2024, ram_gb: 8, os_family: "Android" }, // docomo M-51E (= base razr 50, NOT Ultra)
  "razr 60": { chipset: "MediaTek Dimensity 7400X", screen_size: 6.9, year: 2025, ram_gb: 8, os_family: "Android" }, // XT2553-8
  "razr 60 Ultra": { chipset: "Snapdragon 8 Elite", screen_size: 7.0, year: 2025, ram_gb: 12, os_family: "Android" }, // XT2551-7
}

/** Look up Motorola specs by canonical model name, or null if not in the reference. */
export function motorolaSpec(modelName: string | null | undefined): MotorolaModelSpec | null {
  if (!modelName) return null
  return MOTOROLA_SPECS[modelName.trim()] ?? null
}
