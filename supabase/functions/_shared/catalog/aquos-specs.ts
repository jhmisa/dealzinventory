// Built-in Sharp AQUOS model -> spec reference.
// iosys does not surface chipset / screen size / release year / RAM for Android, so we enrich
// harvested SKUs from this table. Keyed by the *canonical* model name the Android listing parser
// produces (leading carrier/brand stripped, "AQUOS" normalised uppercase, e.g. "AQUOS sense9",
// "AQUOS R10", "AQUOS wish3").
//
// JAPAN-MARKET: every value below is the JP-market variant. Where the JP carrier SKU differs from
// the global model on RAM (Sharp ships market-specific tiers), the JP base tier is used; an explicit
// 【RAM..GB】 in a title overrides this fallback. screen_size = main display diagonal (inches).
// year = Japan launch year. os_family always "Android".
// Values verified against GSMArena / Sharp JP / docomo·SoftBank official / kakaku (2026-06-28 research
// pass). JP-specific RAM caveats noted inline.

export interface AquosModelSpec {
  chipset: string
  screen_size: number // inches
  year: number // first release year (Japan)
  ram_gb: number // JP base tier
  os_family: "Android"
}

export const AQUOS_SPECS: Record<string, AquosModelSpec> = {
  // --- R flagship line ---
  "AQUOS R10": { chipset: "Snapdragon 7+ Gen 3", screen_size: 6.5, year: 2025, ram_gb: 12, os_family: "Android" },
  "AQUOS R9": { chipset: "Snapdragon 7+ Gen 3", screen_size: 6.5, year: 2024, ram_gb: 12, os_family: "Android" },
  "AQUOS R9 pro": { chipset: "Snapdragon 8s Gen 3", screen_size: 6.7, year: 2024, ram_gb: 12, os_family: "Android" }, // docomo SH-54E

  "AQUOS R8": { chipset: "Snapdragon 8 Gen 2", screen_size: 6.39, year: 2023, ram_gb: 8, os_family: "Android" }, // JP SH-52D = 8GB (global R8s 12GB)
  "AQUOS R8 pro": { chipset: "Snapdragon 8 Gen 2", screen_size: 6.6, year: 2023, ram_gb: 12, os_family: "Android" },
  "AQUOS R7": { chipset: "Snapdragon 8 Gen 1", screen_size: 6.6, year: 2022, ram_gb: 12, os_family: "Android" },
  "AQUOS R6": { chipset: "Snapdragon 888", screen_size: 6.6, year: 2021, ram_gb: 12, os_family: "Android" },
  "AQUOS R5G": { chipset: "Snapdragon 865", screen_size: 6.4, year: 2020, ram_gb: 12, os_family: "Android" },
  "AQUOS R3": { chipset: "Snapdragon 855", screen_size: 6.2, year: 2019, ram_gb: 6, os_family: "Android" },
  "AQUOS R2": { chipset: "Snapdragon 845", screen_size: 6.0, year: 2018, ram_gb: 4, os_family: "Android" },
  "AQUOS R": { chipset: "Snapdragon 835", screen_size: 5.3, year: 2017, ram_gb: 4, os_family: "Android" },
  "AQUOS R compact": { chipset: "Snapdragon 660", screen_size: 4.9, year: 2017, ram_gb: 3, os_family: "Android" },

  // --- sense mid-range line ---
  "AQUOS sense10": { chipset: "Snapdragon 7s Gen 3", screen_size: 6.1, year: 2025, ram_gb: 8, os_family: "Android" },
  "AQUOS sense9": { chipset: "Snapdragon 7s Gen 2", screen_size: 6.1, year: 2024, ram_gb: 6, os_family: "Android" },
  "AQUOS sense8": { chipset: "Snapdragon 6 Gen 1", screen_size: 6.1, year: 2023, ram_gb: 6, os_family: "Android" }, // JP carrier base 6GB
  "AQUOS sense7": { chipset: "Snapdragon 695 5G", screen_size: 6.1, year: 2022, ram_gb: 6, os_family: "Android" },
  "AQUOS sense7 plus": { chipset: "Snapdragon 695 5G", screen_size: 6.4, year: 2022, ram_gb: 6, os_family: "Android" }, // JP-exclusive SoftBank A208SH
  "AQUOS sense6": { chipset: "Snapdragon 690 5G", screen_size: 6.1, year: 2021, ram_gb: 4, os_family: "Android" },
  "AQUOS sense6s": { chipset: "Snapdragon 695 5G", screen_size: 6.1, year: 2022, ram_gb: 4, os_family: "Android" },
  "AQUOS sense5G": { chipset: "Snapdragon 690 5G", screen_size: 5.8, year: 2021, ram_gb: 4, os_family: "Android" },
  "AQUOS sense4": { chipset: "Snapdragon 720G", screen_size: 5.8, year: 2020, ram_gb: 4, os_family: "Android" },
  "AQUOS sense4 plus": { chipset: "Snapdragon 720G", screen_size: 6.7, year: 2020, ram_gb: 8, os_family: "Android" },
  "AQUOS sense4 lite": { chipset: "Snapdragon 720G", screen_size: 5.8, year: 2020, ram_gb: 4, os_family: "Android" }, // Rakuten SH-RM15
  "AQUOS sense4 basic": { chipset: "Snapdragon 720G", screen_size: 5.8, year: 2020, ram_gb: 3, os_family: "Android" }, // SoftBank A003SH
  "AQUOS sense3": { chipset: "Snapdragon 630", screen_size: 5.5, year: 2019, ram_gb: 4, os_family: "Android" },
  "AQUOS sense3 lite": { chipset: "Snapdragon 630", screen_size: 5.5, year: 2019, ram_gb: 4, os_family: "Android" }, // Rakuten SH-RM12, same HW
  "AQUOS sense3 plus": { chipset: "Snapdragon 636", screen_size: 6.0, year: 2019, ram_gb: 6, os_family: "Android" },
  "AQUOS sense3 plus サウンド": { chipset: "Snapdragon 636", screen_size: 6.0, year: 2019, ram_gb: 6, os_family: "Android" }, // Rakuten SH-RM11 "sound", same HW
  "AQUOS sense3 basic": { chipset: "Snapdragon 630", screen_size: 5.5, year: 2020, ram_gb: 3, os_family: "Android" }, // au SHV48
  "AQUOS sense2": { chipset: "Snapdragon 450", screen_size: 5.5, year: 2018, ram_gb: 3, os_family: "Android" },
  "AQUOS sense2 かんたん": { chipset: "Snapdragon 450", screen_size: 5.5, year: 2019, ram_gb: 3, os_family: "Android" }, // au easy-mode edition, sense2 HW; exact かんたん launch year unverified
  "AQUOS sense": { chipset: "Snapdragon 430", screen_size: 5.0, year: 2017, ram_gb: 3, os_family: "Android" },
  "AQUOS sense plus": { chipset: "Snapdragon 630", screen_size: 5.5, year: 2018, ram_gb: 3, os_family: "Android" }, // SIM-free SH-M07

  // --- wish entry line ---
  "AQUOS wish": { chipset: "Snapdragon 480 5G", screen_size: 5.7, year: 2022, ram_gb: 4, os_family: "Android" },
  "AQUOS wish2": { chipset: "Snapdragon 695 5G", screen_size: 5.7, year: 2022, ram_gb: 4, os_family: "Android" },
  "AQUOS wish3": { chipset: "Dimensity 700 5G", screen_size: 5.7, year: 2023, ram_gb: 4, os_family: "Android" },
  "AQUOS wish4": { chipset: "Dimensity 700", screen_size: 6.6, year: 2024, ram_gb: 6, os_family: "Android" },

  // --- zero thin/OLED line ---
  "AQUOS zero": { chipset: "Snapdragon 845", screen_size: 6.2, year: 2018, ram_gb: 6, os_family: "Android" },
  "AQUOS zero2": { chipset: "Snapdragon 855", screen_size: 6.4, year: 2020, ram_gb: 8, os_family: "Android" },
  "AQUOS zero5G basic": { chipset: "Snapdragon 765G", screen_size: 6.4, year: 2020, ram_gb: 6, os_family: "Android" },
  "AQUOS zero5G basic DX": { chipset: "Snapdragon 765G", screen_size: 6.4, year: 2020, ram_gb: 8, os_family: "Android" }, // au SHG02, 8GB
}

/** Look up AQUOS specs by canonical model name, or null if not in the reference. */
export function aquosSpec(modelName: string | null | undefined): AquosModelSpec | null {
  if (!modelName) return null
  return AQUOS_SPECS[modelName.trim()] ?? null
}
