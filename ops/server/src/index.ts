/**
 * dealz-ops — the MCP server behind the ops/ operator workspace.
 *
 * Safety model: capability-by-absence. There is no SQL tool, no shell tool, no delete
 * tool. Seven read tools + ONE write (propose_reply) that creates an inert proposal row
 * for staff review in the AI Operations page. Every call is gated by the kill-switch and
 * audit-logged (guardrails.ts).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import * as db from './db.js'
import { runTool } from './guardrails.js'
import { SUPABASE_URL, SERVICE_ROLE_KEY } from './env.js'

const server = new McpServer({ name: 'dealz-ops', version: '1.0.0' })

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

const ok = (result: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
})
const fail = (err: unknown): ToolResult => ({
  content: [{ type: 'text', text: `ERROR: ${err instanceof Error ? err.message : String(err)}` }],
  isError: true,
})

server.tool(
  'survey_worklist',
  'List escalated customer conversations awaiting the senior operator, oldest first. Start here.',
  { limit: z.number().int().min(1).max(50).optional() },
  async ({ limit }) => {
    try {
      return ok(await runTool('survey_worklist', { limit }, {}, () => db.surveyWorklist(limit ?? 25)))
    } catch (err) { return fail(err) }
  },
)

server.tool(
  'get_conversation',
  'Fetch a conversation: meta + the most recent messages in chronological order.',
  { conversation_id: z.string().uuid(), limit: z.number().int().min(1).max(100).optional() },
  async ({ conversation_id, limit }) => {
    try {
      return ok(await runTool('get_conversation', { conversation_id, limit }, {}, () =>
        db.getConversation(conversation_id, limit ?? 30)))
    } catch (err) { return fail(err) }
  },
)

server.tool(
  'get_customer_context',
  'Customer identity, recent orders, and kaitori requests for a conversation.',
  { conversation_id: z.string().uuid() },
  async ({ conversation_id }) => {
    try {
      return ok(await runTool('get_customer_context', { conversation_id }, {}, () =>
        db.getCustomerContext(conversation_id)))
    } catch (err) { return fail(err) }
  },
)

server.tool(
  'search_inventory',
  'Search AVAILABLE stock (items, sell groups, backorder pre-orders). Prices in JPY. Quote codes and prices EXACTLY — never invent stock.',
  {
    query: z.string().min(1),
    brand: z.string().optional(),
    price_min: z.number().optional(),
    price_max: z.number().optional(),
  },
  async ({ query, brand, price_min, price_max }) => {
    try {
      return ok(await runTool('search_inventory', { query, brand, price_min, price_max }, {}, () =>
        db.searchInventory(query, { brand, price_min, price_max })))
    } catch (err) { return fail(err) }
  },
)

server.tool(
  'get_item_specs',
  'Structured specs for one item/model. Pass an exact code (P/G/B######) or a fuzzy model query.',
  { code_or_query: z.string().min(1) },
  async ({ code_or_query }) => {
    try {
      return ok(await runTool('get_item_specs', { code_or_query }, {}, () => db.getItemSpecs(code_or_query)))
    } catch (err) { return fail(err) }
  },
)

server.tool(
  'get_correction_examples',
  'Staff-approved examples of correct replies (ground truth for tone and policy). Consult before proposing.',
  { keyword: z.string().optional(), limit: z.number().int().min(1).max(25).optional() },
  async ({ keyword, limit }) => {
    try {
      return ok(await runTool('get_correction_examples', { keyword, limit }, {}, () =>
        db.getCorrections(keyword, limit ?? 10)))
    } catch (err) { return fail(err) }
  },
)

server.tool(
  'list_proposals',
  'List your recent proposals and their review status (PENDING/APPROVED/REJECTED/EXECUTED/FAILED).',
  { status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED']).optional() },
  async ({ status }) => {
    try {
      return ok(await runTool('list_proposals', { status }, {}, () => db.listProposals(status)))
    } catch (err) { return fail(err) }
  },
)

server.tool(
  'propose_reply',
  'Submit a reply PROPOSAL for staff review in the AI Operations page. This does NOT send anything (unless staff have explicitly set the reply capability to AUTO). Plain text only — no Markdown, Messenger renders it literally. English + light emojis. One live proposal per conversation; re-proposing replaces it.',
  {
    conversation_id: z.string().uuid(),
    content: z.string().min(1).max(4000),
    summary: z.string().min(1).max(200).describe('One line staff can scan: who/what/why'),
    rationale: z.string().max(2000).optional().describe('Why this reply is right — what you checked'),
    confidence: z.number().min(0).max(1).optional().describe('Your honest confidence 0-1'),
  },
  async ({ conversation_id, content, summary, rationale, confidence }) => {
    try {
      const result = await runTool(
        'propose_reply',
        { conversation_id, summary, confidence, content_chars: content.length },
        { write: true },
        () => db.proposeReply({ conversation_id, content, summary, rationale, confidence }),
      )
      // AUTO graduation path: staff explicitly flipped the dial; the proposal row was
      // still created first, so the audit trail is identical to the reviewed path.
      const autonomy = await db.getSetting('ai_ops_autonomy_reply')
      if (autonomy === 'AUTO') {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-ops-execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ proposal_id: result.proposal_id }),
        })
        const exec = await res.json().catch(() => ({ error: 'unparseable execute response' }))
        return ok({ ...result, mode: 'AUTO', executed: exec })
      }
      return ok({ ...result, mode: 'PROPOSE', note: 'Awaiting staff review in AI Operations.' })
    } catch (err) { return fail(err) }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('dealz-ops MCP server running on stdio')
