import { assertEquals } from 'jsr:@std/assert@1';
import { normalizeOutboundText } from './normalize-markdown.ts';

Deno.test('strips bold markers', () => {
  assertEquals(
    normalizeOutboundText('**Iris Ohyama LUCA Tablet TM101**'),
    'Iris Ohyama LUCA Tablet TM101',
  );
});

Deno.test('converts a markdown link to "label: url" (keeps the URL)', () => {
  assertEquals(
    normalizeOutboundText('[Order here](https://dealzinventory.vercel.app/mine/G000022)'),
    'Order here: https://dealzinventory.vercel.app/mine/G000022',
  );
});

Deno.test('normalizes a full product-list line like the bug screenshot', () => {
  const input =
    '1. **Iris Ohyama LUCA Tablet TM101** (Black / 3GB / 32GB / Android 11) — Grade A, ¥7,900. [Order here](https://dealzinventory.vercel.app/mine/G000022)';
  const expected =
    '1. Iris Ohyama LUCA Tablet TM101 (Black / 3GB / 32GB / Android 11) — Grade A, ¥7,900. Order here: https://dealzinventory.vercel.app/mine/G000022';
  assertEquals(normalizeOutboundText(input), expected);
});

Deno.test('leaves a plain-text offer block untouched', () => {
  const block =
    '🏷 P001443\n📝 Oppo A5 5G 4GB 128GB Aurora Green\n🏅 Rank S\n💴 ¥18,900\n📸 Buy Now & View Photos: https://dealzinventory.vercel.app/mine/P001443';
  assertEquals(normalizeOutboundText(block), block);
});

Deno.test('preserves specs with plus signs and yen (not markdown)', () => {
  assertEquals(
    normalizeOutboundText('(Midnight Black / 4GB + 8GB / 128GB) — ¥16,000'),
    '(Midnight Black / 4GB + 8GB / 128GB) — ¥16,000',
  );
});

Deno.test('does not corrupt underscores inside a plain URL', () => {
  const url = 'See https://iosys.co.jp/items/iphone15_plus_a3093/384323 for details';
  assertEquals(normalizeOutboundText(url), url);
});

Deno.test('strips leading markdown bullets but keeps numbered lists', () => {
  assertEquals(normalizeOutboundText('- item one'), 'item one');
  assertEquals(normalizeOutboundText('* item two'), 'item two');
  assertEquals(normalizeOutboundText('1. item three'), '1. item three');
});

Deno.test('is idempotent (running twice changes nothing more)', () => {
  const once = normalizeOutboundText('**hi** [x](https://y.z/a)');
  assertEquals(normalizeOutboundText(once), once);
});

Deno.test('handles empty / falsy input', () => {
  assertEquals(normalizeOutboundText(''), '');
});
