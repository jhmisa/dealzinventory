// Pure helper for send-via-missive.ts, kept dependency-free so it is unit-testable under
// `deno test` without importing the Supabase client or reading Deno env.
import type { MessageAttachment } from './send-via-missive.ts';

export interface ApprovedDraftUpdate {
  status: 'SENT' | 'FAILED';
  auto_sent: boolean;
  content: string;
  attachments: MessageAttachment[];
}

// Build the `messages` UPDATE payload that turns an approved draft row into the sent (or failed)
// message. CRITICAL: it MUST carry the (possibly staff-edited) `content` and `attachments` —
// otherwise the surviving draft row keeps the original AI text and a retry resends the wrong
// message. This is the edit-send bug fix.
export function buildApprovedDraftUpdate(opts: {
  content: string;
  attachments?: MessageAttachment[];
  autoSent: boolean;
  failed: boolean;
}): ApprovedDraftUpdate {
  return {
    status: opts.failed ? 'FAILED' : 'SENT',
    auto_sent: opts.autoSent,
    content: opts.content,
    attachments: opts.attachments ?? [],
  };
}
