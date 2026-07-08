// Thin Blotato REST client (server-side publishing).
// Base + auth mirror sync-social-status/index.ts; body verified against
// https://help.blotato.com/api/publish-post.md (POST /v2/posts, returns postSubmissionId).
const BLOTATO_API_BASE = "https://backend.blotato.com/v2";

export interface BlotatoPublishInput {
  apiKey: string;
  accountId: string;
  pageId: string; // Facebook page id (subaccount)
  platform: string; // 'facebook'
  text: string;
  mediaUrls: string[];
  mediaType?: "reel" | "story"; // Facebook VIDEO must be a reel (feed videos unsupported)
  scheduledTime?: string | null; // ISO 8601 top-level; omit for immediate publish
  useNextFreeSlot?: boolean; // best-effort (documented body uses scheduledTime)
}

export interface BlotatoPublishResult {
  submissionId: string | null;
  raw: unknown;
  error?: string;
}

export async function publishPost(
  fetchImpl: typeof fetch,
  input: BlotatoPublishInput,
): Promise<BlotatoPublishResult> {
  const content: Record<string, unknown> = {
    text: input.text,
    mediaUrls: input.mediaUrls,
    platform: input.platform,
  };
  if (input.mediaType) content.mediaType = input.mediaType;

  const body: Record<string, unknown> = {
    post: {
      accountId: input.accountId,
      content,
      target: { targetType: input.platform, pageId: input.pageId },
    },
  };
  // scheduledTime MUST be top-level (siblings of `post`) or Blotato ignores it.
  if (input.scheduledTime) body.scheduledTime = input.scheduledTime;
  if (input.useNextFreeSlot) body.useNextFreeSlot = true;

  const res = await fetchImpl(`${BLOTATO_API_BASE}/posts`, {
    method: "POST",
    headers: { "blotato-api-key": input.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      submissionId: null,
      raw,
      error: (raw as { message?: string })?.message ?? `HTTP ${res.status}`,
    };
  }
  const submissionId = (raw as { postSubmissionId?: string; id?: string })?.postSubmissionId ??
    (raw as { id?: string })?.id ?? null;
  return { submissionId, raw };
}
