// Built-in iPhone model -> spec reference.
// iosys does not reliably surface chipset / screen size / release year / RAM, so we
// enrich harvested SKUs from this table keyed by canonical model_name.
//
// Keys MUST match the canonical model_name produced by the iosys adapter's model split
// (e.g. "iPhone 12", "iPhone 13 Pro Max", "iPhone SE (2nd generation)").
// RAM is the publicly documented figure; os_family is always "iOS" for iPhone.

export interface ModelSpec {
  chipset: string
  screen_size: number // inches
  year: number // first release year
  ram_gb: number
  os_family: string
}

export const IPHONE_SPECS: Record<string, ModelSpec> = {
  // --- SE line ---
  "iPhone SE (1st generation)": { chipset: "A9", screen_size: 4.0, year: 2016, ram_gb: 2, os_family: "iOS" },
  "iPhone SE (2nd generation)": { chipset: "A13 Bionic", screen_size: 4.7, year: 2020, ram_gb: 3, os_family: "iOS" },
  "iPhone SE (3rd generation)": { chipset: "A15 Bionic", screen_size: 4.7, year: 2022, ram_gb: 4, os_family: "iOS" },

  // --- 6s / 7 (older units still traded) ---
  "iPhone 6s": { chipset: "A9", screen_size: 4.7, year: 2015, ram_gb: 2, os_family: "iOS" },
  "iPhone 6s Plus": { chipset: "A9", screen_size: 5.5, year: 2015, ram_gb: 2, os_family: "iOS" },
  "iPhone 7": { chipset: "A10 Fusion", screen_size: 4.7, year: 2016, ram_gb: 2, os_family: "iOS" },
  "iPhone 7 Plus": { chipset: "A10 Fusion", screen_size: 5.5, year: 2016, ram_gb: 3, os_family: "iOS" },

  // --- 8 / X ---
  "iPhone 8": { chipset: "A11 Bionic", screen_size: 4.7, year: 2017, ram_gb: 2, os_family: "iOS" },
  "iPhone 8 Plus": { chipset: "A11 Bionic", screen_size: 5.5, year: 2017, ram_gb: 3, os_family: "iOS" },
  "iPhone X": { chipset: "A11 Bionic", screen_size: 5.8, year: 2017, ram_gb: 3, os_family: "iOS" },
  "iPhone XR": { chipset: "A12 Bionic", screen_size: 6.1, year: 2018, ram_gb: 3, os_family: "iOS" },
  "iPhone XS": { chipset: "A12 Bionic", screen_size: 5.8, year: 2018, ram_gb: 4, os_family: "iOS" },
  "iPhone XS Max": { chipset: "A12 Bionic", screen_size: 6.5, year: 2018, ram_gb: 4, os_family: "iOS" },

  // --- 11 ---
  "iPhone 11": { chipset: "A13 Bionic", screen_size: 6.1, year: 2019, ram_gb: 4, os_family: "iOS" },
  "iPhone 11 Pro": { chipset: "A13 Bionic", screen_size: 5.8, year: 2019, ram_gb: 4, os_family: "iOS" },
  "iPhone 11 Pro Max": { chipset: "A13 Bionic", screen_size: 6.5, year: 2019, ram_gb: 4, os_family: "iOS" },

  // --- 12 ---
  "iPhone 12 mini": { chipset: "A14 Bionic", screen_size: 5.4, year: 2020, ram_gb: 4, os_family: "iOS" },
  "iPhone 12": { chipset: "A14 Bionic", screen_size: 6.1, year: 2020, ram_gb: 4, os_family: "iOS" },
  "iPhone 12 Pro": { chipset: "A14 Bionic", screen_size: 6.1, year: 2020, ram_gb: 6, os_family: "iOS" },
  "iPhone 12 Pro Max": { chipset: "A14 Bionic", screen_size: 6.7, year: 2020, ram_gb: 6, os_family: "iOS" },

  // --- 13 ---
  "iPhone 13 mini": { chipset: "A15 Bionic", screen_size: 5.4, year: 2021, ram_gb: 4, os_family: "iOS" },
  "iPhone 13": { chipset: "A15 Bionic", screen_size: 6.1, year: 2021, ram_gb: 4, os_family: "iOS" },
  "iPhone 13 Pro": { chipset: "A15 Bionic", screen_size: 6.1, year: 2021, ram_gb: 6, os_family: "iOS" },
  "iPhone 13 Pro Max": { chipset: "A15 Bionic", screen_size: 6.7, year: 2021, ram_gb: 6, os_family: "iOS" },

  // --- 14 ---
  "iPhone 14": { chipset: "A15 Bionic", screen_size: 6.1, year: 2022, ram_gb: 6, os_family: "iOS" },
  "iPhone 14 Plus": { chipset: "A15 Bionic", screen_size: 6.7, year: 2022, ram_gb: 6, os_family: "iOS" },
  "iPhone 14 Pro": { chipset: "A16 Bionic", screen_size: 6.1, year: 2022, ram_gb: 6, os_family: "iOS" },
  "iPhone 14 Pro Max": { chipset: "A16 Bionic", screen_size: 6.7, year: 2022, ram_gb: 6, os_family: "iOS" },

  // --- 15 ---
  "iPhone 15": { chipset: "A16 Bionic", screen_size: 6.1, year: 2023, ram_gb: 6, os_family: "iOS" },
  "iPhone 15 Plus": { chipset: "A16 Bionic", screen_size: 6.7, year: 2023, ram_gb: 6, os_family: "iOS" },
  "iPhone 15 Pro": { chipset: "A17 Pro", screen_size: 6.1, year: 2023, ram_gb: 8, os_family: "iOS" },
  "iPhone 15 Pro Max": { chipset: "A17 Pro", screen_size: 6.7, year: 2023, ram_gb: 8, os_family: "iOS" },

  // --- 16 ---
  "iPhone 16": { chipset: "A18", screen_size: 6.1, year: 2024, ram_gb: 8, os_family: "iOS" },
  "iPhone 16 Plus": { chipset: "A18", screen_size: 6.7, year: 2024, ram_gb: 8, os_family: "iOS" },
  "iPhone 16 Pro": { chipset: "A18 Pro", screen_size: 6.3, year: 2024, ram_gb: 8, os_family: "iOS" },
  "iPhone 16 Pro Max": { chipset: "A18 Pro", screen_size: 6.9, year: 2024, ram_gb: 8, os_family: "iOS" },
  "iPhone 16e": { chipset: "A18", screen_size: 6.1, year: 2025, ram_gb: 8, os_family: "iOS" },

  // --- 17 / Air (2025) + 17e (2026) — specs verified from Apple/GSMArena/Wikipedia 2026-06 ---
  "iPhone 17": { chipset: "A19", screen_size: 6.3, year: 2025, ram_gb: 8, os_family: "iOS" },
  "iPhone 17 Pro": { chipset: "A19 Pro", screen_size: 6.3, year: 2025, ram_gb: 12, os_family: "iOS" },
  "iPhone 17 Pro Max": { chipset: "A19 Pro", screen_size: 6.9, year: 2025, ram_gb: 12, os_family: "iOS" },
  "iPhone Air": { chipset: "A19 Pro", screen_size: 6.5, year: 2025, ram_gb: 12, os_family: "iOS" },
  "iPhone 17e": { chipset: "A19", screen_size: 6.1, year: 2026, ram_gb: 8, os_family: "iOS" },
}

/**
 * Canonicalize a dirty live `model_name` to the form used as IPHONE_SPECS keys
 * (and the form we want stored after Phase 2 cleanup). Returns the input trimmed
 * if it is not recognizably an iPhone, so non-iPhone names pass through unchanged.
 *
 * Handles the dirt observed in live product_models, e.g.:
 *   "IPhone 11"      -> "iPhone 11"      (prefix casing)
 *   "iPhone 12 "     -> "iPhone 12"      (trailing space)
 *   "iPhone 12 Mini" -> "iPhone 12 mini" (Apple uses lowercase "mini")
 *   "iPhone SE 2"    -> "iPhone SE (2nd generation)"
 *   "iPhone SE2"     -> "iPhone SE (2nd generation)"
 */
export function normalizeIphoneModelName(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = raw.replace(/[\s　]+/g, " ").trim()
  // Fix the "iPhone" prefix casing regardless of how it was typed.
  s = s.replace(/^i?phone/i, "iPhone")
  if (!/^iPhone/.test(s)) return raw.trim() // not an iPhone — pass through
  // iosys titles use the no-space form ("iPhone16 Pro Max", "iPhoneAir"). Insert a
  // space after "iPhone" when it is directly followed by an alphanumeric.
  s = s.replace(/^iPhone(?=[0-9A-Za-z])/, "iPhone ")

  // SE generations.
  const se = s.match(/^iPhone SE\s*([123])?(?:\s*(?:nd|rd|st|th)?\s*gen(?:eration)?)?$/i)
  if (se) {
    const gen = se[1]
    if (gen === "1") return "iPhone SE (1st generation)"
    if (gen === "2") return "iPhone SE (2nd generation)"
    if (gen === "3") return "iPhone SE (3rd generation)"
    return "iPhone SE" // unqualified SE — ambiguous, leave for human
  }

  // "mini" must be lowercase; "Plus", "Pro", "Max", "Pro Max" keep their casing.
  s = s.replace(/\bMini\b/g, "mini")
  // Collapse "Pro  Max" etc. already handled by whitespace collapse above.
  return s
}

/** Look up specs by model_name (canonicalized first), or null if not in the reference. */
export function iphoneSpec(modelName: string | null | undefined): ModelSpec | null {
  const canon = normalizeIphoneModelName(modelName)
  if (!canon) return null
  return IPHONE_SPECS[canon] ?? null
}
