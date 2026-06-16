// Intent → folder routing for the messaging AI.
//
// The draft call already emits an `intent` (tracking | order_status | product_inquiry |
// complaint | return | kaitori | general | unknown). These pure helpers turn that intent into a
// folder-routing decision. Folders are keyed by NAME, not id — message_folders.id is a random
// uuid per environment, while the name is the stable key.

// Maps an AI intent to the folder name it belongs in. `general`/`unknown` (and anything
// unrecognized) return null → leave the conversation where it is.
const INTENT_FOLDER: Record<string, string> = {
  product_inquiry: 'Prospects',
  tracking: 'Order',
  order_status: 'Order',
  return: 'Aftersales',
  complaint: 'Concern',
  kaitori: 'Kaitori',
};

export function folderNameForIntent(intent: string): string | null {
  return INTENT_FOLDER[intent] ?? null;
}

// Triage-out-of-inbox-only rule. Returns true only when:
//  - there is a target to move to, AND
//  - the conversation is not already in that target, AND
//  - the conversation is currently unfiled (null) or sitting in Inbox.
// Once a conversation has been filed into any non-Inbox folder (by staff or an earlier triage),
// the AI never moves it again — no fighting manual placement, no thrash on intent flip-flop.
export function shouldRouteOutOfInbox(
  currentFolderId: string | null,
  inboxFolderId: string | null,
  targetFolderId: string | null,
): boolean {
  if (!targetFolderId) return false;
  if (targetFolderId === currentFolderId) return false;
  return currentFolderId === null || currentFolderId === inboxFolderId;
}

// Sensitive intents that always need a human regardless of confidence (bias to escalate):
// money (kaitori) and complaints. Feeds the existing needs_human_review flag.
const ESCALATING_INTENTS = new Set(['kaitori', 'complaint']);

export function isEscalatingIntent(intent: string): boolean {
  return ESCALATING_INTENTS.has(intent);
}
