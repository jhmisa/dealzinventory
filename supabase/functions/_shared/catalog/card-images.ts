// Pair each iosys listing card's <img alt> (the SKU title) with its <img src> (the product
// photo). Keyed by a normalization that matches CatalogRow.raw_title, so harvestCatalog can
// attach an image URL to each row without touching the per-brand title parsers.

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

/** Normalize an alt/title string to the same shape as CatalogRow.raw_title for map lookups. */
export function normalizeAltKey(s: string): string {
  return decodeEntities(s).replace(/[\s　]+/g, " ").trim();
}

/** Force the large (_L) iosys size variant and resolve to an absolute URL. */
function normalizeSrc(src: string, baseUrl: string): string | null {
  let u = src.trim();
  if (!u) return null;
  if (u.startsWith("//")) u = "https:" + u;
  else if (u.startsWith("/")) u = baseUrl.replace(/\/+$/, "") + u;
  else if (!/^https?:\/\//i.test(u)) return null; // skip data: and other non-http srcs
  // iosys size suffix: {code}_{n}_{L|M|S}.{ext} — prefer the large variant.
  u = u.replace(/(_\d+_)[LMS](\.(?:jpe?g|webp|png))/i, "$1L$2");
  return u;
}

/** Map every card image on a listing page: normalized alt title -> absolute large image URL. */
export function extractCardImageMap(html: string, baseUrl = "https://iosys.co.jp"): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const alt = tag.match(/\salt="([^"]*)"/i)?.[1];
    const rawSrc = tag.match(/\ssrc="([^"]*)"/i)?.[1] ??
      tag.match(/\sdata-src="([^"]*)"/i)?.[1] ??
      tag.match(/\sdata-original="([^"]*)"/i)?.[1];
    if (!alt || !rawSrc) continue;
    const key = normalizeAltKey(alt);
    if (!key || map.has(key)) continue; // first card for a title wins
    const src = normalizeSrc(rawSrc, baseUrl);
    if (src) map.set(key, src);
  }
  return map;
}
