// Built-in iPad model -> spec reference.
// iosys does not reliably surface chipset / screen size / release year / RAM, so we enrich
// harvested SKUs from this table. Keyed by the *connectivity-less* canonical model name the
// iPad listing parser produces (e.g. "iPad Air (5th generation)", "iPad Pro 12.9-inch
// (5th generation)", "iPad mini (A17 Pro)"). One entry per physical model; the Wi-Fi vs
// Wi-Fi+Cellular split is encoded in product_models.model_name, not here.
//
// Specs are the publicly documented figures (Apple Tech Specs / "Identify your iPad").
// ram_gb is the base/most-common tier; some Pro models ship more RAM on 1TB+ tiers — noted
// inline where it differs. os_family is always "iPadOS".

export interface IpadModelSpec {
  chipset: string
  screen_size: number // inches
  year: number // first release year
  ram_gb: number // base tier
  os_family: string
}

export const IPAD_SPECS: Record<string, IpadModelSpec> = {
  // --- iPad (numbered / year line) ---
  "iPad (2nd generation)": { chipset: "A5", screen_size: 9.7, year: 2011, ram_gb: 0.5, os_family: "iPadOS" },
  "iPad (3rd generation)": { chipset: "A5X", screen_size: 9.7, year: 2012, ram_gb: 1, os_family: "iPadOS" },
  "iPad (4th generation)": { chipset: "A6X", screen_size: 9.7, year: 2012, ram_gb: 1, os_family: "iPadOS" },
  "iPad (5th generation)": { chipset: "A9", screen_size: 9.7, year: 2017, ram_gb: 2, os_family: "iPadOS" },
  "iPad (6th generation)": { chipset: "A10 Fusion", screen_size: 9.7, year: 2018, ram_gb: 2, os_family: "iPadOS" },
  "iPad (7th generation)": { chipset: "A10 Fusion", screen_size: 10.2, year: 2019, ram_gb: 3, os_family: "iPadOS" },
  "iPad (8th generation)": { chipset: "A12 Bionic", screen_size: 10.2, year: 2020, ram_gb: 3, os_family: "iPadOS" },
  "iPad (9th generation)": { chipset: "A13 Bionic", screen_size: 10.2, year: 2021, ram_gb: 3, os_family: "iPadOS" },
  "iPad (10th generation)": { chipset: "A14 Bionic", screen_size: 10.9, year: 2022, ram_gb: 4, os_family: "iPadOS" },
  "iPad (11th generation)": { chipset: "A16", screen_size: 11.0, year: 2025, ram_gb: 6, os_family: "iPadOS" },

  // --- iPad mini ---
  "iPad mini (1st generation)": { chipset: "A5", screen_size: 7.9, year: 2012, ram_gb: 0.5, os_family: "iPadOS" },
  "iPad mini (2nd generation)": { chipset: "A7", screen_size: 7.9, year: 2013, ram_gb: 1, os_family: "iPadOS" },
  "iPad mini (3rd generation)": { chipset: "A7", screen_size: 7.9, year: 2014, ram_gb: 1, os_family: "iPadOS" },
  "iPad mini (4th generation)": { chipset: "A8", screen_size: 7.9, year: 2015, ram_gb: 2, os_family: "iPadOS" },
  "iPad mini (5th generation)": { chipset: "A12 Bionic", screen_size: 7.9, year: 2019, ram_gb: 3, os_family: "iPadOS" },
  "iPad mini (6th generation)": { chipset: "A15 Bionic", screen_size: 8.3, year: 2021, ram_gb: 4, os_family: "iPadOS" },
  "iPad mini (A17 Pro)": { chipset: "A17 Pro", screen_size: 8.3, year: 2024, ram_gb: 8, os_family: "iPadOS" },

  // --- iPad Air ---
  "iPad Air (1st generation)": { chipset: "A7", screen_size: 9.7, year: 2013, ram_gb: 1, os_family: "iPadOS" },
  "iPad Air (2nd generation)": { chipset: "A8X", screen_size: 9.7, year: 2014, ram_gb: 2, os_family: "iPadOS" },
  "iPad Air (3rd generation)": { chipset: "A12 Bionic", screen_size: 10.5, year: 2019, ram_gb: 3, os_family: "iPadOS" },
  "iPad Air (4th generation)": { chipset: "A14 Bionic", screen_size: 10.9, year: 2020, ram_gb: 4, os_family: "iPadOS" },
  "iPad Air (5th generation)": { chipset: "M1", screen_size: 10.9, year: 2022, ram_gb: 8, os_family: "iPadOS" },
  "iPad Air 11-inch (M2)": { chipset: "M2", screen_size: 11.0, year: 2024, ram_gb: 8, os_family: "iPadOS" },
  "iPad Air 13-inch (M2)": { chipset: "M2", screen_size: 13.0, year: 2024, ram_gb: 8, os_family: "iPadOS" },
  "iPad Air 11-inch (M3)": { chipset: "M3", screen_size: 11.0, year: 2025, ram_gb: 8, os_family: "iPadOS" },
  "iPad Air 13-inch (M3)": { chipset: "M3", screen_size: 13.0, year: 2025, ram_gb: 8, os_family: "iPadOS" },

  // --- iPad Pro ---
  "iPad Pro 9.7-inch": { chipset: "A9X", screen_size: 9.7, year: 2016, ram_gb: 2, os_family: "iPadOS" },
  "iPad Pro 10.5-inch": { chipset: "A10X Fusion", screen_size: 10.5, year: 2017, ram_gb: 4, os_family: "iPadOS" },
  "iPad Pro 12.9-inch (1st generation)": { chipset: "A9X", screen_size: 12.9, year: 2015, ram_gb: 4, os_family: "iPadOS" },
  "iPad Pro 12.9-inch (2nd generation)": { chipset: "A10X Fusion", screen_size: 12.9, year: 2017, ram_gb: 4, os_family: "iPadOS" },
  "iPad Pro 11-inch (1st generation)": { chipset: "A12X Bionic", screen_size: 11.0, year: 2018, ram_gb: 4, os_family: "iPadOS" }, // 6GB on 1TB
  "iPad Pro 12.9-inch (3rd generation)": { chipset: "A12X Bionic", screen_size: 12.9, year: 2018, ram_gb: 4, os_family: "iPadOS" }, // 6GB on 1TB
  "iPad Pro 11-inch (2nd generation)": { chipset: "A12Z Bionic", screen_size: 11.0, year: 2020, ram_gb: 6, os_family: "iPadOS" },
  "iPad Pro 12.9-inch (4th generation)": { chipset: "A12Z Bionic", screen_size: 12.9, year: 2020, ram_gb: 6, os_family: "iPadOS" },
  "iPad Pro 11-inch (3rd generation)": { chipset: "M1", screen_size: 11.0, year: 2021, ram_gb: 8, os_family: "iPadOS" }, // 16GB on 1TB/2TB
  "iPad Pro 12.9-inch (5th generation)": { chipset: "M1", screen_size: 12.9, year: 2021, ram_gb: 8, os_family: "iPadOS" }, // 16GB on 1TB/2TB
  "iPad Pro 11-inch (4th generation)": { chipset: "M2", screen_size: 11.0, year: 2022, ram_gb: 8, os_family: "iPadOS" }, // 16GB on 1TB/2TB
  "iPad Pro 12.9-inch (6th generation)": { chipset: "M2", screen_size: 12.9, year: 2022, ram_gb: 8, os_family: "iPadOS" }, // 16GB on 1TB/2TB
  "iPad Pro 11-inch (M4)": { chipset: "M4", screen_size: 11.0, year: 2024, ram_gb: 8, os_family: "iPadOS" }, // 16GB on 1TB/2TB
  "iPad Pro 13-inch (M4)": { chipset: "M4", screen_size: 13.0, year: 2024, ram_gb: 8, os_family: "iPadOS" }, // 16GB on 1TB/2TB
  "iPad Pro 11-inch (M5)": { chipset: "M5", screen_size: 11.0, year: 2025, ram_gb: 12, os_family: "iPadOS" }, // 16GB on 1TB/2TB
  "iPad Pro 13-inch (M5)": { chipset: "M5", screen_size: 13.0, year: 2025, ram_gb: 12, os_family: "iPadOS" }, // 16GB on 1TB/2TB
}

/** Strip the trailing connectivity suffix to get the spec key. */
export function ipadCanonicalBase(modelName: string | null | undefined): string | null {
  if (!modelName) return null
  return modelName.replace(/\s+Wi-Fi(\s*\+\s*Cellular)?\s*$/i, "").trim()
}

/** Look up iPad specs by full or connectivity-less model name, or null if not in the reference. */
export function ipadSpec(modelName: string | null | undefined): IpadModelSpec | null {
  const base = ipadCanonicalBase(modelName)
  if (!base) return null
  return IPAD_SPECS[base] ?? null
}
