import { assertEquals } from 'jsr:@std/assert@1';
import { buildApprovedDraftUpdate } from './send-via-missive-helpers.ts';

Deno.test('buildApprovedDraftUpdate persists edited content + attachments on success', () => {
  const p = buildApprovedDraftUpdate({
    content: 'EDITED TEXT',
    attachments: [{ file_url: 'a.jpg' }],
    autoSent: false,
    failed: false,
  });
  assertEquals(p.status, 'SENT');
  assertEquals(p.content, 'EDITED TEXT');
  assertEquals(p.attachments, [{ file_url: 'a.jpg' }]);
  assertEquals(p.auto_sent, false);
});

Deno.test('buildApprovedDraftUpdate persists edited content even on failure (retry must resend the edit, not the original)', () => {
  const p = buildApprovedDraftUpdate({ content: 'EDITED', attachments: undefined, autoSent: true, failed: true });
  assertEquals(p.status, 'FAILED');
  assertEquals(p.content, 'EDITED');
  assertEquals(p.attachments, []);
  assertEquals(p.auto_sent, true);
});
