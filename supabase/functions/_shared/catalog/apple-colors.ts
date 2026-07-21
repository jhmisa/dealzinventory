// Canonical JP <-> EN Apple color map.
// iosys titles give the Japanese color token; we derive canonical English from it.
// Unknown JA tokens return null -> flagged for human confirmation (never guessed).
//
// Scope: iPhone colors first (per spec, iPhone is harvested first). iPad/Android
// colors can be appended as Phase 4 expands coverage.

import {
  GALAXY_COLORS_JA_EN,
  XPERIA_COLORS_JA_EN,
  AQUOS_COLORS_JA_EN,
  PIXEL_COLORS_JA_EN,
  XIAOMI_COLORS_JA_EN,
  OPPO_COLORS_JA_EN,
  ARROWS_COLORS_JA_EN,
  HUAWEI_COLORS_JA_EN,
  ASUS_COLORS_JA_EN,
  MOTOROLA_COLORS_JA_EN,
} from "./android-listing.ts"
import { SURFACE_COLORS_JA_EN } from "./surface-listing.ts"

/** Japanese color token -> canonical English color name. */
export const JA_TO_EN_COLOR: Record<string, string> = {
  // --- neutrals / classics ---
  "ホワイト": "White",
  "ブラック": "Black",
  "シルバー": "Silver",
  "ゴールド": "Gold",
  "ローズゴールド": "Rose Gold",
  "グレイ": "Gray",
  "グレー": "Gray",
  "スペースグレイ": "Space Gray",
  "スペースグレー": "Space Gray",
  "スペースブラック": "Space Black",
  "スレート": "Slate", // Apple Watch titanium (Series 10/11)
  "ナチュラル": "Natural", // Apple Watch natural titanium (Ultra / Series 10/11)
  "ジェットブラック": "Jet Black",
  "マットブラック": "Matte Black",
  "グラファイト": "Graphite",

  // --- standard-line accent colors ---
  "レッド": "Red",
  "(PRODUCT)RED": "(PRODUCT)RED",
  "プロダクトレッド": "(PRODUCT)RED",
  "ブルー": "Blue",
  "グリーン": "Green",
  "パープル": "Purple",
  "イエロー": "Yellow",
  "ピンク": "Pink",
  "コーラル": "Coral",
  "ホワイト/シルバー": "White",

  // --- 11-series / 12-series Pro ---
  "ミッドナイトグリーン": "Midnight Green",
  "パシフィックブルー": "Pacific Blue",

  // --- 13-series ---
  "ミッドナイト": "Midnight",
  "スターライト": "Starlight",
  // MacBook Neo (Early 2026, A18 Pro) — verified official EN names (apple.com/macbook-neo).
  "シトラス": "Citrus",
  "インディゴ": "Indigo",
  "ブラッシュ": "Blush",
  "シエラブルー": "Sierra Blue",
  "アルパイングリーン": "Alpine Green",

  // --- 14-series ---
  "ディープパープル": "Deep Purple",

  // --- 15-series titanium ---
  "ナチュラルチタニウム": "Natural Titanium",
  "ブルーチタニウム": "Blue Titanium",
  "ホワイトチタニウム": "White Titanium",
  "ブラックチタニウム": "Black Titanium",

  // --- 16-series ---
  "ウルトラマリン": "Ultramarine",
  "ティール": "Teal",
  "デザートチタニウム": "Desert Titanium",

  // --- 17-series / Air (2025+) ---
  "セージ": "Sage",
  "ラベンダー": "Lavender",
  "コズミックオレンジ": "Cosmic Orange",
  "スカイブルー": "Sky Blue",
  "クラウドホワイト": "Cloud White",
  "ライトゴールド": "Light Gold",
  "ミストブルー": "Mist Blue",
  "ディープブルー": "Deep Blue",
  "ソフトピンク": "Soft Pink",
}

// All other brand color maps (Android + Surface), consulted after the Apple map. Order is
// arbitrary — keys rarely collide, and where they do (e.g. ミント -> Mint) every map agrees.
const ANDROID_COLOR_MAPS: Record<string, string>[] = [
  SURFACE_COLORS_JA_EN,
  GALAXY_COLORS_JA_EN,
  XPERIA_COLORS_JA_EN,
  AQUOS_COLORS_JA_EN,
  PIXEL_COLORS_JA_EN,
  XIAOMI_COLORS_JA_EN,
  OPPO_COLORS_JA_EN,
  ARROWS_COLORS_JA_EN,
  HUAWEI_COLORS_JA_EN,
  ASUS_COLORS_JA_EN,
  MOTOROLA_COLORS_JA_EN,
]

/** Resolve a Japanese color token to canonical English (Apple + all Android maps), or null. */
export function colorJaToEn(colorJa: string | null | undefined): string | null {
  if (!colorJa) return null
  const key = colorJa.trim()
  if (key in JA_TO_EN_COLOR) return JA_TO_EN_COLOR[key]
  const compact = key.replace(/[\s　]+/g, "")
  if (compact in JA_TO_EN_COLOR) return JA_TO_EN_COLOR[compact]
  for (const m of ANDROID_COLOR_MAPS) {
    if (key in m) return m[key]
    if (compact in m) return m[compact]
  }
  return null
}
