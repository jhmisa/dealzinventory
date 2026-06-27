import { ImageSearchProvider } from "./types.ts"
import { bingImageProvider } from "./bing.ts"

// Google Custom Search JSON API (searchType=image). Requires a paid API key + CX.
// Selectable via IMAGE_SEARCH_PROVIDER=google_cse.
export const googleCseProvider: ImageSearchProvider = {
  key: "google_cse",
  isConfigured: () =>
    !!Deno.env.get("IMAGE_SEARCH_API_KEY") && !!Deno.env.get("IMAGE_SEARCH_CX"),
  async search(query, limit) {
    const key = Deno.env.get("IMAGE_SEARCH_API_KEY")!
    const cx = Deno.env.get("IMAGE_SEARCH_CX")!
    const url =
      `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}` +
      `&searchType=image&num=${Math.min(limit, 10)}&q=${encodeURIComponent(query)}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return (data.items ?? []).map((i: any) => i.link).filter(Boolean)
  },
}

// Provider selection via IMAGE_SEARCH_PROVIDER:
//   bing_scrape -> free, no-key Bing scraper. NOTE: verified 2026-06-27 to return
//     query-independent JUNK from the Supabase edge egress IP (Bing serves a generic
//     fallback to flagged datacenter IPs). Only useful behind a residential proxy.
//   google_cse / unset (DEFAULT) -> key-gated Google CSE. With no key, isConfigured()
//     is false, so the "Search web for more" button stays DISABLED (no junk shown)
//     until a real image-search API key is provided.
function selectProvider(): ImageSearchProvider {
  switch (Deno.env.get("IMAGE_SEARCH_PROVIDER")) {
    case "bing_scrape":
      return bingImageProvider
    default:
      return googleCseProvider
  }
}

// The edge function imports { imageSearchProvider } — keep that contract.
export const imageSearchProvider: ImageSearchProvider = selectProvider()
