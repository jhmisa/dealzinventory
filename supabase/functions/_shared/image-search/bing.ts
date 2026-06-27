import { ImageSearchProvider } from "./types.ts"

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

// Decode the HTML entities Bing uses inside the m="..." attribute JSON.
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    // &amp; LAST so we don't double-decode entities above.
    .replace(/&amp;/g, "&")
}

/**
 * Pure parser for the Bing image async HTML fragment.
 *
 * Each result is an anchor with an `m="{...json...}"` attribute. The attribute
 * wrapper uses raw double quotes, but the JSON *inside* is HTML-entity-encoded
 * (`&quot;`, `&amp;`, ...). We extract each m-attribute, decode entities, JSON
 * .parse it, and pull `murl` (the full image URL).
 *
 * Defensive: a malformed entry is skipped, never throws. Returns deduped,
 * absolute http(s) URLs.
 */
export function parseBingImageResults(html: string): string[] {
  if (!html) return []

  const out: string[] = []
  const seen = new Set<string>()
  // m=" ... " — JSON has no raw double quotes (they're &quot;), so [^"]* is safe.
  const re = /\sm="([^"]*)"/g
  let match: RegExpExecArray | null

  while ((match = re.exec(html)) !== null) {
    try {
      const json = decodeHtmlEntities(match[1])
      const obj = JSON.parse(json)
      const murl = obj?.murl
      if (typeof murl !== "string") continue
      if (!/^https?:\/\//i.test(murl)) continue
      if (seen.has(murl)) continue
      seen.add(murl)
      out.push(murl)
    } catch {
      // Skip malformed entry; keep processing the rest.
      continue
    }
  }

  return out
}

export const bingImageProvider: ImageSearchProvider = {
  key: "bing_scrape",
  // No API key required — keeps the "Search web for more" button enabled by default.
  isConfigured: () => true,
  async search(query, limit) {
    try {
      const url =
        `https://www.bing.com/images/async?q=${encodeURIComponent(query)}` +
        `&first=1&count=${Math.max(1, limit)}&mmasync=1`
      const res = await fetch(url, {
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://www.bing.com/images/search",
        },
      })
      if (!res.ok) return []
      return parseBingImageResults(await res.text()).slice(0, limit)
    } catch {
      // Graceful degradation — button just shows nothing if Bing blocks.
      return []
    }
  },
}
