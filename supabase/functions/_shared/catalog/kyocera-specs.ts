// Kyocera (京セラ) SMARTPHONE spec reference. Keyed by the canonical model_name the parser produces
// (the title's name segment before the code — see KYOCERA_CONFIG.canonicalModelName). brand="Kyocera"
// is prepended on display ("DIGNO SX4" → "Kyocera DIGNO SX4"). model_number + carrier are coarse
// attributes, NOT identity. SMARTPHONES ONLY — feature phones (GRATINA 4G, DIGNO ケータイ, KYF-coded
// ガラケー) are out of scope and excluded by the crawl path + parser code shapes.
//
// Research-verified 2026-07-01 (kyocera.co.jp / au-KDDI / SoftBank / Y!mobile / Google Android One /
// Kakaku / JP Wikipedia). Values are the JP base tier; never guessed.
//
// Notes carried from research:
//  - "TORQUE G05" and "BASIO5" DO NOT EXIST (G05 = informal alias of TORQUE 5G/KYG01) — omitted.
//  - "BASIO active" (au A205SH) is SHARP-made, not Kyocera — excluded (the parser's KC code shapes
//    already reject A205SH).
//  - GRATINA KYV48 is the Kyocera GRATINA SMARTPHONE (distinct from the GRATINA 4G feature phone);
//    its name segment is just "GRATINA" (code KYV48 split off), so it is keyed "GRATINA".
//  - DIGNO WX (KC-S303) is Wi-Fi-only (no cellular) but still an Android smartphone — included.
//  - DIGNO BX3 screen_size left NULL — could not verify the inch figure (flagged, never guessed).
//  - Android One S2/S4/S6/S8/S9 are all genuinely Kyocera (-KC); odd S1/S3/S5/S7 are Sharp (excluded).
//  - Qua phone KYV37/KYV42(QX)/KYV44(QZ) are all Kyocera; the LG "Qua phone PX" (LGV33) is excluded.

export interface KyoceraModelSpec {
  chipset: string
  screen_size: number | null // inches (null = unverified, never guessed)
  year: number // first JP release year
  ram_gb: number // base tier
  os_family: "Android"
}

export const KYOCERA_SPECS: Record<string, KyoceraModelSpec> = {
  // --- TORQUE (rugged) ---
  "TORQUE G03": { chipset: "Qualcomm Snapdragon 625", screen_size: 4.6, year: 2017, ram_gb: 3, os_family: "Android" },
  "TORQUE G04": { chipset: "Qualcomm Snapdragon 660", screen_size: 5.0, year: 2019, ram_gb: 4, os_family: "Android" },
  "TORQUE 5G": { chipset: "Qualcomm Snapdragon 765", screen_size: 5.5, year: 2021, ram_gb: 6, os_family: "Android" }, // KYG01 (a.k.a. informal "TORQUE G05")
  "TORQUE G06": { chipset: "Qualcomm Snapdragon 7 Gen 1", screen_size: 5.4, year: 2023, ram_gb: 6, os_family: "Android" }, // KYG03

  // --- DIGNO ---
  "DIGNO BX": { chipset: "Qualcomm Snapdragon 429", screen_size: 5.65, year: 2019, ram_gb: 3, os_family: "Android" }, // 901KC
  "DIGNO BX2": { chipset: "Qualcomm Snapdragon 480 5G", screen_size: 6.1, year: 2021, ram_gb: 4, os_family: "Android" }, // A101KC
  "DIGNO BX3": { chipset: "MediaTek Dimensity 6100+", screen_size: null, year: 2024, ram_gb: 4, os_family: "Android" }, // A401KC; screen unverified
  "DIGNO SX3": { chipset: "MediaTek Dimensity 700", screen_size: 6.1, year: 2023, ram_gb: 4, os_family: "Android" }, // KYG02
  "DIGNO SX4": { chipset: "MediaTek Dimensity 6100+", screen_size: 5.8, year: 2024, ram_gb: 4, os_family: "Android" }, // KC-S305
  "DIGNO WX": { chipset: "MediaTek Helio P65 (MT6768)", screen_size: 6.26, year: 2022, ram_gb: 4, os_family: "Android" }, // KC-S303 (Wi-Fi only)
  "DIGNO SANGA edition": { chipset: "Qualcomm Snapdragon 480 5G", screen_size: 6.1, year: 2021, ram_gb: 4, os_family: "Android" }, // KC-S304

  // --- DURA FORCE ---
  "DURA FORCE PRO": { chipset: "Qualcomm Snapdragon 617", screen_size: 5.0, year: 2018, ram_gb: 2, os_family: "Android" }, // KC-S702 (JP SIM-free)

  // --- Android One (Y!mobile, code-less in title) ---
  "Android One S2": { chipset: "Qualcomm Snapdragon 425", screen_size: 5.0, year: 2017, ram_gb: 2, os_family: "Android" },
  "Android One S4": { chipset: "Qualcomm Snapdragon 430", screen_size: 5.0, year: 2018, ram_gb: 3, os_family: "Android" },
  "Android One S6": { chipset: "MediaTek Helio P35 (MT6765)", screen_size: 5.84, year: 2019, ram_gb: 3, os_family: "Android" },
  "Android One S8": { chipset: "MediaTek Helio P65 (MT6768)", screen_size: 6.26, year: 2020, ram_gb: 4, os_family: "Android" },
  "Android One S9": { chipset: "Qualcomm Snapdragon 480 5G", screen_size: 6.1, year: 2022, ram_gb: 4, os_family: "Android" },

  // --- BASIO / GRATINA (senior smartphones) ---
  "BASIO4": { chipset: "MediaTek Helio A22 (MT6761)", screen_size: 5.6, year: 2020, ram_gb: 3, os_family: "Android" }, // KYV47
  "GRATINA": { chipset: "MediaTek Helio P35 (MT6765)", screen_size: 5.8, year: 2020, ram_gb: 3, os_family: "Android" }, // KYV48 smartphone

  // --- かんたんスマホ (Y!mobile, A###KC/###KC) ---
  "かんたんスマホ": { chipset: "Qualcomm Snapdragon 430", screen_size: 5.0, year: 2018, ram_gb: 3, os_family: "Android" }, // 705KC
  "かんたんスマホ2": { chipset: "MediaTek Helio A22 (MT6761)", screen_size: 5.6, year: 2020, ram_gb: 3, os_family: "Android" }, // A001KC
  "かんたんスマホ2+": { chipset: "MediaTek Helio A22 (MT6761)", screen_size: 5.6, year: 2022, ram_gb: 3, os_family: "Android" }, // A201KC
  "かんたんスマホ3": { chipset: "MediaTek Dimensity 700", screen_size: 6.1, year: 2023, ram_gb: 4, os_family: "Android" }, // A205KC

  // --- Qua phone (au) ---
  "Qua phone": { chipset: "Qualcomm Snapdragon 617", screen_size: 5.0, year: 2016, ram_gb: 2, os_family: "Android" }, // KYV37
  "Qua phone QX": { chipset: "Qualcomm Snapdragon 625", screen_size: 5.2, year: 2017, ram_gb: 3, os_family: "Android" }, // KYV42
  "Qua phone QZ": { chipset: "MediaTek Helio P20 (MT6757)", screen_size: 5.0, year: 2018, ram_gb: 3, os_family: "Android" }, // KYV44
}

/** Look up Kyocera smartphone specs by canonical model name, or null if not in the reference. */
export function kyoceraSpec(modelName: string | null | undefined): KyoceraModelSpec | null {
  if (!modelName) return null
  return KYOCERA_SPECS[modelName.trim()] ?? null
}
