import type { ProductModelWithHeroImage, ParsedSpecs } from '@/lib/types'

interface MatchResult {
  product: ProductModelWithHeroImage
  confidence: number
}

// Field weights — higher = more important for identity matching
const FIELD_WEIGHTS: Record<string, number> = {
  brand: 5,
  model_name: 5,
  ram_gb: 3,
  storage_gb: 3,
  screen_size: 3,
  cpu: 2,
  chipset: 1,
  color: 0.5,
  short_description: 0.5,
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

function getProductFieldValue(product: ProductModelWithHeroImage, field: string): string {
  const val = product[field as keyof ProductModelWithHeroImage]
  if (val == null) return ''
  return String(val).toLowerCase()
}

function getProductFieldTokens(product: ProductModelWithHeroImage, field: string): string[] {
  return tokenize(getProductFieldValue(product, field))
}

interface WeightedScoreResult {
  score: number
  maxScore: number
  matchedTokens: Set<string>
}

function scoreProductWeighted(
  descTokens: string[],
  product: ProductModelWithHeroImage,
  specs?: ParsedSpecs,
): WeightedScoreResult {
  const matchedTokens = new Set<string>()
  let score = 0
  let maxScore = 0

  // Phase 1: Structured spec matching (when csv_specs provided)
  const matchedDescTokens = new Set<number>()

  if (specs) {
    const specFields: Array<{ specKey: keyof ParsedSpecs; productKey: string }> = [
      { specKey: 'brand', productKey: 'brand' },
      { specKey: 'model_name', productKey: 'model_name' },
      { specKey: 'cpu', productKey: 'cpu' },
      { specKey: 'ram_gb', productKey: 'ram_gb' },
      { specKey: 'storage_gb', productKey: 'storage_gb' },
      { specKey: 'screen_size', productKey: 'screen_size' },
    ]

    for (const { specKey, productKey } of specFields) {
      const specVal = specs[specKey]
      if (specVal == null || specVal === '') continue

      const weight = FIELD_WEIGHTS[productKey] ?? 1
      maxScore += weight
      const specStr = String(specVal).toLowerCase()
      const productStr = getProductFieldValue(product, productKey)

      if (!productStr) continue

      if (specStr === productStr) {
        // Exact match — full weight
        score += weight
        // Mark description tokens that match this spec value so Phase 2 skips them
        const specTokens = tokenize(specStr)
        for (const st of specTokens) {
          matchedTokens.add(st)
          for (let i = 0; i < descTokens.length; i++) {
            if (descTokens[i] === st) matchedDescTokens.add(i)
          }
        }
      } else if (productStr.includes(specStr) || specStr.includes(productStr)) {
        // Substring match — partial weight
        score += weight * 0.55
        const specTokens = tokenize(specStr)
        for (const st of specTokens) {
          matchedTokens.add(st)
          for (let i = 0; i < descTokens.length; i++) {
            if (descTokens[i] === st) matchedDescTokens.add(i)
          }
        }
      }
    }
  }

  // Phase 2: Token-based fallback for remaining description tokens
  const weightedFields = Object.entries(FIELD_WEIGHTS)

  for (let i = 0; i < descTokens.length; i++) {
    if (matchedDescTokens.has(i)) continue
    const dt = descTokens[i]

    let bestWeight = 0
    let matched = false

    for (const [field, weight] of weightedFields) {
      const fieldTokens = getProductFieldTokens(product, field)
      if (fieldTokens.length === 0) continue

      // Exact token match
      if (fieldTokens.some((ft) => ft === dt)) {
        if (weight > bestWeight) {
          bestWeight = weight
          matched = true
        }
        continue
      }
      // Partial (substring) match
      if (fieldTokens.some((ft) => ft.includes(dt) || dt.includes(ft))) {
        const partialWeight = weight * 0.5
        if (partialWeight > bestWeight) {
          bestWeight = partialWeight
          matched = true
        }
      }
    }

    // Add the best-weighted match for this token
    maxScore += FIELD_WEIGHTS.brand // normalize against max possible (brand weight)
    if (matched) {
      score += bestWeight
      matchedTokens.add(dt)
    }
  }

  return { score, maxScore, matchedTokens }
}

export function getMatchingTokens(
  description: string,
  product: ProductModelWithHeroImage,
  specs?: ParsedSpecs,
): Set<string> {
  const descTokens = tokenize(description)
  if (descTokens.length === 0) return new Set()

  const { matchedTokens } = scoreProductWeighted(descTokens, product, specs)

  // Also add product field tokens that appear in description for bidirectional highlighting
  const productSummaryTokens = new Set<string>()
  for (const field of Object.keys(FIELD_WEIGHTS)) {
    for (const ft of getProductFieldTokens(product, field)) {
      productSummaryTokens.add(ft)
    }
  }

  for (const dt of descTokens) {
    if (productSummaryTokens.has(dt)) matchedTokens.add(dt)
  }

  return matchedTokens
}

export function matchDescriptionToProducts(
  description: string,
  products: ProductModelWithHeroImage[],
  topN = 5,
  specs?: ParsedSpecs,
): MatchResult[] {
  const descTokens = tokenize(description)
  if (descTokens.length === 0) return []

  const scored = products
    .map((product) => {
      const { score, maxScore } = scoreProductWeighted(descTokens, product, specs)
      return {
        product,
        confidence: maxScore > 0 ? score / maxScore : 0,
      }
    })
    .filter((r) => r.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, topN)

  return scored
}

export function autoMatchSingle(
  description: string,
  products: ProductModelWithHeroImage[],
  specs?: ParsedSpecs,
): { productId: string; confidence: number } | null {
  const results = matchDescriptionToProducts(description, products, 1, specs)
  if (results.length === 0 || results[0].confidence < 0.3) return null
  return {
    productId: results[0].product.id,
    confidence: results[0].confidence,
  }
}
