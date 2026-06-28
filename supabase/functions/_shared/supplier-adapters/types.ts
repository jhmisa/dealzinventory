export interface NormalizedSupplierSpecs {
  os: string | null
  cpu: string | null
  ramGb: number | null
  storageGb: number | null
  screenSize: number | null // inches, numeric
  camera: string | null
  comms: string | null // 通信
  bands: string | null // 電波帯
  externalMemory: string | null // 外部メモリ
  year: number | null // from 発売日
  ports: string | null // 接続端子
}

export interface NormalizedSupplierProduct {
  supplierKey: "iosys"
  supplierProductCode: string
  sourceUrl: string
  brandText: string | null
  modelText: string | null
  modelNumber: string | null // carrier/region model code, e.g. SO-52C / SC-54D / A301SH
  color: string | null // canonical English (for inventory + customer-facing)
  colorJa: string | null // original Japanese token (for the Kaitori side)
  storageGb: number | null
  ramGb: number | null
  rankText: string | null // supplier-native rank (e.g. "新品", "Aランク")
  conditionGrade: "S" | "A" | "B" | "C" | "D" | "J" | null
  supplierPrice: number | null // our cost (JPY)
  stock: number | null
  imageUrls: string[] // full listing gallery (may be empty)
  specs: NormalizedSupplierSpecs // parsed from the <div id="spec"> table
  includedAccessories: string | null // verbatim 付属品 text
}

export interface SupplierAdapter {
  key: string
  matches(url: string): boolean
  extractCode(input: string): string | null
  parse(html: string, input: string): NormalizedSupplierProduct
}
