import assert from "node:assert/strict";
import { assembleSocialCaption, buildCaptionPrompt, buildIntroPrompt } from "./social-caption.ts";
import type { InventorySearchResult } from "./inventory-search.ts";

function fakeProduct(over: Partial<InventorySearchResult> = {}): InventorySearchResult {
  return {
    type: "item",
    code: "P000417",
    description: "Apple iPhone 13 · Blue · 128GB",
    grade: "A",
    price: 55000,
    available_count: 1,
    thumbnail_url: null,
    display_url: null,
    order_url: "https://dealzinventory.vercel.app/mine/P000417",
    ...over,
  };
}

Deno.test("buildIntroPrompt asks for intro only, English + emoji, no specs/links restated", () => {
  const p = buildIntroPrompt([fakeProduct()]);
  assert.match(p, /ENGLISH/);
  assert.match(p, /intro/i);
  assert.match(p, /Do NOT include specs/);
  // product description is passed as context
  assert.match(p, /iPhone 13/);
});

Deno.test("buildIntroPrompt announces the count for multi-product posts", () => {
  const p = buildIntroPrompt([fakeProduct(), fakeProduct({ code: "P000999", description: "Oppo Reno A" })]);
  assert.match(p, /features 2 products/);
  assert.match(p, /Oppo Reno A/);
});

Deno.test("assembleSocialCaption splices the intro + one emoji block per product with code, price, link", () => {
  const caption = assembleSocialCaption("🔥 Fresh drop, pre! Order now 👇", [fakeProduct()]);
  assert.match(caption, /^🔥 Fresh drop/); // intro leads
  assert.match(caption, /🏷 P000417/);
  assert.match(caption, /💴 ¥55,000/);
  assert.match(caption, /🏅 Rank A/);
  assert.match(caption, /\/mine\/P000417/);
});

Deno.test("assembleSocialCaption lists every product for a multi-product caption", () => {
  const caption = assembleSocialCaption("Lineup alert! 🚨", [
    fakeProduct(),
    fakeProduct({ code: "P000999", description: "Oppo Reno A", price: 19900, order_url: "https://dealzinventory.vercel.app/mine/P000999" }),
  ]);
  assert.match(caption, /🏷 P000417/);
  assert.match(caption, /🏷 P000999/);
  assert.match(caption, /Oppo Reno A/);
  assert.match(caption, /\/mine\/P000999/);
});

Deno.test("buildCaptionPrompt includes model, price, and English/emoji instruction", () => {
  const p = buildCaptionPrompt(
    { brand: "Apple", model_name: "iPhone 13", storage_gb: 128, color: "Blue", condition_grade: "A", selling_price: 55000 },
    "P000417",
  );
  assert.match(p, /iPhone 13/);
  assert.match(p, /55,000/);
  assert.match(p, /ENGLISH/);
  assert.match(p, /emojis/);
  // the reference code is passed but instructed to be excluded from the caption
  assert.match(p, /P000417/);
});

Deno.test("buildCaptionPrompt shows a was/now price when discounted", () => {
  const p = buildCaptionPrompt({ brand: "Apple", model_name: "iPhone 13", selling_price: 55000, discount_amount: 5000 }, "P1");
  assert.match(p, /¥50,000 \(was ¥55,000\)/);
});

Deno.test("buildCaptionPrompt falls back to 'ask for price' with no price", () => {
  const p = buildCaptionPrompt({ brand: "Oppo", model_name: "Reno A" }, "B1");
  assert.match(p, /ask for price/);
});
