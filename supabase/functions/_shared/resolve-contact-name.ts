// Shared Facebook/Missive contact-name resolution.
//
// Missive resolves a Facebook sender's display name asynchronously, a few
// seconds AFTER it fires our webhook. So the initial webhook payload often has
// no name (from_field.name and subject both null). The same fallback chain is
// used in three places — the webhook fast-path, the webhook background
// enrichment, and the backfill-contact-names function — so it lives here once
// to stay consistent and to apply the "Message from " prefix strip everywhere.

const MISSIVE_API_URL = 'https://public.missiveapp.com/v1';

// Shapes are intentionally loose — Missive payload/API objects vary by source.
interface MissiveConversationLike {
  subject?: string | null;
  latest_subject?: string | null;
  contacts?: Array<{ name?: string | null; first_name?: string | null }> | null;
  authors?: Array<{ name?: string | null }> | null;
  latest_message?: { from_field?: { name?: string | null } | null } | null;
  messages?: Array<{ from_field?: { name?: string | null } | null }> | null;
}

interface MissiveMessageLike {
  from_field?: { name?: string | null; address?: string | null } | null;
}

/**
 * Normalize a candidate name: strip the Missive "Message from " subject prefix
 * and trim. Returns null for empty/whitespace results.
 */
export function normalizeContactName(name?: string | null): string | null {
  if (!name) return null;
  let n = name;
  if (n.startsWith('Message from ')) {
    n = n.slice('Message from '.length);
  }
  n = n.trim();
  return n || null;
}

/**
 * Resolve a contact name from a Missive conversation object (webhook payload
 * `conversation` or a Missive API conversation record). Excludes the org's own
 * author name ("Dealz K.K."). Applies the prefix strip + trim once.
 */
export function resolveNameFromMissiveConversation(
  conv: MissiveConversationLike | null | undefined,
  message?: MissiveMessageLike | null,
): string | null {
  if (!conv && !message) return null;

  const candidate =
    message?.from_field?.name
    ?? conv?.subject
    ?? conv?.latest_subject
    ?? (conv?.contacts ?? []).find((c) => c?.name)?.name
    ?? (conv?.contacts ?? []).find((c) => c?.first_name)?.first_name
    ?? (conv?.authors ?? []).find((a) => a?.name && a.name !== 'Dealz K.K.')?.name
    ?? conv?.latest_message?.from_field?.name
    ?? (conv?.messages ?? []).find((m) => m?.from_field?.name)?.from_field?.name
    ?? message?.from_field?.address
    ?? null;

  return normalizeContactName(candidate);
}

/**
 * Unwrap the Missive `GET /conversations/{id}` response, which may return the
 * conversation either as an array (`conversations: [ {...} ]`) or a single
 * object (`conversation: {...}` / `conversations: {...}`).
 */
export function unwrapMissiveConversation(data: unknown): MissiveConversationLike | null {
  const d = data as { conversations?: unknown; conversation?: unknown } | null;
  if (!d) return null;
  if (Array.isArray(d.conversations)) return (d.conversations[0] ?? null) as MissiveConversationLike | null;
  return (d.conversations ?? d.conversation ?? null) as MissiveConversationLike | null;
}

/**
 * Fetch a Missive conversation and resolve its contact name in one call.
 * Returns null on any error or if no name is available yet.
 */
export async function fetchAndResolveContactName(
  missiveConversationId: string,
  token: string,
  fetchImpl: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<string | null> {
  if (!token) return null;
  const res = await fetchImpl(`${MISSIVE_API_URL}/conversations/${missiveConversationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return resolveNameFromMissiveConversation(unwrapMissiveConversation(data));
}
