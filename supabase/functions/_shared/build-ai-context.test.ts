import { assertEquals } from 'jsr:@std/assert@1';
import { selectLatestCustomerImageAttachments } from './build-ai-context.ts';

Deno.test('selects image attachments from the trailing customer burst only', () => {
  const messages = [
    { role: 'assistant', attachments: [{ file_url: 'a.png', mime_type: 'image/png' }] },
    { role: 'customer', attachments: [{ file_url: 'b.jpg', mime_type: 'image/jpeg' }] },
    { role: 'customer', attachments: [{ file_url: 'c.pdf', mime_type: 'application/pdf' }] },
    { role: 'customer', attachments: [{ file_url: 'd.png', mime_type: 'image/png' }] },
  ];
  const result = selectLatestCustomerImageAttachments(messages, 4);
  // Only images from the trailing customer run (b, d); a.png belongs to an assistant turn; c is not an image.
  assertEquals(result.map((r) => r.file_url), ['b.jpg', 'd.png']);
});

Deno.test('stops at the last non-customer message', () => {
  const messages = [
    { role: 'customer', attachments: [{ file_url: 'old.png', mime_type: 'image/png' }] },
    { role: 'staff', attachments: [] },
    { role: 'customer', attachments: [{ file_url: 'new.png', mime_type: 'image/png' }] },
  ];
  assertEquals(
    selectLatestCustomerImageAttachments(messages, 4).map((r) => r.file_url),
    ['new.png'],
  );
});

Deno.test('respects maxImages cap', () => {
  const messages = [
    { role: 'customer', attachments: [
      { file_url: '1.png', mime_type: 'image/png' },
      { file_url: '2.png', mime_type: 'image/png' },
      { file_url: '3.png', mime_type: 'image/png' },
    ] },
  ];
  assertEquals(selectLatestCustomerImageAttachments(messages, 2).length, 2);
});

Deno.test('handles missing/!array attachments safely', () => {
  const messages = [
    { role: 'customer', attachments: null },
    { role: 'customer', attachments: undefined },
  ];
  assertEquals(selectLatestCustomerImageAttachments(messages, 4), []);
});

import {
  formatOrderItem,
  mostRecentOrderCode,
  formatContextForPrompt,
} from './build-ai-context.ts';

Deno.test('formatOrderItem renders brand + model + P-code when model is known', () => {
  assertEquals(
    formatOrderItem({ item_code: 'P000417', product_models: { brand: 'Apple', model_name: 'iPhone 13' } }),
    'Apple iPhone 13 (P000417)',
  );
});

Deno.test('formatOrderItem falls back to the P-code when model is missing', () => {
  assertEquals(
    formatOrderItem({ item_code: 'P000417', product_models: null }),
    'P000417',
  );
});

Deno.test('mostRecentOrderCode picks the newest order across active + recent', () => {
  const active = [{ order_code: 'ORD000200', created_at: '2026-06-10T00:00:00Z' }];
  const recent = [
    { order_code: 'ORD000100', created_at: '2026-06-01T00:00:00Z' },
    { order_code: 'ORD000200', created_at: '2026-06-10T00:00:00Z' },
  ];
  assertEquals(mostRecentOrderCode(active, recent), 'ORD000200');
});

Deno.test('mostRecentOrderCode returns null when there are no orders', () => {
  assertEquals(mostRecentOrderCode([], []), null);
});

Deno.test('formatContextForPrompt marks the most recent order', () => {
  const ctx = {
    customer: null,
    activeOrders: [{
      order_code: 'ORD000200', order_status: 'SHIPPED', total_price: 1000,
      tracking_number: null, yamato_status: null, shipped_date: null, delivery_date: null,
      delivery_issue_flag: false, created_at: '2026-06-10T00:00:00Z',
      items: ['Apple iPhone 13 (P000417)'],
    }],
    recentOrders: [{
      order_code: 'ORD000100', order_status: 'DELIVERED', total_price: 500,
      tracking_number: null, yamato_status: null, shipped_date: null, delivery_date: null,
      delivery_issue_flag: false, created_at: '2026-06-01T00:00:00Z', items: [],
    }],
    kaitoriRequests: [], recentMessages: [], inventorySummary: [],
    availableItems: [], accessorySummary: [],
  } as unknown as Parameters<typeof formatContextForPrompt>[0];

  const out = formatContextForPrompt(ctx);
  assertEquals(out.includes('ORD000200'), true);
  assertEquals(out.includes('← most recent'), true);
  assertEquals(out.includes('Apple iPhone 13 (P000417)'), true);
  assertEquals(out.includes('ORD000100: DELIVERED'), true);
});
