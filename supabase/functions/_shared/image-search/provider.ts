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

// Provider selection: IMAGE_SEARCH_PROVIDER=google_cse uses Google CSE;
// anything else (incl. unset) uses the free, no-key Bing scraper (DEFAULT).
function selectProvider(): ImageSearchProvider {
  switch (Deno.env.get("IMAGE_SEARCH_PROVIDER")) {
    case "google_cse":
      return googleCseProvider
    default:
      return bingImageProvider
  }
}

// The edge function imports { imageSearchProvider } — keep that contract.
export const imageSearchProvider: ImageSearchProvider = selectProvider()
