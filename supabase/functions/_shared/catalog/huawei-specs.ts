// Built-in HUAWEI model -> spec reference.
// iosys does not surface chipset / screen size / release year / RAM for Android, so we enrich
// harvested SKUs from this table. Keyed by the *canonical* model name the Android listing parser
// produces ("HUAWEI" + any MVNO/carrier prefix stripped, e.g. "P30 lite", "Mate 20 Pro",
// "nova lite 3", "P40 Pro 5G"). ram_gb is the base JP tier; screen_size = main display (inches);
// year = JP launch; os_family always "Android". Verified by a research subagent (2026-06-28).
// Models not listed harvest as spec_known=false (flagged, never guessed).

export interface HuaweiModelSpec {
  chipset: string
  screen_size: number // inches
  year: number // JP launch year
  ram_gb: number // base JP tier
  os_family: "Android"
}

export const HUAWEI_SPECS: Record<string, HuaweiModelSpec> = {
  // --- P-series ---
  "P9": { chipset: "Kirin 955", screen_size: 5.2, year: 2016, ram_gb: 3, os_family: "Android" }, // EVA-L09
  "P10": { chipset: "Kirin 960", screen_size: 5.1, year: 2017, ram_gb: 4, os_family: "Android" }, // VTR-L29
  "P10 Plus": { chipset: "Kirin 960", screen_size: 5.5, year: 2017, ram_gb: 4, os_family: "Android" }, // VKY-L29
  "P20": { chipset: "Kirin 970", screen_size: 5.8, year: 2018, ram_gb: 4, os_family: "Android" }, // EML-L29
  "P20 Pro": { chipset: "Kirin 970", screen_size: 6.1, year: 2018, ram_gb: 6, os_family: "Android" }, // docomo HW-01K
  "P20 lite": { chipset: "Kirin 659", screen_size: 5.84, year: 2018, ram_gb: 4, os_family: "Android" }, // ANE-LX2J / au HWV32
  "P30": { chipset: "Kirin 980", screen_size: 6.1, year: 2019, ram_gb: 6, os_family: "Android" }, // ELE-L29
  "P30 lite": { chipset: "Kirin 710", screen_size: 6.15, year: 2019, ram_gb: 4, os_family: "Android" }, // MAR-LX2J (base 4GB/64GB)
  "P30 lite Premium": { chipset: "Kirin 710", screen_size: 6.15, year: 2019, ram_gb: 6, os_family: "Android" }, // au HWV33 (New Edition; RAM 6GB per most sources, PhoneDB says 4GB — base is a fallback only)
  "P30 Pro": { chipset: "Kirin 980", screen_size: 6.47, year: 2019, ram_gb: 6, os_family: "Android" }, // docomo HW-02L
  "P40 Pro 5G": { chipset: "Kirin 990 5G", screen_size: 6.58, year: 2020, ram_gb: 8, os_family: "Android" }, // ELS-NX9

  // --- Mate ---
  "Mate 9": { chipset: "Kirin 960", screen_size: 5.9, year: 2017, ram_gb: 4, os_family: "Android" }, // MHA-L29
  "Mate 10 Lite": { chipset: "Kirin 659", screen_size: 5.9, year: 2017, ram_gb: 4, os_family: "Android" }, // RNE-L22
  "Mate 10 Pro": { chipset: "Kirin 970", screen_size: 6.0, year: 2018, ram_gb: 6, os_family: "Android" }, // BLA-L29
  "Mate 20 Pro": { chipset: "Kirin 980", screen_size: 6.39, year: 2018, ram_gb: 6, os_family: "Android" }, // LYA-L09

  // --- nova ---
  "nova 2": { chipset: "Kirin 659", screen_size: 5.0, year: 2018, ram_gb: 4, os_family: "Android" }, // au HWV31
  "nova 3": { chipset: "Kirin 970", screen_size: 6.3, year: 2018, ram_gb: 4, os_family: "Android" }, // PAR-LX9
  "nova 5T": { chipset: "Kirin 980", screen_size: 6.26, year: 2019, ram_gb: 8, os_family: "Android" }, // YAL-L21
  "nova lite 2": { chipset: "Kirin 659", screen_size: 5.65, year: 2018, ram_gb: 3, os_family: "Android" }, // FIG-LA1
  "nova lite 3": { chipset: "Kirin 710", screen_size: 6.21, year: 2019, ram_gb: 3, os_family: "Android" }, // POT-LX2J (3GB/32GB)
  "nova lite 3+": { chipset: "Kirin 710", screen_size: 6.21, year: 2020, ram_gb: 4, os_family: "Android" }, // POT-LX2J (4GB/128GB)
}

/** Look up HUAWEI specs by canonical model name, or null if not in the reference. */
export function huaweiSpec(modelName: string | null | undefined): HuaweiModelSpec | null {
  if (!modelName) return null
  return HUAWEI_SPECS[modelName.trim()] ?? null
}
