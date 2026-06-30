// Built-in Samsung Galaxy model -> spec reference.
// iosys does not surface chipset / screen size / release year / RAM for Android, so we enrich
// harvested SKUs from this table. Keyed by the *canonical* model name the Android listing parser
// produces (5G / Single-SIM / Samsung stripped, e.g. "Galaxy S24 Ultra", "Galaxy A53").
//
// JAPAN-SPECIFIC: every JP S-/Z-flagship ships Snapdragon (not the EU Exynos variant), and the
// JP-exclusive A22/A23 are 5.8" compact phones (NOT the 6.6" global models). ram_gb is the base
// tier. os_family is always "Android". Foldable screen_size = the main/inner display.
// Values verified against Samsung/GSMArena; entries that were uncertain are marked UNVERIFIED
// and should be re-confirmed before they drive pricing — never silently trusted.

export interface GalaxyModelSpec {
  chipset: string
  screen_size: number // inches
  year: number // first release year
  ram_gb: number // base tier
  os_family: "Android"
}

export const GALAXY_SPECS: Record<string, GalaxyModelSpec> = {
  // --- S10 series (2019) — JP carrier models use Snapdragon 855 ---
  "Galaxy S10": { chipset: "Snapdragon 855", screen_size: 6.1, year: 2019, ram_gb: 8, os_family: "Android" },
  "Galaxy S10+": { chipset: "Snapdragon 855", screen_size: 6.4, year: 2019, ram_gb: 8, os_family: "Android" },

  // --- S20 series (2020) — JP uses Snapdragon 865 ---
  "Galaxy S20": { chipset: "Snapdragon 865", screen_size: 6.2, year: 2020, ram_gb: 12, os_family: "Android" }, // UNVERIFIED RAM tier per JP SKU
  "Galaxy S20+": { chipset: "Snapdragon 865", screen_size: 6.7, year: 2020, ram_gb: 12, os_family: "Android" }, // UNVERIFIED RAM tier per JP SKU
  "Galaxy S20 Ultra": { chipset: "Snapdragon 865", screen_size: 6.9, year: 2020, ram_gb: 12, os_family: "Android" }, // 16GB high tier also existed

  // --- S21 series (2021) — JP uses Snapdragon 888 ---
  "Galaxy S21": { chipset: "Snapdragon 888", screen_size: 6.2, year: 2021, ram_gb: 8, os_family: "Android" },
  "Galaxy S21+": { chipset: "Snapdragon 888", screen_size: 6.7, year: 2021, ram_gb: 8, os_family: "Android" },
  "Galaxy S21 Ultra": { chipset: "Snapdragon 888", screen_size: 6.8, year: 2021, ram_gb: 12, os_family: "Android" }, // 16GB high tier also existed

  // --- S22 series (2022) — JP uses Snapdragon 8 Gen 1 ---
  "Galaxy S22": { chipset: "Snapdragon 8 Gen 1", screen_size: 6.1, year: 2022, ram_gb: 8, os_family: "Android" },
  "Galaxy S22 Ultra": { chipset: "Snapdragon 8 Gen 1", screen_size: 6.8, year: 2022, ram_gb: 12, os_family: "Android" }, // 8GB/128GB also exists; 12GB most common

  // --- S23 series (2023) — Snapdragon 8 Gen 2 for Galaxy worldwide ---
  "Galaxy S23": { chipset: "Snapdragon 8 Gen 2 for Galaxy", screen_size: 6.1, year: 2023, ram_gb: 8, os_family: "Android" },
  "Galaxy S23 FE": { chipset: "Snapdragon 8 Gen 1", screen_size: 6.4, year: 2023, ram_gb: 8, os_family: "Android" }, // UNVERIFIED JP chipset (Exynos 2200 vs SD8G1 by region)
  "Galaxy S23 Ultra": { chipset: "Snapdragon 8 Gen 2 for Galaxy", screen_size: 6.8, year: 2023, ram_gb: 8, os_family: "Android" }, // 12GB on higher storage

  // --- S24 series (2024) — JP/East Asia uses Snapdragon 8 Gen 3 ---
  "Galaxy S24": { chipset: "Snapdragon 8 Gen 3 for Galaxy", screen_size: 6.2, year: 2024, ram_gb: 8, os_family: "Android" },
  "Galaxy S24 Ultra": { chipset: "Snapdragon 8 Gen 3 for Galaxy", screen_size: 6.8, year: 2024, ram_gb: 12, os_family: "Android" },

  // --- S25 series (2025) — Snapdragon 8 Elite for Galaxy worldwide ---
  "Galaxy S25": { chipset: "Snapdragon 8 Elite for Galaxy", screen_size: 6.2, year: 2025, ram_gb: 12, os_family: "Android" },
  "Galaxy S25 Ultra": { chipset: "Snapdragon 8 Elite for Galaxy", screen_size: 6.9, year: 2025, ram_gb: 12, os_family: "Android" },

  // --- S26 series (2026) — JP/NA/China use Snapdragon 8 Elite Gen 5 for Galaxy (Exynos 2600 elsewhere on base/+) ---
  "Galaxy S26": { chipset: "Snapdragon 8 Elite Gen 5 for Galaxy", screen_size: 6.3, year: 2026, ram_gb: 12, os_family: "Android" },
  "Galaxy S26+": { chipset: "Snapdragon 8 Elite Gen 5 for Galaxy", screen_size: 6.7, year: 2026, ram_gb: 12, os_family: "Android" },
  "Galaxy S26 Ultra": { chipset: "Snapdragon 8 Elite Gen 5 for Galaxy", screen_size: 6.9, year: 2026, ram_gb: 12, os_family: "Android" }, // 16GB on 1TB tier

  // --- Z Flip (main folding display) ---
  "Galaxy Z Flip3": { chipset: "Snapdragon 888", screen_size: 6.7, year: 2021, ram_gb: 8, os_family: "Android" },
  "Galaxy Z Flip4": { chipset: "Snapdragon 8+ Gen 1", screen_size: 6.7, year: 2022, ram_gb: 8, os_family: "Android" },
  "Galaxy Z Flip5": { chipset: "Snapdragon 8 Gen 2 for Galaxy", screen_size: 6.7, year: 2023, ram_gb: 8, os_family: "Android" },
  "Galaxy Z Flip6": { chipset: "Snapdragon 8 Gen 3 for Galaxy", screen_size: 6.7, year: 2024, ram_gb: 12, os_family: "Android" },
  "Galaxy Z Flip7": { chipset: "Exynos 2500", screen_size: 6.9, year: 2025, ram_gb: 12, os_family: "Android" }, // UNVERIFIED JP chipset

  // --- Z Fold (inner display) ---
  "Galaxy Z Fold3": { chipset: "Snapdragon 888", screen_size: 7.6, year: 2021, ram_gb: 12, os_family: "Android" },
  "Galaxy Z Fold4": { chipset: "Snapdragon 8+ Gen 1", screen_size: 7.6, year: 2022, ram_gb: 12, os_family: "Android" },
  "Galaxy Z Fold5": { chipset: "Snapdragon 8 Gen 2 for Galaxy", screen_size: 7.6, year: 2023, ram_gb: 12, os_family: "Android" },
  "Galaxy Z Fold6": { chipset: "Snapdragon 8 Gen 3 for Galaxy", screen_size: 7.6, year: 2024, ram_gb: 12, os_family: "Android" },
  "Galaxy Z Fold7": { chipset: "Snapdragon 8 Elite for Galaxy", screen_size: 8.0, year: 2025, ram_gb: 12, os_family: "Android" }, // 16GB high tier exists

  // --- A-series ---
  "Galaxy A7": { chipset: "Exynos 7885", screen_size: 6.0, year: 2018, ram_gb: 4, os_family: "Android" }, // UNVERIFIED: assumes A7 (2018), 4GB tier
  "Galaxy A20": { chipset: "Exynos 7884", screen_size: 6.4, year: 2019, ram_gb: 3, os_family: "Android" },
  "Galaxy A30": { chipset: "Exynos 7904", screen_size: 6.4, year: 2019, ram_gb: 4, os_family: "Android" },
  "Galaxy A41": { chipset: "Helio P65", screen_size: 6.1, year: 2020, ram_gb: 4, os_family: "Android" },
  "Galaxy A51": { chipset: "Exynos 9611", screen_size: 6.5, year: 2019, ram_gb: 4, os_family: "Android" },
  "Galaxy A22": { chipset: "Dimensity 700", screen_size: 5.8, year: 2021, ram_gb: 4, os_family: "Android" }, // JP-exclusive A22 5G: 5.8" LCD (NOT 6.6" global)
  "Galaxy A23": { chipset: "Dimensity 700", screen_size: 5.8, year: 2022, ram_gb: 4, os_family: "Android" }, // JP-exclusive A23 5G: 5.8" LCD, IP68
  "Galaxy A25": { chipset: "Exynos 1280", screen_size: 6.5, year: 2024, ram_gb: 6, os_family: "Android" },
  "Galaxy A32": { chipset: "Dimensity 720", screen_size: 6.5, year: 2021, ram_gb: 4, os_family: "Android" }, // UNVERIFIED: spec'd as A32 5G
  "Galaxy A36": { chipset: "Snapdragon 6 Gen 3", screen_size: 6.7, year: 2025, ram_gb: 6, os_family: "Android" },
  "Galaxy A52": { chipset: "Snapdragon 750G", screen_size: 6.5, year: 2021, ram_gb: 8, os_family: "Android" }, // UNVERIFIED: spec'd as A52 5G
  "Galaxy A53": { chipset: "Exynos 1280", screen_size: 6.5, year: 2022, ram_gb: 6, os_family: "Android" }, // 8GB tier also sold
  "Galaxy A54": { chipset: "Exynos 1380", screen_size: 6.4, year: 2023, ram_gb: 6, os_family: "Android" }, // 8GB tier also sold
  "Galaxy A55": { chipset: "Exynos 1480", screen_size: 6.6, year: 2024, ram_gb: 8, os_family: "Android" }, // 12GB tier also sold
  "Galaxy A57": { chipset: "Exynos 1680", screen_size: 6.7, year: 2026, ram_gb: 8, os_family: "Android" }, // UNVERIFIED: very new, re-verify
}

/** Look up Galaxy specs by canonical model name, or null if not in the reference. */
export function galaxySpec(modelName: string | null | undefined): GalaxyModelSpec | null {
  if (!modelName) return null
  return GALAXY_SPECS[modelName.trim()] ?? null
}
