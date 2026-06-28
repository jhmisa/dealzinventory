// Built-in Google Pixel model -> spec reference.
// iosys does not surface chipset / screen size / release year / RAM for Android, so we enrich
// harvested SKUs from this table. Keyed by the *canonical* model name the Android listing parser
// produces (leading "Google"/carrier stripped, space inserted, e.g. "Pixel 10 Pro", "Pixel 7a",
// "Pixel 9 Pro Fold").
//
// JAPAN-MARKET: Japan has been a Pixel launch market since Pixel 3 (2018). ram_gb is the base tier;
// an explicit 【RAM..GB】 in a title overrides this fallback (Pixel listings usually omit RAM but
// carry inline storage). screen_size = main display (foldables = inner display). year = Japan launch
// year. os_family always "Android". Values verified against GSMArena / Google Store JP / Wikipedia /
// kakaku (2026-06-28 research pass).

export interface PixelModelSpec {
  chipset: string
  screen_size: number // inches (foldables = inner display)
  year: number // first release year (Japan)
  ram_gb: number // base tier
  os_family: "Android"
}

export const PIXEL_SPECS: Record<string, PixelModelSpec> = {
  // --- Pixel 3 / 3a ---
  "Pixel 3": { chipset: "Snapdragon 845", screen_size: 5.5, year: 2018, ram_gb: 4, os_family: "Android" },
  "Pixel 3 XL": { chipset: "Snapdragon 845", screen_size: 6.3, year: 2018, ram_gb: 4, os_family: "Android" },
  "Pixel 3a": { chipset: "Snapdragon 670", screen_size: 5.6, year: 2019, ram_gb: 4, os_family: "Android" },
  "Pixel 3a XL": { chipset: "Snapdragon 670", screen_size: 6.0, year: 2019, ram_gb: 4, os_family: "Android" },

  // --- Pixel 4 / 4a ---
  "Pixel 4": { chipset: "Snapdragon 855", screen_size: 5.7, year: 2019, ram_gb: 6, os_family: "Android" },
  "Pixel 4 XL": { chipset: "Snapdragon 855", screen_size: 6.3, year: 2019, ram_gb: 6, os_family: "Android" },
  "Pixel 4a": { chipset: "Snapdragon 730G", screen_size: 5.81, year: 2020, ram_gb: 6, os_family: "Android" },
  "Pixel 4a 5G": { chipset: "Snapdragon 765G", screen_size: 6.2, year: 2020, ram_gb: 6, os_family: "Android" },

  // --- Pixel 5 / 5a ---
  "Pixel 5": { chipset: "Snapdragon 765G", screen_size: 6.0, year: 2020, ram_gb: 8, os_family: "Android" },
  "Pixel 5a": { chipset: "Snapdragon 765G", screen_size: 6.34, year: 2021, ram_gb: 6, os_family: "Android" }, // US + Japan only
  "Pixel 5a 5G": { chipset: "Snapdragon 765G", screen_size: 6.34, year: 2021, ram_gb: 6, os_family: "Android" }, // alias — parser keeps the 5G suffix (official "Pixel 5a (5G)")

  // --- Pixel 6 / 6a (first Tensor) ---
  "Pixel 6": { chipset: "Google Tensor", screen_size: 6.4, year: 2021, ram_gb: 8, os_family: "Android" },
  "Pixel 6 Pro": { chipset: "Google Tensor", screen_size: 6.7, year: 2021, ram_gb: 12, os_family: "Android" },
  "Pixel 6a": { chipset: "Google Tensor", screen_size: 6.1, year: 2022, ram_gb: 6, os_family: "Android" },

  // --- Pixel 7 / 7a ---
  "Pixel 7": { chipset: "Google Tensor G2", screen_size: 6.3, year: 2022, ram_gb: 8, os_family: "Android" },
  "Pixel 7 Pro": { chipset: "Google Tensor G2", screen_size: 6.7, year: 2022, ram_gb: 12, os_family: "Android" },
  "Pixel 7a": { chipset: "Google Tensor G2", screen_size: 6.1, year: 2023, ram_gb: 8, os_family: "Android" },

  // --- Pixel 8 / 8a ---
  "Pixel 8": { chipset: "Google Tensor G3", screen_size: 6.2, year: 2023, ram_gb: 8, os_family: "Android" },
  "Pixel 8 Pro": { chipset: "Google Tensor G3", screen_size: 6.7, year: 2023, ram_gb: 12, os_family: "Android" },
  "Pixel 8a": { chipset: "Google Tensor G3", screen_size: 6.1, year: 2024, ram_gb: 8, os_family: "Android" },

  // --- Pixel 9 / 9a ---
  "Pixel 9": { chipset: "Google Tensor G4", screen_size: 6.3, year: 2024, ram_gb: 12, os_family: "Android" },
  "Pixel 9 Pro": { chipset: "Google Tensor G4", screen_size: 6.3, year: 2024, ram_gb: 16, os_family: "Android" },
  "Pixel 9 Pro XL": { chipset: "Google Tensor G4", screen_size: 6.8, year: 2024, ram_gb: 16, os_family: "Android" },
  "Pixel 9 Pro Fold": { chipset: "Google Tensor G4", screen_size: 8.0, year: 2024, ram_gb: 16, os_family: "Android" }, // inner display
  "Pixel 9a": { chipset: "Google Tensor G4", screen_size: 6.3, year: 2025, ram_gb: 8, os_family: "Android" },
  "Pixel 10a": { chipset: "Google Tensor G4", screen_size: 6.3, year: 2026, ram_gb: 8, os_family: "Android" }, // JP on-sale 2026-04-14 (GV0BP)

  // --- Pixel 10 ---
  "Pixel 10": { chipset: "Google Tensor G5", screen_size: 6.3, year: 2025, ram_gb: 12, os_family: "Android" },
  "Pixel 10 Pro": { chipset: "Google Tensor G5", screen_size: 6.3, year: 2025, ram_gb: 16, os_family: "Android" },
  "Pixel 10 Pro XL": { chipset: "Google Tensor G5", screen_size: 6.8, year: 2025, ram_gb: 16, os_family: "Android" },
  "Pixel 10 Pro Fold": { chipset: "Google Tensor G5", screen_size: 8.0, year: 2025, ram_gb: 16, os_family: "Android" }, // inner display

  // --- Original foldable (limited JP availability — kept for completeness; flagged if it appears) ---
  "Pixel Fold": { chipset: "Google Tensor G2", screen_size: 7.6, year: 2023, ram_gb: 12, os_family: "Android" }, // inner display; original 2023 fold may not be an official JP release
}

/** Look up Pixel specs by canonical model name, or null if not in the reference. */
export function pixelSpec(modelName: string | null | undefined): PixelModelSpec | null {
  if (!modelName) return null
  return PIXEL_SPECS[modelName.trim()] ?? null
}
