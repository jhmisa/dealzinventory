import { ImageSearchProvider } from "./types.ts"

// Default: Google Custom Search JSON API (searchType=image). Swappable later via env.
export const imageSearchProvider: ImageSearchProvider = {
  key: "google_cse",
  isConfigured: () => !!Deno.env.get("IMAGE_SEARCH_API_KEY") && !!Deno.env.get("IMAGE_SEARCH_CX"),
  async search(query, limit) {
    const key = Deno.env.get("IMAGE_SEARCH_API_KEY")!
    const cx = Deno.env.get("IMAGE_SEARCH_CX")!
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&searchType=image&num=${Math.min(limit, 10)}&q=${encodeURIComponent(query)}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return (data.items ?? []).map((i: any) => i.link).filter(Boolean)
  },
}
