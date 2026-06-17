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

Deno.test('assembleOfferReply replaces {{OFFER:CODE}} with that code block in place', () => {
  const catalog = new Map([['P001443', res({})]]);
  const reply = 'Yes, available pa po! 😊\n\n{{OFFER:P001443}}\n\nLet me know po!';
  assertEquals(assembleOfferReply(reply, ['P001443'], catalog),
    'Yes, available pa po! 😊\n\n' +
    formatOfferBlock(res({})) +
    '\n\nLet me know po!');
});

Deno.test('assembleOfferReply renders one block per code-bearing token', () => {
  const a = res({ code: 'P001443' });
  const b = res({ code: 'P001444', description: 'Oppo A5 5G Black', order_url: 'https://dealzinventory.vercel.app/mine/P001444' });
  const catalog = new Map([['P001443', a], ['P001444', b]]);
  assertEquals(assembleOfferReply('{{OFFER:P001443}}\n\n{{OFFER:P001444}}', ['P001443', 'P001444'], catalog),
    `${formatOfferBlock(a)}\n\n${formatOfferBlock(b)}`);
});

Deno.test('assembleOfferReply matches the token code case-insensitively', () => {
  const catalog = new Map([['P001443', res({})]]);
  assertEquals(assembleOfferReply('{{OFFER:p001443}}', ['P001443'], catalog), formatOfferBlock(res({})));
});

Deno.test('assembleOfferReply strips a token whose code is not in the catalog', () => {
  assertEquals(assembleOfferReply('Hi po! {{OFFER:P999999}} salamat!', [], new Map()),
    'Hi po! salamat!');
});

Deno.test('assembleOfferReply bare {{OFFER}} falls back to the offered codes', () => {
  const catalog = new Map([['P001443', res({})]]);
  assertEquals(assembleOfferReply('{{OFFER}}', ['P001443'], catalog), formatOfferBlock(res({})));
});

Deno.test('assembleOfferReply strips a bare {{OFFER}} when there are no codes', () => {
  assertEquals(assembleOfferReply('Hi po! {{OFFER}} salamat!', [], new Map()),
    'Hi po! salamat!');
});

Deno.test('assembleOfferReply passes plain replies through unchanged', () => {
  assertEquals(assembleOfferReply('Salamat po!', [], new Map()), 'Salamat po!');
});

Deno.test('assembleOfferReply preserves double-spaces inside a description', () => {
  const r = res({ description: 'Toshiba Dynabook K50 8GB 128GB  Intel Celeron' });
  const catalog = new Map([['P001443', r]]);
  assertEquals(assembleOfferReply('{{OFFER:P001443}}', ['P001443'], catalog).includes('128GB  Intel'), true);
});

Deno.test('assembleOfferReply own-line stripped token leaves no blank-line gap', () => {
  assertEquals(assembleOfferReply('A\n\n{{OFFER:P999}}\n\nB', [], new Map()), 'A\n\nB');
});
