import assert from 'node:assert/strict'
import { findCustomerMessageForDraft } from './corrections'

const msgs = [
  { id: 'm1', role: 'customer', content: 'battery percentage po?' },
  { id: 'm2', role: 'assistant', content: 'draft reply' },
] as never[]

assert.equal(findCustomerMessageForDraft(msgs, 'm2'), 'battery percentage po?')
assert.equal(findCustomerMessageForDraft(msgs, 'unknown'), '')
assert.equal(findCustomerMessageForDraft([] as never[], 'm2'), '')

console.log('corrections.test.ts: all assertions passed')
