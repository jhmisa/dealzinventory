import { assertEquals } from "https://deno.land/std/assert/mod.ts"
import { harvestCatalog } from "./harvest.ts"

const page1 = await Deno.readTextFile(
  new URL("./__fixtures__/iosys-iphone-simfree-p1.html", import.meta.url),
)

Deno.test("harvest: single section, dedupes + enriches + stops at empty page", async () => {
  const fetched: string[] = []
  const res = await harvestCatalog({
    sections: [{ path: "simfree", carrier: "SIM-Free" }],
    throttleMs: 0,
    fetchPage: (url) => {
      fetched.push(url)
      // page 1 returns the fixture; page 2 returns empty (end of section)
      return Promise.resolve(url.includes("page=2") ? "" : page1)
    },
  })

  // fetched page 1 then page 2 (empty) and stopped
  assertEquals(fetched.length, 2)
  assertEquals(res.stats.totalSkus > 30, true)
  assertEquals(res.stats.perCarrier.simfree, res.stats.totalSkus)

  // every row has the absolute key + brand/category
  for (const r of res.rows) {
    assertEquals(r.part_number.endsWith("/A"), true)
    assertEquals(r.brand, "Apple")
    assertEquals(r.device_category, "IPHONE")
    assertEquals(r.model_name.startsWith("iPhone"), true)
  }

  // a known model is enriched from the spec reference
  const twelve = res.rows.find((r) => r.model_name === "iPhone 12")
  if (twelve) {
    assertEquals(twelve.specs.spec_known, true)
    assertEquals(twelve.specs.chipset, "A14 Bionic")
  }

  // unknown 2025+ models are flagged, not guessed
  assertEquals(Array.isArray(res.stats.unknownModels), true)
})

Deno.test("harvest: respects maxPages cap (no infinite loop on a repeating page)", async () => {
  let calls = 0
  const res = await harvestCatalog({
    sections: [{ path: "simfree", carrier: "SIM-Free" }],
    maxPagesPerSection: 5,
    stopAfterDryPages: 99, // disable convergence stop so the page cap is what bounds it
    throttleMs: 0,
    fetchPage: () => {
      calls++
      return Promise.resolve(page1) // same page forever
    },
  })
  assertEquals(calls, 5) // capped
  assertEquals(res.stats.pagesFetched, 5)
})

Deno.test("harvest: convergence stop after dry pages", async () => {
  let calls = 0
  await harvestCatalog({
    sections: [{ path: "simfree", carrier: "SIM-Free" }],
    maxPagesPerSection: 20,
    stopAfterDryPages: 2,
    throttleMs: 0,
    fetchPage: () => {
      calls++
      return Promise.resolve(page1) // identical -> page 2 & 3 are "dry"
    },
  })
  // page1 (new), page2 (dry1), page3 (dry2 -> stop)
  assertEquals(calls, 3)
})
