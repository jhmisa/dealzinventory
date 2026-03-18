export const JAPAN_PREFECTURES = [
  { ja: '北海道', en: 'HOKKAIDO' },
  { ja: '青森県', en: 'AOMORI' },
  { ja: '岩手県', en: 'IWATE' },
  { ja: '宮城県', en: 'MIYAGI' },
  { ja: '秋田県', en: 'AKITA' },
  { ja: '山形県', en: 'YAMAGATA' },
  { ja: '福島県', en: 'FUKUSHIMA' },
  { ja: '茨城県', en: 'IBARAKI' },
  { ja: '栃木県', en: 'TOCHIGI' },
  { ja: '群馬県', en: 'GUNMA' },
  { ja: '埼玉県', en: 'SAITAMA' },
  { ja: '千葉県', en: 'CHIBA' },
  { ja: '東京都', en: 'TOKYO' },
  { ja: '神奈川県', en: 'KANAGAWA' },
  { ja: '新潟県', en: 'NIIGATA' },
  { ja: '富山県', en: 'TOYAMA' },
  { ja: '石川県', en: 'ISHIKAWA' },
  { ja: '福井県', en: 'FUKUI' },
  { ja: '山梨県', en: 'YAMANASHI' },
  { ja: '長野県', en: 'NAGANO' },
  { ja: '岐阜県', en: 'GIFU' },
  { ja: '静岡県', en: 'SHIZUOKA' },
  { ja: '愛知県', en: 'AICHI' },
  { ja: '三重県', en: 'MIE' },
  { ja: '滋賀県', en: 'SHIGA' },
  { ja: '京都府', en: 'KYOTO' },
  { ja: '大阪府', en: 'OSAKA' },
  { ja: '兵庫県', en: 'HYOGO' },
  { ja: '奈良県', en: 'NARA' },
  { ja: '和歌山県', en: 'WAKAYAMA' },
  { ja: '鳥取県', en: 'TOTTORI' },
  { ja: '島根県', en: 'SHIMANE' },
  { ja: '岡山県', en: 'OKAYAMA' },
  { ja: '広島県', en: 'HIROSHIMA' },
  { ja: '山口県', en: 'YAMAGUCHI' },
  { ja: '徳島県', en: 'TOKUSHIMA' },
  { ja: '香川県', en: 'KAGAWA' },
  { ja: '愛媛県', en: 'EHIME' },
  { ja: '高知県', en: 'KOCHI' },
  { ja: '福岡県', en: 'FUKUOKA' },
  { ja: '佐賀県', en: 'SAGA' },
  { ja: '長崎県', en: 'NAGASAKI' },
  { ja: '熊本県', en: 'KUMAMOTO' },
  { ja: '大分県', en: 'OITA' },
  { ja: '宮崎県', en: 'MIYAZAKI' },
  { ja: '鹿児島県', en: 'KAGOSHIMA' },
  { ja: '沖縄県', en: 'OKINAWA' },
] as const

export type Prefecture = (typeof JAPAN_PREFECTURES)[number]

// Lookup helpers
export function getPrefectureEn(ja: string): string {
  return JAPAN_PREFECTURES.find(p => p.ja === ja)?.en ?? ja.toUpperCase()
}

export function getPrefectureJa(en: string): string {
  return JAPAN_PREFECTURES.find(p => p.en === en.toUpperCase())?.ja ?? en
}

// Common international shipping countries (JP first, then alphabetical common destinations)
export const SHIPPING_COUNTRIES = [
  { code: 'JP', name: 'Japan' },
  { code: 'AU', name: 'Australia' },
  { code: 'CA', name: 'Canada' },
  { code: 'CN', name: 'China' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'KR', name: 'South Korea' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'PH', name: 'Philippines' },
  { code: 'SG', name: 'Singapore' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TH', name: 'Thailand' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'VN', name: 'Vietnam' },
] as const
