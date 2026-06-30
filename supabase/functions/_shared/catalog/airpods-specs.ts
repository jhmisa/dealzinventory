// AirPods spec reference (chip + year). Keyed by the canonical model_name the parser produces (see
// airpods-listing.ts). A title 【year】 marker overrides `year` per-SKU. Research-verified 2026-07-01
// (Apple Newsroom + Apple Support tech-spec pages, cross-checked MacRumors/9to5Mac); never guessed.
//
// Notes carried from research:
//  - AirPods Max 2 (H2, 2026, MHWN/MHWP prefix) is a REAL model distinct from the 2024 USB-C Max (H1,
//    MWW prefix) — both share the same 5 color NAMES, so only the part# prefix tells them apart.
//  - AirPods Pro 2 (2022 Lightning) and the 2023 USB-C refresh are BOTH H2; iosys labels both "Pro2".
//    They are kept as distinct rows by part# (identity); the 2023 carries year=2023 from its title.

export interface AirPodsModelSpec {
  chip: string // Apple chip: "H1" / "H2"
  year: number // release year
}

export const AIRPODS_SPECS: Record<string, AirPodsModelSpec> = {
  "AirPods (2nd gen)": { chip: "H1", year: 2019 },
  "AirPods (2nd gen) (Wireless Charging Case)": { chip: "H1", year: 2019 },
  "AirPods (3rd gen)": { chip: "H1", year: 2021 },
  "AirPods 4": { chip: "H2", year: 2024 },
  "AirPods 4 (ANC)": { chip: "H2", year: 2024 },
  "AirPods Pro": { chip: "H1", year: 2019 }, // 1st gen
  "AirPods Pro 2": { chip: "H2", year: 2022 }, // 2022 Lightning; 2023 USB-C shares the name (year from title)
  "AirPods Pro 3": { chip: "H2", year: 2025 },
  "AirPods Max": { chip: "H1", year: 2020 }, // original, Lightning
  "AirPods Max (USB-C)": { chip: "H1", year: 2024 }, // same H1 — port + colors only
  "AirPods Max 2": { chip: "H2", year: 2026 }, // REAL 2026 H2 model
}

/** Look up AirPods chip/year by canonical model name, or null if not in the reference. */
export function airpodsSpec(modelName: string | null | undefined): AirPodsModelSpec | null {
  if (!modelName) return null
  return AIRPODS_SPECS[modelName.trim()] ?? null
}
