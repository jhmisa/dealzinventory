// Canonical JP <-> EN Apple color map.
// iosys titles give the Japanese color token; we derive canonical English from it.
// Unknown JA tokens return null -> flagged for human confirmation (never guessed).
//
// Scope: iPhone colors first (per spec, iPhone is harvested first). iPad/Android
// colors can be appended as Phase 4 expands coverage.

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

/** Resolve a Japanese color token to canonical English, or null if unmapped. */
export function colorJaToEn(colorJa: string | null | undefined): string | null {
  if (!colorJa) return null
  const key = colorJa.trim()
  if (key in JA_TO_EN_COLOR) return JA_TO_EN_COLOR[key]
  // tolerate a trailing/leading whitespace or full-width spaces already trimmed above;
  // try a normalized lookup (strip spaces) as a last resort.
  const compact = key.replace(/[\s　]+/g, "")
  return JA_TO_EN_COLOR[compact] ?? null
}
