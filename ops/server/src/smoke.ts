/**
 * Live smoke test: reads are harmless; the single write is an inert proposal row,
 * cleaned up at the end (pass --keep to leave it for cockpit UI verification).
 */
import { surveyWorklist, getConversation, searchInventory, proposeReply, listProposals, supabase } from './db.js'

const keep = process.argv.includes('--keep')

const work = await surveyWorklist(5)
console.log('worklist:', work.length, 'rows')
if (work.length > 0) {
  const conv = await getConversation(work[0].conversation_id, 5)
  console.log('conversation ok:', conv.messages.length, 'messages')
}

const inv = await searchInventory('iphone 12', {})
console.log('inventory:', inv.length, 'results, first:', inv[0]?.code ?? '(none)')

// Inert write + cleanup — target the oldest escalated conversation if any, else any conversation.
const targetId = work[0]?.conversation_id
  ?? (await supabase.from('conversations').select('id').limit(1).single()).data?.id
if (!targetId) throw new Error('no conversations in DB to smoke-test against')

const res = await proposeReply({
  conversation_id: targetId,
  content: 'SMOKE TEST — do not send. This proposal verifies the AI Ops pipeline end-to-end.',
  summary: 'Smoke test proposal (safe to reject)',
  rationale: 'Created by ops/server/src/smoke.ts to verify propose → cockpit visibility.',
  confidence: 0.5,
})
console.log('proposed:', res)

const listed = await listProposals('PENDING')
const visible = listed.some((p) => (p as { id: string }).id === res.proposal_id)
console.log('pending visible:', visible)
if (!visible) throw new Error('proposal not visible in listProposals')

if (keep) {
  console.log(`kept proposal ${res.proposal_id} for UI verification. SMOKE PASSED`)
} else {
  await supabase.from('ai_ops_proposals').delete().eq('id', res.proposal_id)
  console.log('cleaned up. SMOKE PASSED')
}
