/**
 * Reusable separator-insensitive fuzzy search — the client-side mirror of the
 * SQL `search_fold` / `search_normalize` / `search_matches` functions
 * (supabase/migrations/20260629120000_reusable_fuzzy_search.sql +
 *  20260629130000_fuzzy_search_numeric_boundary.sql).
 *
 * Keep the two in sync. Both:
 *   - fold full-width → half-width and lower-case (foldSearchText)
 *   - additionally strip ALL whitespace + punctuation + JP separators (・ ー ― ‐),
 *     keeping alphanumerics and non-ASCII letters (normalizeSearchText)
 *   - match token-AND: every typed word must be present, BUT a pure-numeric token
 *     must hit a word boundary (so "11" matches "iPhone 11"/"256GB" but never the
 *     middle of a part number), while a token containing letters uses a
 *     separator-insensitive substring (so "11pro", "so51aa", "1ii", "iphone11" hit).
 *
 *   normalizeSearchText('SO-51Aa')        === 'so51aa'
 *   searchMatches('Sony Xperia 1 II SO-51Aa Black', 'SO51aa')      === true
 *   searchMatches('Apple iPhone 11 Pro Max A2218', '11Pro ProMax') === true
 *   searchMatches('Apple iPhone 6s MKQ11J/A', 'iphone 11')         === false  // numeric boundary
 */

// Full-width ASCII block (！..～, U+FF01–U+FF5E) folds to half-width by subtracting 0xFEE0.
const FULLWIDTH_RE = /[！-～]/g
// All ASCII whitespace + ASCII punctuation + JP middle-dot / long-vowel / dash marks.
const SEPARATOR_RE = /[\s!-/:-@[-`{-~・ー―‐]+/g

/** Fold full-width → half-width and lower-case, keeping separators (mirrors search_fold). */
export function foldSearchText(input: string | null | undefined): string {
  if (!input) return ''
  return input.replace(FULLWIDTH_RE, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).toLowerCase()
}

/** Folded + every separator/punctuation char stripped (mirrors search_normalize). */
export function normalizeSearchText(input: string | null | undefined): string {
  return foldSearchText(input).replace(SEPARATOR_RE, '')
}

/** Split a raw query into normalized, non-empty tokens (whitespace-delimited). */
export function searchQueryTokens(query: string | null | undefined): string[] {
  return (query ?? '')
    .trim()
    .split(/\s+/)
    .map(normalizeSearchText)
    .filter(Boolean)
}

/**
 * True when every typed word appears in the haystack. Pure-numeric tokens must hit a
 * word boundary; tokens with letters use a separator-insensitive substring. Empty /
 * whitespace-only query matches everything. Mirrors the SQL search_matches().
 */
export function searchMatches(haystack: string | null | undefined, query: string | null | undefined): boolean {
  const tokens = searchQueryTokens(query)
  if (tokens.length === 0) return true
  const normHay = normalizeSearchText(haystack)
  const foldHay = foldSearchText(haystack)
  return tokens.every((tok) => {
    if (/^[0-9]+$/.test(tok)) {
      // pure number: word-start boundary (not preceded by another alnum) — mirrors \m
      return new RegExp(`(?<![a-z0-9])${tok}`).test(foldHay)
    }
    return normHay.includes(tok)
  })
}
