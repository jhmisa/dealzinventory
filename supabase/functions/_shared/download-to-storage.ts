// supabase/functions/_shared/download-to-storage.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const STORAGE_BUCKET = 'messaging-attachments';

interface StoredAttachment {
  file_url: string;
  filename: string;
  mime_type: string;
  size_bytes?: number;
}

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
    results.push(stored ?? att);
  }
  return results;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100);
}
