import assert from "node:assert/strict";
import { buildCaptionPrompt } from "./social-caption.ts";

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
