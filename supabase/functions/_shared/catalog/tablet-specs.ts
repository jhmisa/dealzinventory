// Verified spec reference for the Android-tablet path (items/tablet/android) — MULTI-BRAND:
// Samsung Galaxy Tab, Lenovo (+ NEC LAVIE, Lenovo-built), Huawei MediaPad, docomo dtab, Xiaomi/
// Redmi Pad, and the carrier one-offs (Qua tab, arrows Tab). Research passes 2026-07-20
// (sources: samsung.com/jp, lenovo.com/jp + PSREF, nec-lavie.jp, huawei/docomo/au/Kyocera/FMWORLD,
// Kakaku, JP press). Models not listed harvest with spec_known=false — flagged, never guessed.
//
// Keys are the PARSER-CANONICAL model names (tablet-listing configs' output), designation-form
// where iosys prints designations (NEC "LAVIE Tab T1275/LAS" — NEC reuses marketing names across
// years, the designation is the only stable key; dtab keeps the d-code in the name — the code
// letter is docomo's fiscal cycle, NOT the maker).
//
// Extra verified facts this file carries beyond the phone-style spec shape:
//   storage_gb — ONLY for models sold in exactly ONE JP storage config (enriches storage-less
//                cards; e.g. every dtab code, Qua tab QZ8, arrows Tab F-02K, MediaPad T3 8,
//                TAB4 8 Plus, Tab B11). Multi-config models omit it (per-title parsing rules).
//   maker      — dtab line only: the research-verified manufacturer that becomes product brand
//                (d-41A/d-51C = Sharp, d-52C/d-51F = Lenovo).

export interface TabletSpec {
  chipset: string
  screen_size: number | null
  year: number
  ram_gb: number | null
  storage_gb?: number
  maker?: string
  os_family: "Android"
}

export const TABLET_SPECS: Record<string, TabletSpec> = {
  // ---- Samsung Galaxy Tab (JP retail verified; Tab S8 base / S7-and-earlier Wi-Fi never JP) ----
  "Galaxy Tab S11": { chipset: "MediaTek Dimensity 9400+", screen_size: 11.0, year: 2025, ram_gb: 12, os_family: "Android" },
  "Galaxy Tab S11 Ultra": { chipset: "MediaTek Dimensity 9400+", screen_size: 14.6, year: 2025, ram_gb: 12, os_family: "Android" },
  "Galaxy Tab S10+": { chipset: "MediaTek Dimensity 9300+", screen_size: 12.4, year: 2024, ram_gb: 12, os_family: "Android" },
  "Galaxy Tab S10 Ultra": { chipset: "MediaTek Dimensity 9300+", screen_size: 14.6, year: 2024, ram_gb: 12, os_family: "Android" },
  "Galaxy Tab S10 FE": { chipset: "Samsung Exynos 1580", screen_size: 10.9, year: 2025, ram_gb: 8, os_family: "Android" },
  "Galaxy Tab S10 FE+": { chipset: "Samsung Exynos 1580", screen_size: 13.1, year: 2025, ram_gb: 8, os_family: "Android" },
  "Galaxy Tab S9": { chipset: "Snapdragon 8 Gen 2 for Galaxy", screen_size: 11.0, year: 2023, ram_gb: 8, os_family: "Android" },
  "Galaxy Tab S9+": { chipset: "Snapdragon 8 Gen 2 for Galaxy", screen_size: 12.4, year: 2023, ram_gb: 12, os_family: "Android" },
  "Galaxy Tab S9 Ultra": { chipset: "Snapdragon 8 Gen 2 for Galaxy", screen_size: 14.6, year: 2023, ram_gb: 12, os_family: "Android" },
  "Galaxy Tab S9 FE": { chipset: "Samsung Exynos 1380", screen_size: 10.9, year: 2023, ram_gb: 6, os_family: "Android" },
  "Galaxy Tab S9 FE+ 5G": { chipset: "Samsung Exynos 1380", screen_size: 12.4, year: 2023, ram_gb: 8, os_family: "Android" }, // au SCT22 — JP's only S9 FE+
  "Galaxy Tab S8+": { chipset: "Qualcomm Snapdragon 8 Gen 1", screen_size: 12.4, year: 2022, ram_gb: 8, os_family: "Android" },
  "Galaxy Tab S8 Ultra": { chipset: "Qualcomm Snapdragon 8 Gen 1", screen_size: 14.6, year: 2022, ram_gb: 12, os_family: "Android" }, // JP: 12/512 only
  "Galaxy Tab A9+": { chipset: "Qualcomm Snapdragon 695", screen_size: 11.0, year: 2023, ram_gb: 4, os_family: "Android" },
  "Galaxy Tab A11+": { chipset: "MediaTek Dimensity 7300", screen_size: 11.0, year: 2025, ram_gb: 6, os_family: "Android" },
  "Galaxy Tab A11+ 5G": { chipset: "MediaTek Dimensity 7300", screen_size: 11.0, year: 2025, ram_gb: 6, os_family: "Android" }, // SM-X238Q, JP open-market cellular
  "Galaxy Tab S 10.5": { chipset: "Qualcomm Snapdragon 800", screen_size: 10.5, year: 2014, ram_gb: 3, os_family: "Android" }, // au SCT21 (JP ≠ global Exynos version)
  // NOTE deliberately absent: "Galaxy Tab S6 Lite" — two JP generations share the exact name
  // (SM-P613 2023 = Snapdragon 720G vs SM-P620 2024 = Exynos 1280); name-keyed specs would
  // cross-contaminate → flagged unknownModels instead (resolve per model_number if ever needed).

  // ---- Lenovo ----
  "Tab M10 Gen3": { chipset: "Unisoc T610", screen_size: 10.1, year: 2022, ram_gb: 4, os_family: "Android" }, // multi-config JP (3/32 & 4/64) — storage per title/code
  "Tab M10 HD (2nd Gen)": { chipset: "MediaTek Helio P22T", screen_size: 10.1, year: 2020, ram_gb: 2, os_family: "Android" }, // multi-config JP (2/32 & 4/64)
  "Tab4 8 Plus": { chipset: "Qualcomm Snapdragon 625", screen_size: 8.0, year: 2017, ram_gb: 4, storage_gb: 64, os_family: "Android" }, // JP single-storage: 64GB
  "IdeaTab Pro": { chipset: "MediaTek Dimensity 8300", screen_size: 12.7, year: 2025, ram_gb: 8, os_family: "Android" }, // official "Idea Tab Pro"; iosys/Kakaku glue it
  "Legion Tab Gen 3": { chipset: "Qualcomm Snapdragon 8 Gen 3", screen_size: 8.8, year: 2025, ram_gb: 12, storage_gb: 256, os_family: "Android" }, // JP/TW retail = 12/256 only
  "Tab B11": { chipset: "MediaTek Helio G88", screen_size: 10.95, year: 2024, ram_gb: 4, storage_gb: 128, os_family: "Android" }, // both JP SKUs = 4/128 Luna Grey
  "Tab M8": { chipset: "MediaTek Helio A22", screen_size: 8.0, year: 2022, ram_gb: 2, storage_gb: 16, os_family: "Android" }, // = global "Tab M8 (2nd Gen) HD"; JP SKUs ZA5G/ZA5H = 2/16 (NOT 32!)
  "Tab M8 (4th Gen)": { chipset: "MediaTek Helio A22", screen_size: 8.0, year: 2023, ram_gb: 3, storage_gb: 32, os_family: "Android" }, // ZABU0172JP, Arctic Grey
  "Tab M9": { chipset: "MediaTek Helio G80", screen_size: 9.0, year: 2023, ram_gb: 3, storage_gb: 32, os_family: "Android" }, // ZAC30178JP
  "Tab K10": { chipset: "MediaTek Helio P22T", screen_size: 10.3, year: 2021, ram_gb: 4, storage_gb: 64, os_family: "Android" }, // ZA8R0054JP = LTE 4/64 (3/32 Wi-Fi siblings exist)
  "Tab P11 Pro": { chipset: "Qualcomm Snapdragon 730G", screen_size: 11.5, year: 2020, ram_gb: 6, storage_gb: 128, os_family: "Android" }, // ZA7C0050JP, OLED
  "Yoga Tab 11": { chipset: "MediaTek Helio G90T", screen_size: 11.0, year: 2022, ram_gb: 4, storage_gb: 128, os_family: "Android" }, // ZA8W0113JP = 4/128 (2021 launch SKU was 8/256 — per-code!)

  // ---- NEC LAVIE (Lenovo-built; one PC-code = one exact config) ----
  "LAVIE Tab T1275/LAS": { chipset: "MediaTek Dimensity 6400", screen_size: 12.1, year: 2026, ram_gb: 12, storage_gb: 256, os_family: "Android" }, // marketing "LAVIE Tab T12N" (≠ 2022 "T12"!)
  "LAVIE T11 T1195/BAS": { chipset: "Qualcomm Snapdragon 730G", screen_size: 11.5, year: 2021, ram_gb: 6, storage_gb: 128, os_family: "Android" }, // 11.5" OLED flagship of the T11 pair
  "LAVIE Tab EX TX117/LAS": { chipset: "Qualcomm Snapdragon 8 Gen 3", screen_size: 11.1, year: 2026, ram_gb: 12, storage_gb: 256, os_family: "Android" },
  "LAVIE T11 T1175/BAS": { chipset: "Qualcomm Snapdragon 662", screen_size: 11.0, year: 2021, ram_gb: 4, storage_gb: 128, os_family: "Android" }, // 11.0" IPS sibling of T1195/BAS
  "LAVIE T8 T0855/CAS": { chipset: "MediaTek Helio P22T", screen_size: 8.0, year: 2021, ram_gb: 3, storage_gb: 32, os_family: "Android" }, // 3/32 (6/128 = sibling T0875/CAS!)
  "LAVIE Tab E TE710/KAW": { chipset: "Qualcomm Snapdragon 450", screen_size: 10.1, year: 2020, ram_gb: 4, storage_gb: 64, os_family: "Android" }, // full-seg TV tuner model
  "LAVIE Tab T10 T1055/EAS": { chipset: "Unisoc T610", screen_size: 10.1, year: 2022, ram_gb: 4, storage_gb: 64, os_family: "Android" }, // Unisoc, NOT MediaTek (common mislabel)

  // ---- Huawei tablets (sole JP color = Space Gray for the whole MediaPad line) ----
  "MediaPad M5": { chipset: "HUAWEI Kirin 960", screen_size: 8.4, year: 2018, ram_gb: 4, storage_gb: 32, os_family: "Android" }, // SHT-AL09 LTE, JP = 32GB only
  "MediaPad M5 lite 8": { chipset: "HUAWEI Kirin 710", screen_size: 8.0, year: 2019, ram_gb: 3, os_family: "Android" }, // JDN2-L09; 32GB=3GB RAM / 64GB=4GB RAM — storage per title
  "MediaPad M5 lite": { chipset: "HUAWEI Kirin 659", screen_size: 10.1, year: 2018, ram_gb: 3, os_family: "Android" }, // BAH2-W19 Wi-Fi 10.1" — ≠ "lite 8"!
  "MediaPad T3 8": { chipset: "Qualcomm Snapdragon 425", screen_size: 8.0, year: 2017, ram_gb: 2, storage_gb: 16, os_family: "Android" }, // KOB-L09, JP single config

  // ---- docomo dtab (brand := maker; the d-code letter is docomo's fiscal cycle, NOT maker) ----
  "dtab d-41A": { chipset: "Qualcomm Snapdragon 665", screen_size: 10.1, year: 2020, ram_gb: 4, storage_gb: 64, maker: "Sharp", os_family: "Android" },
  "dtab d-51C": { chipset: "Qualcomm Snapdragon 695 5G", screen_size: 10.1, year: 2022, ram_gb: 4, storage_gb: 64, maker: "Sharp", os_family: "Android" },
  "dtab Compact d-52C": { chipset: "Qualcomm Snapdragon 695 5G", screen_size: 8.4, year: 2023, ram_gb: 4, storage_gb: 64, maker: "Lenovo", os_family: "Android" },
  "dtab d-51F": { chipset: "MediaTek Dimensity 6300", screen_size: 11.0, year: 2026, ram_gb: 6, storage_gb: 128, maker: "Lenovo", os_family: "Android" },

  // ---- carrier one-offs ----
  "Qua tab QZ8": { chipset: "Qualcomm Snapdragon 430", screen_size: 8.0, year: 2018, ram_gb: 3, storage_gb: 32, os_family: "Android" }, // au KYT32 (430 = MSM8937; ≠ T3 8's 425!)
  "arrows Tab F-02K": { chipset: "Qualcomm Snapdragon 660", screen_size: 10.1, year: 2018, ram_gb: 4, storage_gb: 32, os_family: "Android" }, // docomo; 2560×1600 — really

  // ---- Xiaomi / Redmi pads (JP retail verified) ----
  "Xiaomi Pad 5": { chipset: "Qualcomm Snapdragon 860", screen_size: 11.0, year: 2021, ram_gb: 6, os_family: "Android" },
  "Xiaomi Pad 6": { chipset: "Qualcomm Snapdragon 870", screen_size: 11.0, year: 2023, ram_gb: 6, os_family: "Android" },
  "Xiaomi Pad 6S Pro 12.4": { chipset: "Qualcomm Snapdragon 8 Gen 2", screen_size: 12.4, year: 2024, ram_gb: 8, os_family: "Android" }, // "12.4" is part of the official name
  "Xiaomi Pad 7": { chipset: "Snapdragon 7+ Gen 3", screen_size: 11.2, year: 2025, ram_gb: 8, os_family: "Android" },
  "Xiaomi Pad 7 Pro": { chipset: "Snapdragon 8s Gen 3", screen_size: 11.2, year: 2025, ram_gb: 8, os_family: "Android" },
  "Xiaomi Pad mini": { chipset: "MediaTek Dimensity 9400+", screen_size: 8.8, year: 2025, ram_gb: 8, os_family: "Android" }, // mi.com styles "Pad Mini"; iosys/Kakaku "Pad mini"
  "Redmi Pad": { chipset: "MediaTek Helio G99", screen_size: 10.61, year: 2022, ram_gb: 3, os_family: "Android" },
  "Redmi Pad SE": { chipset: "Qualcomm Snapdragon 680", screen_size: 11.0, year: 2023, ram_gb: 4, os_family: "Android" },
  "Redmi Pad SE 8.7": { chipset: "MediaTek Helio G85", screen_size: 8.7, year: 2024, ram_gb: null, os_family: "Android" }, // JP RAM tier unverified — null, never guessed
  "Redmi Pad Pro": { chipset: "Snapdragon 7s Gen 2", screen_size: 12.1, year: 2024, ram_gb: 6, os_family: "Android" },
  "Redmi Pad 2": { chipset: "MediaTek Helio G100-Ultra", screen_size: 11.0, year: 2025, ram_gb: 4, os_family: "Android" },
  "Redmi Pad 2 Pro": { chipset: "Snapdragon 7s Gen 4", screen_size: 12.1, year: 2025, ram_gb: 6, os_family: "Android" },
}

// Verified code→color for COLORLESS code-carrying cards (Lenovo/NEC lock one color per code).
// Codes not listed stay colorless and are skipped by the fill-gaps — never guessed.
export const TABLET_CODE_COLORS: Record<string, string> = {
  "ZAAE0009JP": "Storm Grey", // Tab M10 Gen3 — all JP 3rd-gen SKUs are Storm Grey (Nojima/Yamada/Lenovo)
  "ZABU0172JP": "Arctic Grey", // Tab M8 (4th Gen) — lenovo.com/jp + PSREF
  "PC-T1175BAS": "Silver", // LAVIE T11 T1175/BAS — NEC spec page (シルバー)
  "PC-T0855CAS": "Platinum Grey", // LAVIE T8 — NEC spec page (プラチナグレー)
  "PC-T1055EAS": "Platinum Grey", // LAVIE Tab T10 — NEC spec page (プラチナグレー)
  "PC-T1195BAS": "Silver", // LAVIE T11 T1195/BAS — NEC/Sofmap (シルバー)
}

// Verified code→storage for STORAGE-LESS cards of multi-config models where the specific
// code locks one config (Lenovo MTM = full config lock). Never guessed.
export const TABLET_CODE_STORAGE: Record<string, number> = {
  "ZA6W0126JP": 32, // Tab M10 HD (2nd Gen) 2GB/32GB — Kakaku K0001461212 + lenovo-smb
}

// iosys prints some ASCII colors glued or SHOUTING; normalize to the maker's official form.
export const TABLET_ASCII_COLOR_ALIASES: Record<string, string> = {
  "SpaceGray": "Space Gray",
  "SpaceGrey": "Space Gray",
  "IRON GREY": "Iron Grey",
}

/** Spec lookup by parser-canonical name; the " LTE" connectivity suffix is identity-only. */
export function tabletSpec(modelName: string): TabletSpec | null {
  return TABLET_SPECS[modelName] ?? TABLET_SPECS[modelName.replace(/\s+LTE$/, "")] ?? null
}
