// ---------------------------------------------------------------------------
// Yamato Tracking CSV Import Parser
// ---------------------------------------------------------------------------

export interface YamatoTrackingRow {
  trackingNumber: string
  pCode: string | null
  orderCode: string | null
  csvRow: number
}

export interface YamatoParseResult {
  rows: YamatoTrackingRow[]
  errors: { row: number; message: string }[]
}

/**
 * Parse a simple CSV line, handling quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}

/**
 * Convert a tracking number that may be in scientific notation to a string.
 * Yamato tracking numbers are 12 digits. Excel/CSV may export them as e.g. 3.80332E+11.
 */
function normalizeTrackingNumber(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let numStr: string
  if (/[eE]/.test(trimmed)) {
    // Scientific notation — convert to fixed integer string
    numStr = Number(trimmed).toFixed(0)
  } else {
    // Already a plain number string — strip any decimals
    numStr = trimmed.replace(/\..*$/, '')
  }

  // Yamato tracking numbers are typically 12 digits
  if (!/^\d+$/.test(numStr)) return null
  return numStr.padStart(12, '0')
}

/**
 * Parse a Yamato CSV buffer into tracking rows.
 * Yamato CSVs are typically Shift-JIS encoded.
 */
export function parseYamatoTrackingCsv(buffer: ArrayBuffer): YamatoParseResult {
  // Try Shift-JIS first, fall back to UTF-8
  let text: string
  try {
    text = new TextDecoder('shift-jis').decode(buffer)
  } catch {
    text = new TextDecoder('utf-8').decode(buffer)
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const rows: YamatoTrackingRow[] = []
  const errors: { row: number; message: string }[] = []

  for (let i = 0; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i])
    const rowNum = i + 1

    // Skip header row — detect by checking if col 3 (index 3) contains Japanese header text
    if (i === 0 && fields[3]?.includes('伝票番号')) continue

    const rawTracking = fields[3] ?? ''
    const rawPCode = (fields[27] ?? '').trim()
    const rawOrderCode = (fields[29] ?? '').trim()

    const trackingNumber = normalizeTrackingNumber(rawTracking)
    if (!trackingNumber) {
      if (rawOrderCode) {
        errors.push({ row: rowNum, message: `No valid tracking number for ${rawOrderCode}` })
      }
      continue
    }

    const orderCode = /^ORD\d{6}$/.test(rawOrderCode) ? rawOrderCode : null
    if (!orderCode) {
      errors.push({ row: rowNum, message: `No valid order code (got "${rawOrderCode}")` })
      continue
    }

    rows.push({
      trackingNumber,
      pCode: rawPCode || null,
      orderCode,
      csvRow: rowNum,
    })
  }

  return { rows, errors }
}
