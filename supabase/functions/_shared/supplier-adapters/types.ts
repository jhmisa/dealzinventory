export interface NormalizedSupplierProduct {
  supplierKey: "iosys"
  supplierProductCode: string
  sourceUrl: string
  brandText: string | null
  modelText: string | null
  color: string | null
  storageGb: number | null
  ramGb: number | null
  rankText: string | null // supplier-native rank (e.g. "新品", "Aランク")
  conditionGrade: "S" | "A" | "B" | "C" | "D" | "J" | null
  supplierPrice: number | null // our cost (JPY)
  stock: number | null
  imageUrls: string[] // full listing gallery (may be empty)
}

export interface SupplierAdapter {
  key: string
  matches(url: string): boolean
  extractCode(input: string): string | null
  parse(html: string, input: string): NormalizedSupplierProduct
}
