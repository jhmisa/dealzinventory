import type { Message } from './types'

// Return the content of the customer message immediately preceding a draft (the question the
// draft was answering), or '' if none is found. Used to prefill the "Correct this" dialog.
export function findCustomerMessageForDraft(messages: Message[], draftId: string): string {
  const idx = messages.findIndex((m) => m.id === draftId)
  if (idx < 0) return ''
  for (let i = idx - 1; i >= 0; i--) {
    const role = (messages[i] as { role?: string }).role
    if (role === 'customer' || role === 'user') return messages[i].content ?? ''
  }
  return ''
}
