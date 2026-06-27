/**
 * Normalize AI-generated reply text into plain text for chat channels
 * (Missive → Messenger) that do NOT render Markdown.
 *
 * The model is instructed to avoid Markdown (see INVENTORY_RESPONSE_RULE in
 * ai-providers.ts) but does not always comply, so customers were seeing literal
 * `**bold**` and `[Order here](url)` syntax. This is the deterministic enforcement
 * at the outbound boundary.
 *
 * Design notes:
 * - Markdown links become `label: url` so the order URL is PRESERVED (dropping it
 *   would lose the customer's order link). If the label is redundant with the URL,
 *   only the URL is kept.
 * - Idempotent: text with no Markdown is returned unchanged, and applying it twice
 *   is a no-op (safe to call at multiple layers / defense-in-depth).
 * - Conservative: only strips unambiguous Markdown constructs. Leaves plain URLs,
 *   emoji, ¥ amounts, `4GB + 8GB` style specs, em dashes, and numbered lists alone.
 */
export function normalizeOutboundText(input: string): string {
  if (!input) return input;
  let out = input;

  // 1) Markdown links: [label](url) -> "label: url" (keep the URL).
  //    URL token has no whitespace; label cannot contain a closing bracket.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, rawLabel: string, rawUrl: string) => {
    const label = rawLabel.trim();
    const url = rawUrl.trim();
    if (!label || label === url || url.includes(label)) return url;
    return `${label}: ${url}`;
  });

  // 2) Bold/strong: **x** and __x__ -> x.
  //    `__` form guarded by word boundaries so it never touches underscores inside
  //    a plain URL (which use single underscores, e.g. iphone15_plus_a3093).
  out = out.replace(/\*\*(.+?)\*\*/gs, '$1');
  out = out.replace(/(?<!\w)__(?=\S)(.+?)(?<=\S)__(?!\w)/gs, '$1');

  // 3) Inline code: `x` -> x
  out = out.replace(/`([^`\n]+)`/g, '$1');

  // 4) Leading list bullets (-, *, +) at line start -> removed. Numbered lists kept.
  out = out.replace(/^[ \t]*[-*+][ \t]+/gm, '');

  // 5) Leading ATX headers (#, ##, ...) -> removed.
  out = out.replace(/^[ \t]*#{1,6}[ \t]+/gm, '');

  return out;
}
