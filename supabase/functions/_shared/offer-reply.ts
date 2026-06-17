import type { InventorySearchResult } from "./inventory-search.ts";

const OFFER_TOKEN = "{{OFFER}}";
const MAX_OFFERS = 3; // matches the offered-photo attachment cap

/**
 * Render one offered item as the emoji spec block agents use manually. Plain text only —
 * NO markdown — so Facebook Messenger shows it cleanly and the bare URL stays clickable.
 * Grade/price lines are omitted when their data is null.
 */
export function formatOfferBlock(r: InventorySearchResult): string {
  const lines = [
    `🏷 ${r.code}`,
    `📝 ${r.description}`,
  ];
  if (r.grade) lines.push(`🏅 Rank ${r.grade}`);
  if (r.price != null) lines.push(`💴 ¥${r.price.toLocaleString("en-US")}`);
  lines.push(`📸 Buy Now & View Photos: ${r.order_url}`);
  return lines.join("\n");
}

/**
 * Splice the offered item block(s) into the model's reply. The model is instructed to write
 * intro + the {{OFFER}} token + outro; we replace the token with the assembled block(s).
 * Fallbacks: if the model forgot the token but codes were offered, append the block(s) at
 * the end; if there are no codes, strip any stray token so it never reaches a customer.
 * Only codes present in `catalog` are rendered (we need real data to show).
 */
export function assembleOfferReply(
  reply: string,
  codes: string[],
  catalog: Map<string, InventorySearchResult>,
): string {
  const blocks = codes
    .slice(0, MAX_OFFERS)
    .map((c) => catalog.get(c))
    .filter((r): r is InventorySearchResult => r != null)
    .map(formatOfferBlock);

  const text = reply ?? "";

  if (blocks.length === 0) {
    // Remove a stray token and tidy the doubled spaces / blank lines it leaves behind.
    return text
      .replace(new RegExp(`\\s*${escapeRegExp(OFFER_TOKEN)}\\s*`, "g"), " ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  const joined = blocks.join("\n\n");

  if (text.includes(OFFER_TOKEN)) {
    return text.split(OFFER_TOKEN).join(joined).trim();
  }

  // Token missing — append after the reply.
  return `${text.trim()}\n\n${joined}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
