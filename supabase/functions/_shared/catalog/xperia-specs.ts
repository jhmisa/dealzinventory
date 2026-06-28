// Built-in Sony Xperia model -> spec reference.
// iosys does not surface chipset / screen size / release year / RAM for Android, so we enrich
// harvested SKUs from this table. Keyed by the *canonical* model name the Android listing parser
// produces ("Xperia1"/"5G"/"Dual-SIM"/"Sony" normalised, e.g. "Xperia 1 VI", "Xperia 10 V").
//
// JAPAN-MARKET: every JP carrier Xperia flagship ships the SAME Snapdragon SoC as the global model
// (Sony never used Exynos); JP variants differ only on RAM/storage tiers. ram_gb is the base tier;
// when a title carries an explicit 【RAM..GB】 the harvested value overrides this fallback.
// screen_size = main display diagonal (inches). year = Japan launch year. os_family always "Android".
// Values verified against GSMArena / Sony official / Wikipedia (2026-06-28 research pass).

export interface XperiaModelSpec {
  chipset: string
  screen_size: number // inches
  year: number // first release year (Japan)
  ram_gb: number // base tier
  os_family: "Android"
}

export const XPERIA_SPECS: Record<string, XperiaModelSpec> = {
  // --- Xperia 1 flagship line ---
  "Xperia 1": { chipset: "Snapdragon 855", screen_size: 6.5, year: 2019, ram_gb: 6, os_family: "Android" },
  "Xperia 1 II": { chipset: "Snapdragon 865", screen_size: 6.5, year: 2020, ram_gb: 8, os_family: "Android" }, // JP carrier (SO-51A) 8GB; global SIM-free XQ-AT42 12GB — parsed RAM overrides
  "Xperia 1 III": { chipset: "Snapdragon 888", screen_size: 6.5, year: 2021, ram_gb: 12, os_family: "Android" },
  "Xperia 1 IV": { chipset: "Snapdragon 8 Gen 1", screen_size: 6.5, year: 2022, ram_gb: 12, os_family: "Android" },
  "Xperia 1 V": { chipset: "Snapdragon 8 Gen 2", screen_size: 6.5, year: 2023, ram_gb: 12, os_family: "Android" },
  "Xperia 1 VI": { chipset: "Snapdragon 8 Gen 3", screen_size: 6.5, year: 2024, ram_gb: 12, os_family: "Android" },
  "Xperia 1 VII": { chipset: "Snapdragon 8 Elite", screen_size: 6.5, year: 2025, ram_gb: 12, os_family: "Android" },
  "Xperia 1 VIII": { chipset: "Snapdragon 8 Elite Gen 5", screen_size: 6.5, year: 2026, ram_gb: 12, os_family: "Android" }, // released 2026-06-19

  // --- Xperia 5 compact-flagship line ---
  "Xperia 5": { chipset: "Snapdragon 855", screen_size: 6.1, year: 2019, ram_gb: 6, os_family: "Android" },
  "Xperia 5 II": { chipset: "Snapdragon 865", screen_size: 6.1, year: 2020, ram_gb: 8, os_family: "Android" },
  "Xperia 5 III": { chipset: "Snapdragon 888", screen_size: 6.1, year: 2021, ram_gb: 8, os_family: "Android" },
  "Xperia 5 IV": { chipset: "Snapdragon 8 Gen 1", screen_size: 6.1, year: 2022, ram_gb: 8, os_family: "Android" },
  "Xperia 5 V": { chipset: "Snapdragon 8 Gen 2", screen_size: 6.1, year: 2023, ram_gb: 8, os_family: "Android" },

  // --- Xperia 8 ---
  "Xperia 8": { chipset: "Snapdragon 630", screen_size: 6.0, year: 2019, ram_gb: 4, os_family: "Android" },
  "Xperia 8 Lite": { chipset: "Snapdragon 630", screen_size: 6.0, year: 2020, ram_gb: 4, os_family: "Android" },

  // --- Xperia 10 mid-range line ---
  "Xperia 10": { chipset: "Snapdragon 630", screen_size: 6.0, year: 2019, ram_gb: 4, os_family: "Android" },
  "Xperia 10 II": { chipset: "Snapdragon 665", screen_size: 6.0, year: 2020, ram_gb: 4, os_family: "Android" },
  "Xperia 10 III": { chipset: "Snapdragon 690 5G", screen_size: 6.0, year: 2021, ram_gb: 6, os_family: "Android" },
  "Xperia 10 III Lite": { chipset: "Snapdragon 690 5G", screen_size: 6.0, year: 2021, ram_gb: 6, os_family: "Android" }, // SIM-free variant of 10 III, same specs
  "Xperia 10 IV": { chipset: "Snapdragon 695 5G", screen_size: 6.0, year: 2022, ram_gb: 6, os_family: "Android" },
  "Xperia 10 V": { chipset: "Snapdragon 695 5G", screen_size: 6.1, year: 2023, ram_gb: 6, os_family: "Android" },
  "Xperia 10 V Fun Edition": { chipset: "Snapdragon 695 5G", screen_size: 6.1, year: 2023, ram_gb: 6, os_family: "Android" }, // docomo special edition = Xperia 10 V specs
  "Xperia 10 VI": { chipset: "Snapdragon 6 Gen 1", screen_size: 6.1, year: 2024, ram_gb: 8, os_family: "Android" },
  "Xperia 10 VII": { chipset: "Snapdragon 6 Gen 3", screen_size: 6.1, year: 2025, ram_gb: 8, os_family: "Android" },

  // --- Xperia Ace compact line ---
  "Xperia Ace": { chipset: "Snapdragon 630", screen_size: 5.0, year: 2019, ram_gb: 4, os_family: "Android" },
  "Xperia Ace II": { chipset: "Helio P35", screen_size: 5.5, year: 2021, ram_gb: 4, os_family: "Android" },
  "Xperia Ace III": { chipset: "Snapdragon 480", screen_size: 5.5, year: 2022, ram_gb: 4, os_family: "Android" },

  // --- Xperia Pro line ---
  "Xperia Pro": { chipset: "Snapdragon 865", screen_size: 6.5, year: 2021, ram_gb: 12, os_family: "Android" },
  "Xperia Pro I": { chipset: "Snapdragon 888", screen_size: 6.5, year: 2021, ram_gb: 12, os_family: "Android" },

  // --- Xperia XZ legacy line (Snapdragon flagships) ---
  "Xperia XZ1": { chipset: "Snapdragon 835", screen_size: 5.2, year: 2017, ram_gb: 4, os_family: "Android" },
  "Xperia XZ1 Compact": { chipset: "Snapdragon 835", screen_size: 4.6, year: 2017, ram_gb: 4, os_family: "Android" },
  "Xperia XZ2": { chipset: "Snapdragon 845", screen_size: 5.7, year: 2018, ram_gb: 4, os_family: "Android" },
  "Xperia XZ2 Compact": { chipset: "Snapdragon 845", screen_size: 5.0, year: 2018, ram_gb: 4, os_family: "Android" },
  "Xperia XZ2 Premium": { chipset: "Snapdragon 845", screen_size: 5.8, year: 2018, ram_gb: 6, os_family: "Android" },
  "Xperia XZ3": { chipset: "Snapdragon 845", screen_size: 6.0, year: 2018, ram_gb: 4, os_family: "Android" },
}

/** Look up Xperia specs by canonical model name, or null if not in the reference. */
export function xperiaSpec(modelName: string | null | undefined): XperiaModelSpec | null {
  if (!modelName) return null
  return XPERIA_SPECS[modelName.trim()] ?? null
}
