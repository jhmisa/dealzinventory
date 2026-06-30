// HTC (JP smartphone) spec reference. Keyed by the canonical model_name the parser produces (see
// HTC_CONFIG). brand="HTC" is prepended on display ("U11" → "HTC U11"). HTC is a CLOSED JP lineup
// (HTC exited Japan), so this reference is effectively complete for confirmed JP-domestic models.
// model_number + carrier are coarse for U11/10 (HTV33/HTV32/###HT) but the J-series KEEP their code
// IN the model_name (HTL21/HTL23/HTV31 are distinct devices) — see HTC_CONFIG header.
//
// Research-verified 2026-07-01 (HTC NIPPON / KDDI au / SoftBank / ja.wikipedia per-model / Kakaku /
// k-tai Watch / ITmedia, cross-checked GSMArena). Values are the JP variant; never guessed.
//
// Notes carried from research:
//  - U Ultra (SD821) and U23 pro (SD7 Gen 1) are IMPORT-ONLY / unconfirmed JP-domestic (no JP carrier
//    code, no official JP color naming) → DELIBERATELY OMITTED. If stocked they harvest spec_known=false.
//  - Desire 626 JP SIM-free = the 2GB variant (the global model had a 1GB tier).
//  - HTC 10 (au HTV32) shipped only Carbon Gray / Topaz Gold / Camellia Red in JP (no Glacier Silver).
//  - "J butterfly" = three distinct devices keyed by code; "J One HTL22" (One M7 base) is separate.

export interface HtcModelSpec {
  chipset: string
  screen_size: number // inches
  year: number // first JP release year
  ram_gb: number // base tier
  os_family: "Android"
}

export const HTC_SPECS: Record<string, HtcModelSpec> = {
  // --- U-series (SIM-free / carrier) ---
  "U11": { chipset: "Qualcomm Snapdragon 835", screen_size: 5.5, year: 2017, ram_gb: 4, os_family: "Android" }, // au HTV33 / SoftBank 601HT / SIM-free
  "U11 life": { chipset: "Qualcomm Snapdragon 630", screen_size: 5.2, year: 2018, ram_gb: 4, os_family: "Android" }, // SIM-free (JP 4GB Edge Sense build)
  "U12+": { chipset: "Qualcomm Snapdragon 845", screen_size: 6.0, year: 2018, ram_gb: 6, os_family: "Android" }, // SIM-free

  // --- HTC 10 (au) ---
  "10": { chipset: "Qualcomm Snapdragon 820", screen_size: 5.2, year: 2016, ram_gb: 4, os_family: "Android" }, // au HTV32

  // --- HTC J line (au) — code KEPT in model_name (distinct devices) ---
  "J ISW13HT": { chipset: "Qualcomm Snapdragon S4 Plus MSM8660A", screen_size: 4.3, year: 2012, ram_gb: 1, os_family: "Android" },
  "J butterfly HTL21": { chipset: "Qualcomm Snapdragon S4 Pro APQ8064", screen_size: 5.0, year: 2012, ram_gb: 2, os_family: "Android" },
  "J One HTL22": { chipset: "Qualcomm Snapdragon 600 APQ8064T", screen_size: 4.7, year: 2013, ram_gb: 2, os_family: "Android" }, // One M7 base
  "J butterfly HTL23": { chipset: "Qualcomm Snapdragon 801 MSM8974AC", screen_size: 5.0, year: 2014, ram_gb: 2, os_family: "Android" }, // One M8 base
  "J butterfly HTV31": { chipset: "Qualcomm Snapdragon 810 MSM8994", screen_size: 5.2, year: 2015, ram_gb: 3, os_family: "Android" }, // "Butterfly 3"

  // --- Desire (SIM-free) ---
  "Desire EYE": { chipset: "Qualcomm Snapdragon 801", screen_size: 5.2, year: 2015, ram_gb: 2, os_family: "Android" },
  "Desire 626": { chipset: "Qualcomm Snapdragon 410", screen_size: 5.0, year: 2015, ram_gb: 2, os_family: "Android" }, // JP = 2GB variant
  "Desire 22 pro": { chipset: "Qualcomm Snapdragon 695 5G", screen_size: 6.6, year: 2022, ram_gb: 8, os_family: "Android" },
}

/** Look up HTC specs by canonical model name, or null if not in the reference. */
export function htcSpec(modelName: string | null | undefined): HtcModelSpec | null {
  if (!modelName) return null
  return HTC_SPECS[modelName.trim()] ?? null
}
