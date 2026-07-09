// Builds social-post captions. Dealz customers are Filipino, so captions are ENGLISH + emojis
// (Taglish-friendly), never Japanese — see the user_target_audience memory. Pure functions →
// unit-testable, no network.
//
// The caption is assembled DETERMINISTICALLY (R6): the model writes ONLY an engaging intro, and we
// splice a per-product emoji block (code · spec description · rank · price · /mine link) built in
// code — the same block the messaging AI uses for offers (formatOfferBlock). This guarantees every
// generation has the full specs, price, and product link, with no placeholder drift like the old
// "[Product Name]". buildCaptionPrompt below is the legacy single-shot fallback used only when no
// product could be resolved from the post's item codes.
import type { InventorySearchResult } from "./inventory-search.ts";
import { formatOfferBlock } from "./offer-reply.ts";

// Prompt the model for ONLY the intro (no specs/price/code/link — those are appended in code).
export function buildIntroPrompt(products: InventorySearchResult[]): string {
  const multi = products.length > 1;
  const summary = products
    .map((r) => `- ${r.description}${r.price != null ? ` (¥${r.price.toLocaleString("en-US")})` : ""}`)
    .join("\n");

  return [
    "Write ONLY a short, scroll-stopping intro for a Facebook post, in ENGLISH with a few emojis, for a Filipino resale audience.",
    multi
      ? `The post features ${products.length} products (listed below). Write a punchy 1–2 sentence intro that teases the whole lineup.`
      : "Write a punchy 1–2 sentence intro for this product.",
    "Do NOT include specs, prices, condition grades, codes, links, or a product list — those are added automatically AFTER your intro. Do NOT invent details.",
    `Product${multi ? "s" : ""} (context only, don't restate specs):\n${summary || "(see specs)"}`,
    "Rules: friendly + a little urgent; at most 2 hashtags; NO markdown; end with a soft CTA to order/message us.",
    "Return ONLY the intro text — no preamble, no quotes.",
  ].join("\n");
}

// Final caption = model intro + one emoji block per featured product. Blocks are separated by a
// blank line. Reuses formatOfferBlock so the block format stays identical to the messaging offers.
export function assembleSocialCaption(intro: string, products: InventorySearchResult[]): string {
  const blocks = products.map(formatOfferBlock);
  return [(intro ?? "").trim(), ...blocks].filter(Boolean).join("\n\n").trim();
}

export interface CaptionSpecs {
  brand?: string | null;
  model_name?: string | null;
  storage_gb?: number | null;
  ram_gb?: number | null;
  cpu?: string | null;
  color?: string | null;
  condition_grade?: string | null;
  selling_price?: number | null;
  discount_amount?: number | null;
  condition_notes?: string | null;
}

export function buildCaptionPrompt(specs: CaptionSpecs, code: string): string {
  const sell = specs.selling_price != null ? Number(specs.selling_price) : null;
  const disc = specs.discount_amount != null ? Number(specs.discount_amount) : 0;
  const effective = sell != null ? Math.max(0, sell - (disc || 0)) : null;
  const priceLine = effective != null
    ? (disc > 0
      ? `¥${effective.toLocaleString("en-US")} (was ¥${sell!.toLocaleString("en-US")})`
      : `¥${effective.toLocaleString("en-US")}`)
    : "ask for price";

  const specLine = [
    specs.brand,
    specs.model_name,
    specs.color,
    specs.storage_gb ? `${specs.storage_gb}GB` : null,
    specs.ram_gb ? `${specs.ram_gb}GB RAM` : null,
    specs.cpu,
    specs.condition_grade ? `Grade ${specs.condition_grade}` : null,
  ].filter(Boolean).join(" · ");

  return [
    "Write ONE short, scroll-stopping Facebook caption in ENGLISH with emojis for a Filipino resale audience.",
    "Rules: friendly + a little urgent; mention the condition and price; at most 3 hashtags; NO markdown; end with a soft CTA to message us to reserve.",
    `Product: ${specLine || "(see specs)"}`,
    `Price: ${priceLine}`,
    specs.condition_notes ? `Condition notes: ${specs.condition_notes}` : "",
    `Internal reference code (do NOT put this in the caption): ${code}`,
    "Return ONLY the caption text — no preamble, no quotes.",
  ].filter(Boolean).join("\n");
}
