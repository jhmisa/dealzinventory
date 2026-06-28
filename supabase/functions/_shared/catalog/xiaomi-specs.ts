// Built-in Xiaomi (Xiaomi flagship / Redmi / POCO / Mi) model -> spec reference.
// iosys does not surface chipset / screen size / release year / RAM for Android, so we enrich
// harvested SKUs from this table. Keyed by the *canonical* model name the Android listing parser
// produces ("Xiaomi" kept for the flagship line, sub-brand kept for Redmi/POCO/Mi, "5G"/SIM
// markers stripped, spaces normalized — e.g. "Xiaomi 15T Pro", "Redmi Note 13 Pro+", "POCO F7
// Ultra", "Mi 11 Lite").
//
// JAPAN-MARKET: ram_gb is the base tier; an explicit 【RAM..GB】 in a title overrides this fallback
// (Xiaomi titles usually carry RAM). screen_size = main display (inches). year = Japan/global
// launch year. os_family always "Android". Values verified against GSMArena / mi.com/jp / carrier
// pages / KHwang9883 MobileModels DB (2026-06-28 research pass).
//
// DELIBERATELY OMITTED (research flagged UNVERIFIED — they harvest as spec_known=false, flagged,
// never guessed; backfill when confirmed): "Redmi 15", "Redmi Note 15" (base), "POCO M8" (RAM
// tier unverified), "Xiaomi 17T Pro" (screen size unverified).

export interface XiaomiModelSpec {
  chipset: string
  screen_size: number // inches
  year: number // first release year (Japan/global)
  ram_gb: number // base tier
  os_family: "Android"
}

export const XIAOMI_SPECS: Record<string, XiaomiModelSpec> = {
  // --- Xiaomi flagship / T line ---
  "Xiaomi 11T": { chipset: "MediaTek Dimensity 1200-Ultra", screen_size: 6.67, year: 2021, ram_gb: 8, os_family: "Android" },
  "Xiaomi 11T Pro": { chipset: "Snapdragon 888", screen_size: 6.67, year: 2021, ram_gb: 8, os_family: "Android" },
  "Xiaomi 12T Pro": { chipset: "Snapdragon 8+ Gen 1", screen_size: 6.67, year: 2022, ram_gb: 8, os_family: "Android" },
  "Xiaomi 13T": { chipset: "MediaTek Dimensity 8200-Ultra", screen_size: 6.67, year: 2023, ram_gb: 8, os_family: "Android" },
  "Xiaomi 14T": { chipset: "MediaTek Dimensity 8300-Ultra", screen_size: 6.67, year: 2024, ram_gb: 12, os_family: "Android" },
  "Xiaomi 14T Pro": { chipset: "MediaTek Dimensity 9300+", screen_size: 6.67, year: 2024, ram_gb: 12, os_family: "Android" },
  "Xiaomi 15T Pro": { chipset: "MediaTek Dimensity 9400+", screen_size: 6.83, year: 2025, ram_gb: 12, os_family: "Android" },
  "Xiaomi 14 Ultra": { chipset: "Snapdragon 8 Gen 3", screen_size: 6.73, year: 2024, ram_gb: 16, os_family: "Android" },
  "Xiaomi 15": { chipset: "Snapdragon 8 Elite", screen_size: 6.36, year: 2025, ram_gb: 12, os_family: "Android" }, // compact flagship
  "Xiaomi 15 Ultra": { chipset: "Snapdragon 8 Elite", screen_size: 6.73, year: 2025, ram_gb: 16, os_family: "Android" },
  "Xiaomi 17 Ultra": { chipset: "Snapdragon 8 Elite Gen 5", screen_size: 6.9, year: 2026, ram_gb: 16, os_family: "Android" },

  // --- Redmi line ---
  "Redmi 9T": { chipset: "Snapdragon 662", screen_size: 6.53, year: 2021, ram_gb: 4, os_family: "Android" },
  "Redmi 12": { chipset: "Snapdragon 4 Gen 2", screen_size: 6.79, year: 2023, ram_gb: 4, os_family: "Android" }, // JP "Redmi 12 5G" (au XIG03 / SoftBank A401XM)
  "Redmi 12C": { chipset: "MediaTek Helio G85", screen_size: 6.71, year: 2023, ram_gb: 4, os_family: "Android" },
  "Redmi 14C": { chipset: "MediaTek Helio G81-Ultra", screen_size: 6.88, year: 2024, ram_gb: 4, os_family: "Android" },
  "Redmi Note 9S": { chipset: "Snapdragon 720G", screen_size: 6.67, year: 2020, ram_gb: 4, os_family: "Android" },
  "Redmi Note 9T": { chipset: "MediaTek Dimensity 800U", screen_size: 6.53, year: 2021, ram_gb: 4, os_family: "Android" }, // JP SoftBank A001XM
  "Redmi Note 10T": { chipset: "Snapdragon 480 5G", screen_size: 6.5, year: 2022, ram_gb: 4, os_family: "Android" }, // JP SoftBank A101XM
  "Redmi Note 10 JE": { chipset: "Snapdragon 480 5G", screen_size: 6.5, year: 2021, ram_gb: 4, os_family: "Android" }, // JP au XIG02
  "Redmi Note 11": { chipset: "Snapdragon 680", screen_size: 6.43, year: 2022, ram_gb: 4, os_family: "Android" },
  "Redmi Note 13 Pro": { chipset: "Snapdragon 7s Gen 2", screen_size: 6.67, year: 2024, ram_gb: 8, os_family: "Android" }, // JP au XIG05
  "Redmi Note 13 Pro+": { chipset: "MediaTek Dimensity 7200-Ultra", screen_size: 6.67, year: 2023, ram_gb: 8, os_family: "Android" },
  "Redmi Note 15 Pro": { chipset: "MediaTek Dimensity 7400-Ultra", screen_size: 6.83, year: 2025, ram_gb: 8, os_family: "Android" },

  // --- POCO line ---
  "POCO F4 GT": { chipset: "Snapdragon 8 Gen 1", screen_size: 6.67, year: 2022, ram_gb: 8, os_family: "Android" },
  "POCO F6 Pro": { chipset: "Snapdragon 8 Gen 2", screen_size: 6.67, year: 2024, ram_gb: 12, os_family: "Android" },
  "POCO F7": { chipset: "Snapdragon 8s Gen 4", screen_size: 6.83, year: 2025, ram_gb: 12, os_family: "Android" },
  "POCO F7 Ultra": { chipset: "Snapdragon 8 Elite", screen_size: 6.67, year: 2025, ram_gb: 12, os_family: "Android" },
  "POCO X7 Pro": { chipset: "MediaTek Dimensity 8400-Ultra", screen_size: 6.67, year: 2025, ram_gb: 8, os_family: "Android" },
  "POCO X8 Pro": { chipset: "MediaTek Dimensity 8500-Ultra", screen_size: 6.59, year: 2026, ram_gb: 12, os_family: "Android" },
  "POCO X8 Pro Max": { chipset: "MediaTek Dimensity 9500s", screen_size: 6.83, year: 2026, ram_gb: 12, os_family: "Android" },

  // --- Mi (older) line ---
  "Mi 10 Lite": { chipset: "Snapdragon 765G", screen_size: 6.57, year: 2020, ram_gb: 6, os_family: "Android" }, // JP au XIG01 (5G stripped from name)
  "Mi 11 Lite": { chipset: "Snapdragon 780G", screen_size: 6.55, year: 2021, ram_gb: 6, os_family: "Android" }, // JP SIM-free (5G stripped from name)
}

/** Look up Xiaomi specs by canonical model name, or null if not in the reference. */
export function xiaomiSpec(modelName: string | null | undefined): XiaomiModelSpec | null {
  if (!modelName) return null
  return XIAOMI_SPECS[modelName.trim()] ?? null
}
