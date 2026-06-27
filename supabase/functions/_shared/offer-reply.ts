import type { InventorySearchResult } from "./inventory-search.ts";

const MAX_OFFERS = 3; // matches the offered-photo attachment cap
// Matches {{OFFER:P001443}} (code-bearing, preferred) and bare {{OFFER}} (fallback).
const OFFER_TOKEN_RE = /\{\{OFFER(?::([A-Za-z0-9]+))?\}\}/g;
const REMOVED = ""; // transient sentinel marking a token we could not resolve (private-use char, never in real text)

/**
 * Render a backorder lead time as a working-day range. lead_time_days is the upper bound (max),
 * lead_time_min_days the lower bound. Returns null when neither is a positive number (→ plain
 * "Pre-order"); collapses an equal/absent bound to a single figure.
 */
function formatLeadTime(min: number | null | undefined, max: number | null | undefined): string | null {
  const lo = typeof min === "number" && min > 0 ? min : null;
  const hi = typeof max === "number" && max > 0 ? max : null;
  if (lo && hi) return lo === hi ? `${hi} working days` : `${lo}–${hi} working days`;
  if (hi) return `${hi} working days`;
  if (lo) return `${lo} working days`;
  return null;
}

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
  if (r.type === "backorder") {
    // Pre-order badge + working-day lead-time range. Both bounds may be missing → plain "Pre-order".
    const lead = formatLeadTime(r.lead_time_min_days, r.lead_time_days);
    lines.push(lead ? `⏳ Pre-order · ${lead}` : `⏳ Pre-order`);
  }
  lines.push(`📸 Buy Now & View Photos: ${r.order_url}`);
  return lines.join("\n");
}

/**
 * Splice the offered item block(s) into the model's reply. The model writes a
 * {{OFFER:CODE}} token naming the exact P-code/G-code it is offering; we replace each token
 * with that code's emoji block. A bare {{OFFER}} (no code) falls back to the derived
 * `codes` in order. Tokens whose code is not in `catalog` are stripped so a raw token never
 * reaches a customer. Interior double-spaces inside a description are preserved (only
 * whitespace left behind by a stripped token is tidied).
 */
export function assembleOfferReply(
  reply: string,
  codes: string[],
  catalog: Map<string, InventorySearchResult>,
): string {
  const text = reply ?? "";
  const fallback = codes
    .slice(0, MAX_OFFERS)
    .map((c) => catalog.get(c))
    .filter((r): r is InventorySearchResult => r != null);
  let fallbackIdx = 0;

  const spliced = text.replace(OFFER_TOKEN_RE, (_m, code: string | undefined) => {
    const r = code
      ? catalog.get(code.toUpperCase()) ?? null
      : fallback[fallbackIdx++] ?? null;
    return r ? formatOfferBlock(r) : REMOVED;
  });

  return spliced
    .replace(new RegExp(`[ \\t]*${REMOVED}[ \\t]*`, "g"), " ") // unresolved token → single space
    .replace(/[ \t]+\n/g, "\n") // trailing spaces a removed token left before a newline
    .replace(/\n[ \t]+/g, "\n") // leading spaces a removed token left after a newline
    .replace(/\n{3,}/g, "\n\n") // collapse blank-line runs left by a removed own-line token
    .trim();
}
