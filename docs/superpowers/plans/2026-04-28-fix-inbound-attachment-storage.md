# Fix Inbound Attachment Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download inbound customer attachments from Missive to Supabase Storage so they don't expire (currently Missive signed URLs expire in ~11 minutes).

**Architecture:** Add a shared `download-to-storage.ts` helper in `supabase/functions/_shared/` that fetches a URL and uploads the binary to the `messaging-attachments` bucket. Both `missive-webhook` and `backfill-missive-inbound` call this helper instead of storing the raw Missive/Facebook URL.

**Tech Stack:** Supabase Edge Functions (Deno), Supabase Storage API

---

### Task 1: Create shared download-to-storage helper

**Files:**
- Create: `supabase/functions/_shared/download-to-storage.ts`

- [ ] **Step 1: Create the shared helper**

```typescript
// supabase/functions/_shared/download-to-storage.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const STORAGE_BUCKET = 'messaging-attachments';

interface StoredAttachment {
  file_url: string;      // Supabase Storage path (not external URL)
  filename: string;
  mime_type: string;
  size_bytes?: number;
}

/**
 * Download a file from an external URL and upload it to Supabase Storage.
 * Returns a StoredAttachment with the storage path, or null if download fails.
 *
 * Used by missive-webhook and backfill-missive-inbound to persist inbound
 * attachments that would otherwise expire (Missive signed URLs ~11 min TTL).
 */
export async function downloadToStorage(
  supabase: ReturnType<typeof createClient>,
  externalUrl: string,
  conversationDbId: string,
  filename: string,
  mimeType: string,
): Promise<StoredAttachment | null> {
  try {
    const res = await fetch(externalUrl);
    if (!res.ok) {
      console.warn('downloadToStorage: fetch failed', res.status, externalUrl.slice(0, 80));
      return null;
    }

    const blob = await res.blob();
    const uniqueName = `${crypto.randomUUID()}_${sanitizeFilename(filename)}`;
    const storagePath = `${conversationDbId}/${uniqueName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, blob, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.warn('downloadToStorage: upload failed', uploadError.message);
      return null;
    }

    return {
      file_url: storagePath,
      filename,
      mime_type: mimeType,
      size_bytes: blob.size,
    };
  } catch (e) {
    console.warn('downloadToStorage: error', e);
    return null;
  }
}

/**
 * Download an array of external-URL attachments to Supabase Storage.
 * Returns the array with storage paths replacing external URLs.
 * Attachments that fail to download are kept with their original URL as fallback.
 */
export async function downloadAttachmentsToStorage(
  supabase: ReturnType<typeof createClient>,
  attachments: Array<{ file_url: string; filename: string; mime_type: string; size_bytes?: number }>,
  conversationDbId: string,
): Promise<StoredAttachment[]> {
  const results: StoredAttachment[] = [];
  for (const att of attachments) {
    const stored = await downloadToStorage(
      supabase,
      att.file_url,
      conversationDbId,
      att.filename,
      att.mime_type,
    );
    // Use stored version if download succeeded, otherwise keep original URL as fallback
    results.push(stored ?? att);
  }
  return results;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100);
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/download-to-storage.ts
git commit -m "feat: add shared helper to download inbound attachments to Supabase Storage"
```

---

### Task 2: Update missive-webhook to persist attachments to Storage

**Files:**
- Modify: `supabase/functions/missive-webhook/index.ts`

The `backgroundEnrichMessage` function currently stores Missive signed URLs directly. Change it to download attachments to Storage. Also handle inline images that were stored with external URLs during the fast-path insert.

- [ ] **Step 1: Add import at top of file**

After the existing imports at the top of the file, add:

```typescript
import { downloadAttachmentsToStorage } from "../_shared/download-to-storage.ts";
```

- [ ] **Step 2: Update the attachment section of backgroundEnrichMessage**

Replace the entire "2. Fetch full message from Missive API to get attachments" block (lines 222-261) with code that:
1. Fetches attachments from Missive API (same as before)
2. Downloads them to Supabase Storage via the shared helper
3. Also re-downloads any inline images that were stored with external URLs during the fast path

```typescript
    // 2. Fetch full message from Missive API to get attachments
    if (MISSIVE_API_TOKEN) {
      try {
        const msgRes = await fetch(`${MISSIVE_API_URL}/messages/${missiveMessageId}`, {
          headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` },
        });
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          const rawAttachments = msgData?.messages?.attachments ?? msgData?.message?.attachments ?? [];
          const missiveAttachments = rawAttachments
            .filter((a: { url?: string }) => a.url)
            .map((a: { url: string; filename?: string; media_type?: string; sub_type?: string; size?: number }) => ({
              file_url: a.url,
              filename: a.filename ?? 'attachment',
              mime_type: a.media_type && a.sub_type ? `${a.media_type}/${a.sub_type}` : 'application/octet-stream',
              ...(a.size ? { size_bytes: a.size } : {}),
            }));

          // Fetch existing attachments (may include inline images from fast-path)
          const { data: existingMsg } = await supabase
            .from('messages')
            .select('attachments')
            .eq('id', messageDbId)
            .single();
          const existing = (existingMsg?.attachments ?? []) as Array<{ file_url: string; filename: string; mime_type: string; size_bytes?: number }>;

          // Split existing into external URLs (need downloading) and already-stored paths
          const externalExisting = existing.filter(a =>
            a.file_url.startsWith('http://') || a.file_url.startsWith('https://'),
          );
          const alreadyStored = existing.filter(a =>
            !a.file_url.startsWith('http://') && !a.file_url.startsWith('https://'),
          );

          // Dedupe Missive attachments against existing external URLs
          const existingUrls = new Set(existing.map(a => a.file_url));
          const newMissiveAttachments = missiveAttachments.filter(
            (a: { file_url: string }) => !existingUrls.has(a.file_url),
          );

          // Combine all external-URL attachments that need downloading
          const toDownload = [...externalExisting, ...newMissiveAttachments];

          if (toDownload.length > 0 || alreadyStored.length !== existing.length) {
            // Download all external URLs to Supabase Storage
            const downloaded = await downloadAttachmentsToStorage(
              supabase,
              toDownload,
              conversationDbId,
            );

            const merged = [...alreadyStored, ...downloaded];
            await supabase
              .from('messages')
              .update({ attachments: merged })
              .eq('id', messageDbId);
            console.log('Background: persisted', downloaded.length, 'attachment(s) to storage for message', messageDbId);
          }
        } else {
          console.warn('Background: Missive message fetch failed:', msgRes.status);
        }
      } catch (e) {
        console.warn('Background: failed to fetch message attachments from Missive:', e);
      }
    }
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/missive-webhook/index.ts
git commit -m "fix: download inbound attachments to Storage instead of storing expiring Missive URLs"
```

---

### Task 3: Update backfill-missive-inbound to persist attachments to Storage

**Files:**
- Modify: `supabase/functions/backfill-missive-inbound/index.ts`

The backfill function processes messages synchronously, so download attachments before inserting.

- [ ] **Step 1: Add import at top of file**

After the existing imports:

```typescript
import { downloadAttachmentsToStorage } from "../_shared/download-to-storage.ts";
```

- [ ] **Step 2: Update the message insert section**

After line 344 where attachments are merged (`const attachments = [...apiAttachments, ...uniqueInline];`), add a download step before the insert. Replace lines 346-369 with:

```typescript
          const msgCreatedAt = detail.created_at ?? summary.created_at ?? null;
          const createdAtIso = msgCreatedAt
            ? new Date(msgCreatedAt * 1000).toISOString()
            : null;

          // Download external attachments to Supabase Storage so URLs don't expire
          const storedAttachments = attachments.length > 0 && !dryRun
            ? await downloadAttachmentsToStorage(supabase, attachments, conv.id)
            : attachments;

          if (!dryRun) {
            const { error: insertError } = await supabase.from('messages').insert({
              conversation_id: conv.id,
              missive_message_id: summary.id,
              role: 'customer' as const,
              content,
              status: 'SENT' as const,
              message_type: 'REPLY' as const,
              ...(storedAttachments.length > 0 ? { attachments: storedAttachments } : {}),
              // Preserve original send time — the UI shows created_at as the bubble timestamp
              ...(createdAtIso ? { created_at: createdAtIso } : {}),
            });
            if (insertError) {
              errors.push({
                conversation_id: conv.id,
                error: `insert ${summary.id}: ${insertError.message}`,
              });
              continue;
            }
          }
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/backfill-missive-inbound/index.ts
git commit -m "fix: backfill downloads inbound attachments to Storage instead of storing expiring URLs"
```

---

### Task 4: Backfill existing messages with expired attachment URLs

**Files:**
- Create: `supabase/functions/backfill-attachment-storage/index.ts`

One-time Edge Function to find existing messages that have external URLs in their attachments and re-download them to Storage. This fixes messages already in the database.

- [ ] **Step 1: Create the backfill function**

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { downloadAttachmentsToStorage } from "../_shared/download-to-storage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let input: { dry_run?: boolean; batch_size?: number } = {};
    try { input = await req.json(); } catch { /* defaults */ }
    const dryRun = !!input.dry_run;
    const batchSize = input.batch_size ?? 50;

    // Find messages with external URLs in attachments
    // jsonb array contains objects with file_url starting with http
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, conversation_id, attachments')
      .not('attachments', 'eq', '[]')
      .not('attachments', 'is', null)
      .order('created_at', { ascending: false })
      .limit(batchSize);

    if (error) {
      return jsonResponse({ error: error.message });
    }

    // Filter to messages that have at least one external URL attachment
    const needsUpdate = (messages ?? []).filter((m) => {
      const atts = m.attachments as Array<{ file_url: string }>;
      return atts.some(a => a.file_url.startsWith('http://') || a.file_url.startsWith('https://'));
    });

    let updated = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const msg of needsUpdate) {
      const atts = msg.attachments as Array<{ file_url: string; filename: string; mime_type: string; size_bytes?: number }>;
      const hasExternal = atts.some(a => a.file_url.startsWith('http://') || a.file_url.startsWith('https://'));
      if (!hasExternal) {
        skipped++;
        continue;
      }

      if (dryRun) {
        updated++;
        continue;
      }

      try {
        const stored = await downloadAttachmentsToStorage(supabase, atts, msg.conversation_id);
        // Check if any were actually downloaded (file_url changed from http to storage path)
        const anyChanged = stored.some((s, i) => s.file_url !== atts[i].file_url);
        if (anyChanged) {
          await supabase
            .from('messages')
            .update({ attachments: stored })
            .eq('id', msg.id);
          updated++;
        } else {
          // All downloads failed — URLs likely already expired
          failed++;
          errors.push(`${msg.id}: all downloads failed (URLs likely expired)`);
        }
      } catch (e) {
        failed++;
        errors.push(`${msg.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return jsonResponse({
      ok: true,
      dry_run: dryRun,
      total_with_attachments: messages?.length ?? 0,
      needs_update: needsUpdate.length,
      updated,
      failed,
      skipped,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/backfill-attachment-storage/index.ts
git commit -m "feat: add one-time backfill to migrate existing attachment URLs to Storage"
```

---

### Task 5: Deploy and test

- [ ] **Step 1: Deploy all updated Edge Functions**

```bash
supabase functions deploy missive-webhook --project-ref aeiyinpxmazmfubotpdk
supabase functions deploy backfill-missive-inbound --project-ref aeiyinpxmazmfubotpdk
supabase functions deploy backfill-attachment-storage --project-ref aeiyinpxmazmfubotpdk
```

- [ ] **Step 2: Run the backfill for existing messages (dry run first)**

```bash
curl -X POST "https://aeiyinpxmazmfubotpdk.supabase.co/functions/v1/backfill-attachment-storage" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true, "batch_size": 20}'
```

Check output — `needs_update` shows how many messages have external URLs.

- [ ] **Step 3: Run the actual backfill**

```bash
curl -X POST "https://aeiyinpxmazmfubotpdk.supabase.co/functions/v1/backfill-attachment-storage" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": false, "batch_size": 20}'
```

Note: Existing messages with expired Missive URLs will fail to download (expected). Only recently received messages will succeed.

- [ ] **Step 4: Verify in the Admin UI**

Open Admin → Messages, find a conversation with a recent image attachment. The image should now load from Supabase Storage instead of showing a broken image.

- [ ] **Step 5: Final commit with version bump**

```bash
# Bump patch version in package.json
git add package.json
git commit -m "fix: persist inbound attachments to Supabase Storage (v X.Y.Z)"
```
