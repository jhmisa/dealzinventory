// Verified Apple Watch spec reference: model -> SiP chipset + release year.
// The SiP is NOT printed in iosys titles (unlike Mac), so we enrich from this table.
// Verified against apple.com spec pages / Apple Newsroom / Wikipedia (research subagent, 2026-06-29).
//
// KEY FACTS (don't "correct" these):
//   - Series 11, SE 3, AND Ultra 3 (all 2025) share the SAME S10 SiP — Apple reused S10, there is no S11.
//   - Collection variants (Nike / Hermès / Edition) use the SAME SiP as their base Series number.
//   - SE 1st gen = S5; SE 2nd gen = S8; SE 3 = S10.
//   - Stainless steel ran Series 4–9; Series 10 replaced it with titanium. Ultra = titanium only.

export interface AppleWatchSpec {
  chipset: string // SiP, e.g. "S7", "S10"
  year: number
}

// Keyed on the CORE series identity (collection stripped, generation folded in).
const SPECS: Record<string, AppleWatchSpec> = {
  "Series 1": { chipset: "S1P", year: 2016 },
  "Series 2": { chipset: "S2", year: 2016 },
  "Series 3": { chipset: "S3", year: 2017 },
  "Series 4": { chipset: "S4", year: 2018 },
  "Series 5": { chipset: "S5", year: 2019 },
  "Series 6": { chipset: "S6", year: 2020 },
  "Series 7": { chipset: "S7", year: 2021 },
  "Series 8": { chipset: "S8", year: 2022 },
  "Series 9": { chipset: "S9", year: 2023 },
  "Series 10": { chipset: "S10", year: 2024 },
  "Series 11": { chipset: "S10", year: 2025 }, // reuses S10 — NOT "S11"
  "SE": { chipset: "S5", year: 2020 }, // SE 1st gen
  "SE (2nd gen)": { chipset: "S8", year: 2022 },
  "SE 3": { chipset: "S10", year: 2025 },
  "Ultra": { chipset: "S8", year: 2022 },
  "Ultra 2": { chipset: "S9", year: 2023 },
  "Ultra 3": { chipset: "S10", year: 2025 },
}

/** Reduce a canonical Apple Watch model_name to its core series key (drops "[Apple] Watch" + collection). */
export function appleWatchSeriesKey(modelName: string): string {
  return modelName
    .replace(/^(?:Apple\s+)?Watch\s+/i, "")
    .replace(/^(Nike|Herm(?:e|è)s|Edition)\s+/i, "")
    .trim()
}

/** Spec for a canonical Apple Watch model_name, or null if unknown (flagged, never guessed). */
export function appleWatchSpec(modelName: string): AppleWatchSpec | null {
  return SPECS[appleWatchSeriesKey(modelName)] ?? null
}
