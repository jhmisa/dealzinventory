import { resolveAdapter } from "./registry.ts"
import { assertEquals } from "https://deno.land/std/assert/mod.ts"

Deno.test("resolves iosys by url", () => {
  assertEquals(resolveAdapter("https://iosys.co.jp/items/x/1")?.key, "iosys")
})
Deno.test("returns null for unknown host", () => {
  assertEquals(resolveAdapter("https://unknown.example/x"), null)
})
