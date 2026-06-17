import { assertEquals } from 'jsr:@std/assert@1';
import { formatOfferBlock, assembleOfferReply } from './offer-reply.ts';
import type { InventorySearchResult } from './inventory-search.ts';

function res(over: Partial<InventorySearchResult>): InventorySearchResult {
  return {
    type: 'item', code: 'P001443', description: 'Oppo A5 5G 4GB 128GB Aurora Green',
    grade: 'S', price: 18900, available_count: 1, thumbnail_url: null, display_url: null,
    order_url: 'https://dealzinventory.vercel.app/mine/P001443', ...over,
  };
}

Deno.test('formatOfferBlock renders the full emoji block', () => {
  assertEquals(formatOfferBlock(res({})),
    '🏷 P001443\n' +
    '📝 Oppo A5 5G 4GB 128GB Aurora Green\n' +
    '🏅 Rank S\n' +
    '💴 ¥18,900\n' +
    '📸 Buy Now & View Photos: https://dealzinventory.vercel.app/mine/P001443');
});

Deno.test('formatOfferBlock omits grade and price lines when null', () => {
  assertEquals(formatOfferBlock(res({ grade: null, price: null })),
    '🏷 P001443\n' +
    '📝 Oppo A5 5G 4GB 128GB Aurora Green\n' +
    '📸 Buy Now & View Photos: https://dealzinventory.vercel.app/mine/P001443');
});

Deno.test('formatOfferBlock formats price with thousands separators', () => {
  assertEquals(formatOfferBlock(res({ price: 1299000 })).includes('💴 ¥1,299,000'), true);
});

Deno.test('assembleOfferReply replaces the {{OFFER}} token in place', () => {
  const catalog = new Map([['P001443', res({})]]);
  const reply = 'Yes, available pa po! 😊\n\n{{OFFER}}\n\nLet me know po!';
  assertEquals(assembleOfferReply(reply, ['P001443'], catalog),
    'Yes, available pa po! 😊\n\n' +
    formatOfferBlock(res({})) +
    '\n\nLet me know po!');
});

Deno.test('assembleOfferReply stacks multiple offers separated by a blank line', () => {
  const a = res({ code: 'P001443' });
  const b = res({ code: 'P001444', description: 'Oppo A5 5G Black', order_url: 'https://dealzinventory.vercel.app/mine/P001444' });
  const catalog = new Map([['P001443', a], ['P001444', b]]);
  assertEquals(assembleOfferReply('{{OFFER}}', ['P001443', 'P001444'], catalog),
    `${formatOfferBlock(a)}\n\n${formatOfferBlock(b)}`);
});

Deno.test('assembleOfferReply appends block at end when token missing but codes present', () => {
  const catalog = new Map([['P001443', res({})]]);
  assertEquals(assembleOfferReply('Yes available po!', ['P001443'], catalog),
    `Yes available po!\n\n${formatOfferBlock(res({}))}`);
});

Deno.test('assembleOfferReply strips a stray token when there are no codes', () => {
  assertEquals(assembleOfferReply('Hi po! {{OFFER}} salamat!', [], new Map()),
    'Hi po! salamat!');
});

Deno.test('assembleOfferReply passes plain replies through unchanged', () => {
  assertEquals(assembleOfferReply('Salamat po!', [], new Map()), 'Salamat po!');
});

Deno.test('assembleOfferReply ignores codes missing from the catalog', () => {
  assertEquals(assembleOfferReply('{{OFFER}}', ['P999999'], new Map()), '');
});

Deno.test('assembleOfferReply replaces only the first token and strips extras (no duplication)', () => {
  const catalog = new Map([['P001443', res({})]]);
  assertEquals(assembleOfferReply('A {{OFFER}} B {{OFFER}} C', ['P001443'], catalog),
    `A ${formatOfferBlock(res({}))} B C`);
});

Deno.test('assembleOfferReply preserves double-spaces inside a description', () => {
  const r = res({ description: 'Toshiba Dynabook K50 8GB 128GB  Intel Celeron' });
  const catalog = new Map([['P001443', r]]);
  const out = assembleOfferReply('{{OFFER}}', ['P001443'], catalog);
  assertEquals(out.includes('128GB  Intel'), true);
});
