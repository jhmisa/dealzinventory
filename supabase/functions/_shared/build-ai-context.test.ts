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
