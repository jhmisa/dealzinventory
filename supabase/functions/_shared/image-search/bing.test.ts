import { parseBingImageResults } from "./bing.ts"
import { assertEquals } from "https://deno.land/std/assert/mod.ts"

const html = await Deno.readTextFile(
  new URL(`./__fixtures__/bing-iphone15plus.html`, import.meta.url),
)

Deno.test("bing: parses a non-empty list of image URLs from the fixture", () => {
  const urls = parseBingImageResults(html)
  assertEquals(urls.length > 0, true)
})

Deno.test("bing: every result is an absolute http(s) image URL", () => {
  const urls = parseBingImageResults(html)
  for (const u of urls) {
    assertEquals(/^https?:\/\//.test(u), true, `not an http(s) URL: ${u}`)
  }
})

Deno.test("bing: results are deduped (no exact duplicates)", () => {
  const urls = parseBingImageResults(html)
  assertEquals(urls.length, new Set(urls).size)
})

Deno.test("bing: returns [] for empty / non-result HTML", () => {
  assertEquals(parseBingImageResults(""), [])
  assertEquals(parseBingImageResults("<html><body>no results</body></html>"), [])
})
