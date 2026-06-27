import { verifyPCodeMatch } from "./backorder-match.ts"
import { assertEquals } from "https://deno.land/std/assert/mod.ts"

const line = { product_id: "p1", storage_gb: 128, color: "Pink", condition_grade: "S" }

Deno.test("passes when core specs match", () => {
  const r = verifyPCodeMatch({ product_id: "p1", storage_gb: 128, color: "Pink", condition_grade: "S" }, line)
  assertEquals(r.ok, true)
  assertEquals(r.blocking.length, 0)
})

Deno.test("hard-blocks on storage mismatch", () => {
  const r = verifyPCodeMatch({ product_id: "p1", storage_gb: 256, color: "Pink", condition_grade: "S" }, line)
  assertEquals(r.ok, false)
  assertEquals(r.blocking.includes("storage_gb"), true)
})

Deno.test("color match is case/whitespace-insensitive", () => {
  const r = verifyPCodeMatch({ product_id: "p1", storage_gb: 128, color: "  pink ", condition_grade: "S" }, line)
  assertEquals(r.ok, true)
})

Deno.test("storage '128GB' text matches integer 128 after normalization", () => {
  const r = verifyPCodeMatch(
    { product_id: "p1", storage_gb: "128GB", color: "Pink", condition_grade: "S" },
    { product_id: "p1", storage_gb: 128, color: "Pink", condition_grade: "S" },
  )
  assertEquals(r.ok, true)
})

Deno.test("storage '1TB' text matches integer 1000 (TB→GB)", () => {
  const r = verifyPCodeMatch(
    { product_id: "p1", storage_gb: "1TB", color: "Pink", condition_grade: "S" },
    { product_id: "p1", storage_gb: 1000, color: "Pink", condition_grade: "S" },
  )
  assertEquals(r.ok, true)
})

Deno.test("storage '256GB' text still hard-blocks against integer 128", () => {
  const r = verifyPCodeMatch(
    { product_id: "p1", storage_gb: "256GB", color: "Pink", condition_grade: "S" },
    { product_id: "p1", storage_gb: 128, color: "Pink", condition_grade: "S" },
  )
  assertEquals(r.ok, false)
  assertEquals(r.blocking.includes("storage_gb"), true)
})
