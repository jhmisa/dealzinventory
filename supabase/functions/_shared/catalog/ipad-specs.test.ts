import { assertEquals } from "https://deno.land/std/assert/mod.ts"
import { ipadCanonicalBase, ipadSpec } from "./ipad-specs.ts"
import { parseIpadListingPage } from "./ipad-listing.ts"

Deno.test("specs: connectivity suffix is stripped to the base key", () => {
  assertEquals(ipadCanonicalBase("iPad Air (5th generation) Wi-Fi"), "iPad Air (5th generation)")
  assertEquals(
    ipadCanonicalBase("iPad Pro 12.9-inch (5th generation) Wi-Fi + Cellular"),
    "iPad Pro 12.9-inch (5th generation)",
  )
})

Deno.test("specs: known lookups (incl. the A12X/A12Z trap and 9.7-inch 2GB)", () => {
  assertEquals(ipadSpec("iPad Pro 11-inch (1st generation) Wi-Fi")?.chipset, "A12X Bionic")
  assertEquals(ipadSpec("iPad Pro 11-inch (2nd generation) Wi-Fi")?.chipset, "A12Z Bionic")
  assertEquals(ipadSpec("iPad Pro 9.7-inch Wi-Fi")?.ram_gb, 2)
  assertEquals(ipadSpec("iPad Air (5th generation) Wi-Fi")?.chipset, "M1")
  assertEquals(ipadSpec("iPad mini (A17 Pro) Wi-Fi + Cellular")?.chipset, "A17 Pro")
  assertEquals(ipadSpec("iPad (9th generation) Wi-Fi")?.chipset, "A13 Bionic")
})

Deno.test("specs: unknown -> null", () => {
  assertEquals(ipadSpec("iPad Quantum (99th generation) Wi-Fi"), null)
  assertEquals(ipadSpec(null), null)
})

// Integration guarantee: every model the parser yields from the real fixtures must
// resolve to a spec — otherwise the harvested catalog would carry spec_known=false rows.
Deno.test("coverage: every fixture-parsed iPad model has a spec entry", async () => {
  const bases = new Set<string>()
  for (const f of ["simfree", "wifi"]) {
    const html = await Deno.readTextFile(
      new URL(`./__fixtures__/iosys-ipad-${f}-p1.html`, import.meta.url),
    )
    for (const s of parseIpadListingPage(html)) bases.add(ipadCanonicalBase(s.model_name)!)
  }
  const missing = [...bases].filter((b) => !ipadSpec(b))
  assertEquals(missing, [])
})
