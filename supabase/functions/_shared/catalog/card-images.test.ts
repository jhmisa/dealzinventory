import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractCardImageMap, normalizeAltKey } from "./card-images.ts";

const HTML = `
<li class="item">
  <img alt="iPhone 12 64GB ブラック (MGHN3J/A)" src="https://iosys.co.jp/img/items/12345_2_M.jpg">
</li>
<li class="item">
  <img src="//iosys.co.jp/img/items/67890_1_S.webp" alt="Galaxy S24 SM-S921Q 256GB Onyx Black">
</li>
<li class="item">
  <img alt="thumb only" src="/img/items/00000_1_L.jpg">
</li>`;

Deno.test("extractCardImageMap keys by normalized alt and forces the _L large variant + absolute URL", () => {
  const map = extractCardImageMap(HTML, "https://iosys.co.jp");
  assertEquals(
    map.get(normalizeAltKey("iPhone 12 64GB ブラック (MGHN3J/A)")),
    "https://iosys.co.jp/img/items/12345_2_L.jpg",
  );
  // src-before-alt order still works; protocol-relative URL resolved.
  assertEquals(
    map.get(normalizeAltKey("Galaxy S24 SM-S921Q 256GB Onyx Black")),
    "https://iosys.co.jp/img/items/67890_1_L.webp",
  );
  // relative URL resolved against base.
  assertEquals(map.get(normalizeAltKey("thumb only")), "https://iosys.co.jp/img/items/00000_1_L.jpg");
});

Deno.test("extractCardImageMap prefers data-src over a dummy src placeholder and forces _L", () => {
  const html =
    `<li class="item"><img src="/common_img/dummy/dummy.gif" data-src="https://d27ea4kkb8flj9.cloudfront.net/400021_1_M.jpg" alt="iPhone 17e A3575 黒"></li>`;
  const map = extractCardImageMap(html, "https://iosys.co.jp");
  assertEquals(
    map.get(normalizeAltKey("iPhone 17e A3575 黒")),
    "https://d27ea4kkb8flj9.cloudfront.net/400021_1_L.jpg",
  );
});

Deno.test("extractCardImageMap rejects a src-only dummy placeholder (no data-src) → no entry", () => {
  const html = `<li class="item"><img src="/common_img/dummy/dummy.gif" alt="Some iPhone 128GB"></li>`;
  const map = extractCardImageMap(html, "https://iosys.co.jp");
  assertEquals(map.has(normalizeAltKey("Some iPhone 128GB")), false);
});

Deno.test("extractCardImageMap falls through a dummy data-src to a real src", () => {
  const html = `<li class="item"><img data-src="/common_img/dummy/dummy.gif" src="https://d27ea4kkb8flj9.cloudfront.net/55555_1_M.jpg" alt="iPad Air 256GB Blue"></li>`;
  const map = extractCardImageMap(html, "https://iosys.co.jp");
  assertEquals(map.get(normalizeAltKey("iPad Air 256GB Blue")), "https://d27ea4kkb8flj9.cloudfront.net/55555_1_L.jpg");
});

Deno.test("normalizeAltKey collapses whitespace and decodes entities", () => {
  assertEquals(normalizeAltKey("iPhone&nbsp;12  64GB"), normalizeAltKey("iPhone 12 64GB"));
});
