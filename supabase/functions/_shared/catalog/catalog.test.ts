import { assertEquals } from "https://deno.land/std/assert/mod.ts"
import { iphoneSpec, IPHONE_SPECS, normalizeIphoneModelName } from "./iphone-specs.ts"
import { colorJaToEn } from "./apple-colors.ts"

Deno.test("normalize: fixes the dirt observed in live product_models", () => {
  assertEquals(normalizeIphoneModelName("IPhone 11"), "iPhone 11")
  assertEquals(normalizeIphoneModelName("iPhone 12 "), "iPhone 12")
  assertEquals(normalizeIphoneModelName("iPhone 12 Mini"), "iPhone 12 mini")
  assertEquals(normalizeIphoneModelName("iPhone SE 2"), "iPhone SE (2nd generation)")
  assertEquals(normalizeIphoneModelName("iPhone SE2"), "iPhone SE (2nd generation)")
  assertEquals(normalizeIphoneModelName("iPhone SE 3"), "iPhone SE (3rd generation)")
  assertEquals(normalizeIphoneModelName("iPhone 14 Pro"), "iPhone 14 Pro")
  assertEquals(normalizeIphoneModelName("iPhone 13 Pro Max"), "iPhone 13 Pro Max")
})

Deno.test("normalize: handles the iosys no-space token form", () => {
  // The iosys title gives "iPhone15 Plus" — Phase 1 will pre-split that, but the
  // normalizer should still canonicalize a spaced form correctly.
  assertEquals(normalizeIphoneModelName("iPhone 15 Plus"), "iPhone 15 Plus")
})

Deno.test("normalize: non-iPhone passes through trimmed", () => {
  assertEquals(normalizeIphoneModelName("iPad mini 5 Wifi"), "iPad mini 5 Wifi")
  assertEquals(normalizeIphoneModelName("MacBook Pro "), "MacBook Pro")
})

Deno.test("spec: every live iPhone model resolves via the reference", () => {
  // The distinct iPhone model_names present in live data (canonicalized).
  const liveModels = [
    "iPhone 7", "iPhone 8", "iPhone XR", "iPhone XS", "iPhone XS Max",
    "iPhone 11", "iPhone 11 Pro", "iPhone 11 Pro Max",
    "iPhone 12", "iPhone 12 mini", "iPhone 12 Pro", "iPhone 12 Pro Max",
    "iPhone 13", "iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro",
    "iPhone 15", "iPhone 15 Pro", "iPhone SE (2nd generation)",
  ]
  for (const m of liveModels) {
    const spec = iphoneSpec(m)
    assertEquals(spec !== null, true, `missing spec for ${m}`)
  }
})

Deno.test("spec: lookup canonicalizes dirty input", () => {
  assertEquals(iphoneSpec("IPhone 11")?.chipset, "A13 Bionic")
  assertEquals(iphoneSpec("iPhone SE 2")?.chipset, "A13 Bionic")
  assertEquals(iphoneSpec("iPhone 12 Mini")?.screen_size, 5.4)
})

Deno.test("spec: reference has no obviously wrong years", () => {
  for (const [name, s] of Object.entries(IPHONE_SPECS)) {
    assertEquals(s.year >= 2015 && s.year <= 2026, true, `bad year for ${name}`)
    assertEquals(s.os_family, "iOS", `bad os_family for ${name}`)
  }
})

Deno.test("colors: JA tokens map to canonical EN; unknown -> null", () => {
  assertEquals(colorJaToEn("ピンク"), "Pink")
  assertEquals(colorJaToEn("ナチュラルチタニウム"), "Natural Titanium")
  assertEquals(colorJaToEn("ミッドナイト"), "Midnight")
  assertEquals(colorJaToEn("スターライト"), "Starlight")
  assertEquals(colorJaToEn("ウルトラマリン"), "Ultramarine")
  assertEquals(colorJaToEn("謎の色"), null)
  assertEquals(colorJaToEn(null), null)
})
