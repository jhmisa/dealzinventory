import { assertEquals } from 'jsr:@std/assert@1';
import { extractUsage } from './ai-providers.ts';

Deno.test('extractUsage reads Anthropic usage shape', () => {
  const data = { usage: { input_tokens: 120, output_tokens: 45 } };
  assertEquals(extractUsage('anthropic', data), { input_tokens: 120, output_tokens: 45 });
});

Deno.test('extractUsage reads OpenAI / OpenRouter usage shape', () => {
  const data = { usage: { prompt_tokens: 200, completion_tokens: 30 } };
  assertEquals(extractUsage('openai', data), { input_tokens: 200, output_tokens: 30 });
  assertEquals(extractUsage('openrouter', data), { input_tokens: 200, output_tokens: 30 });
});

Deno.test('extractUsage reads Gemini usageMetadata shape', () => {
  const data = { usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 60 } };
  assertEquals(extractUsage('google', data), { input_tokens: 300, output_tokens: 60 });
});

Deno.test('extractUsage defaults to zero when missing', () => {
  assertEquals(extractUsage('anthropic', {}), { input_tokens: 0, output_tokens: 0 });
  assertEquals(extractUsage('openai', null), { input_tokens: 0, output_tokens: 0 });
});

import { normalizeRole, consolidateForTest } from './ai-providers.ts';

Deno.test('normalizeRole maps staff and assistant to one assistant side', () => {
  assertEquals(normalizeRole('customer'), 'customer');
  assertEquals(normalizeRole('assistant'), 'assistant');
  assertEquals(normalizeRole('staff'), 'assistant');
  assertEquals(normalizeRole('anything-else'), 'assistant');
});

Deno.test('consolidate merges a staff reply and an AI reply into one assistant turn', () => {
  const out = consolidateForTest([
    { role: 'customer', content: 'hi' },
    { role: 'staff', content: 'hello from staff' },
    { role: 'assistant', content: 'and from AI' },
    { role: 'customer', content: 'ok thanks' },
  ]);
  assertEquals(out, [
    { role: 'customer', content: 'hi' },
    { role: 'assistant', content: 'hello from staff\nand from AI' },
    { role: 'customer', content: 'ok thanks' },
  ]);
});

Deno.test('consolidate preserves alternation and merges a customer burst', () => {
  const out = consolidateForTest([
    { role: 'customer', content: 'a' },
    { role: 'customer', content: 'b' },
    { role: 'staff', content: 'reply' },
    { role: 'customer', content: 'c' },
  ]);
  assertEquals(out, [
    { role: 'customer', content: 'a\nb' },
    { role: 'assistant', content: 'reply' },
    { role: 'customer', content: 'c' },
  ]);
});

import { parseAIResponse } from './ai-providers.ts';

Deno.test('parseAIResponse reads needs_clarification = true', () => {
  const text = JSON.stringify({
    reply: 'Order ORD000123 po ba ito?',
    confidence: 0.8,
    intent: 'order_status',
    data_used: ['order:ORD000123'],
    escalation_reason: null,
    needs_clarification: true,
  });
  assertEquals(parseAIResponse(text).needs_clarification, true);
});

Deno.test('parseAIResponse defaults needs_clarification to false when absent', () => {
  const text = JSON.stringify({ reply: 'Available po ang iPhone 13.', confidence: 0.9 });
  assertEquals(parseAIResponse(text).needs_clarification, false);
});

Deno.test('parseAIResponse defaults needs_clarification to false on non-JSON reply', () => {
  assertEquals(parseAIResponse('just a plain sentence reply').needs_clarification, false);
});

Deno.test('parseAIResponse extracts used_template_name when present', () => {
  const text = JSON.stringify({ reply: 'hi', confidence: 0.9, used_template_name: 'Info: Express Service' });
  assertEquals(parseAIResponse(text).used_template_name, 'Info: Express Service');
});

Deno.test('parseAIResponse defaults used_template_name to null', () => {
  assertEquals(parseAIResponse(JSON.stringify({ reply: 'hi', confidence: 0.9 })).used_template_name, null);
  assertEquals(parseAIResponse('just a plain sentence reply').used_template_name, null);
});

import { buildEnhancedPrompt } from './ai-providers.ts';

Deno.test('buildEnhancedPrompt keeps the persona and appends both rule blocks', () => {
  const out = buildEnhancedPrompt('PERSONA-PROMPT');
  // persona retained
  assertEquals(out.includes('PERSONA-PROMPT'), true);
  // existing inventory rule retained
  assertEquals(out.includes('Response Strategy for Product Inquiries'), true);
  // new clarify rule appended
  assertEquals(out.includes('Resolve before assuming'), true);
  assertEquals(out.includes('NEVER re-ask'), true);
});

import { buildEnhancedPrompt as buildEP2 } from './ai-providers.ts';

Deno.test('INVENTORY_RESPONSE_RULE distinguishes specific vs broad asks', () => {
  const out = buildEP2('PERSONA');
  // Specific asks still lead with concrete options / search.
  assertEquals(/specific/i.test(out), true);
  // Broad/category asks must qualify first instead of dumping a product.
  assertEquals(/broad|category/i.test(out), true);
  assertEquals(/qualif/i.test(out), true);
});

import { runChatCompletionWithTools, SEARCH_INVENTORY_TOOL } from './ai-providers.ts';

Deno.test('SEARCH_INVENTORY_TOOL declares the function name and query param', () => {
  assertEquals(SEARCH_INVENTORY_TOOL.function.name, 'search_inventory');
  assertEquals(typeof SEARCH_INVENTORY_TOOL.function.parameters.properties.query, 'object');
});

Deno.test('runChatCompletionWithTools executes a tool call then returns final content', async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const responses = [
    {
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant', content: null,
          tool_calls: [{ id: 'call_1', type: 'function',
            function: { name: 'search_inventory', arguments: JSON.stringify({ query: 'LUCA tablet' }) } }],
        },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    },
    {
      choices: [{ finish_reason: 'stop', message: { role: 'assistant',
        content: JSON.stringify({ reply: 'Opo available po: G000022', confidence: 0.9, intent: 'product_inquiry', data_used: ['G000022'], escalation_reason: null }) } }],
      usage: { prompt_tokens: 20, completion_tokens: 8 },
    },
  ];
  let i = 0;
  const fakeFetch = (_url: string, _init: unknown) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(responses[i++]) } as Response);

  const executeTool = (name: string, args: unknown) => {
    calls.push({ name, args });
    return Promise.resolve([{ code: 'G000022', price: 7900 }]);
  };

  const result = await runChatCompletionWithTools({
    fetchImpl: fakeFetch as typeof fetch,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: 'k', model: 'openai/gpt-4o',
    messages: [{ role: 'user', content: 'meron pa po nito?' }],
    executeTool, maxToolRounds: 3,
  });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, 'search_inventory');
  assertEquals((calls[0].args as { query: string }).query, 'LUCA tablet');
  assertEquals(result.finalText.includes('G000022'), true);
  assertEquals(result.usage.input_tokens, 30);
  assertEquals(result.usage.output_tokens, 10); // 2 + 8 summed across both turns
});

Deno.test('runChatCompletionWithTools survives a throwing executeTool and still returns final content', async () => {
  const responses = [
    { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search_inventory', arguments: '{"query":"x"}' } }] } }],
      usage: { prompt_tokens: 5, completion_tokens: 1 } },
    { choices: [{ finish_reason: 'stop', message: { content: '{"reply":"pasensya po, di ko ma-check ngayon","confidence":0.4}' } }],
      usage: { prompt_tokens: 6, completion_tokens: 2 } },
  ];
  let i = 0;
  const fakeFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(responses[i++]) } as Response);
  const result = await runChatCompletionWithTools({
    fetchImpl: fakeFetch as typeof fetch, url: 'u', apiKey: 'k', model: 'm',
    messages: [{ role: 'user', content: 'meron pa?' }],
    executeTool: () => Promise.reject(new Error('rpc down')), maxToolRounds: 3,
  });
  assertEquals(result.finalText.includes('pasensya'), true);
});

Deno.test('runChatCompletionWithTools returns immediately when no tool call', async () => {
  const fakeFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({
    choices: [{ finish_reason: 'stop', message: { content: '{"reply":"hi","confidence":0.8}' } }],
    usage: { prompt_tokens: 5, completion_tokens: 1 },
  }) } as Response);
  const result = await runChatCompletionWithTools({
    fetchImpl: fakeFetch as typeof fetch, url: 'u', apiKey: 'k', model: 'm',
    messages: [{ role: 'user', content: 'hi' }],
    executeTool: () => Promise.reject(new Error('should not be called')), maxToolRounds: 3,
  });
  assertEquals(result.finalText, '{"reply":"hi","confidence":0.8}');
});

Deno.test('parseAIResponse reads offer_codes array', () => {
  const text = JSON.stringify({
    reply: 'Available po: G000022', confidence: 0.9, intent: 'product_inquiry',
    data_used: ['G000022'], escalation_reason: null, offer_codes: ['G000022'],
  });
  assertEquals(parseAIResponse(text).offer_codes, ['G000022']);
});

Deno.test('parseAIResponse defaults offer_codes to empty array', () => {
  assertEquals(parseAIResponse('{"reply":"hi"}').offer_codes, []);
});

Deno.test('enhanced prompt instructs single {{OFFER}} token output and forbids markdown', () => {
  const p = buildEnhancedPrompt('PERSONA');
  // The model must emit the placeholder token, not its own spec/price/link.
  if (!p.includes('{{OFFER:')) throw new Error('expected {{OFFER: token instruction');
  // It must be told not to use markdown.
  if (!/no markdown/i.test(p)) throw new Error('expected a no-markdown instruction');
  // The persona must still be embedded.
  if (!p.includes('PERSONA')) throw new Error('expected persona text in prompt');
});

import { parseClassification } from "./ai-providers.ts";

Deno.test("parseClassification reads a clean JSON object", () => {
  const c = parseClassification('{"intent":"product_inquiry","sub_intent_slug":"promo_raffle","confidence":0.9}');
  assertEquals(c, { intent: "product_inquiry", sub_intent_slug: "promo_raffle", confidence: 0.9 });
});

Deno.test("parseClassification strips markdown fences", () => {
  const c = parseClassification('```json\n{"intent":"tracking","sub_intent_slug":null,"confidence":0.7}\n```');
  assertEquals(c, { intent: "tracking", sub_intent_slug: null, confidence: 0.7 });
});

Deno.test("parseClassification clamps confidence and defaults missing fields", () => {
  const c = parseClassification('{"confidence":5}');
  assertEquals(c, { intent: "unknown", sub_intent_slug: null, confidence: 1 });
});

Deno.test("parseClassification falls back safely on garbage", () => {
  const c = parseClassification("not json at all");
  assertEquals(c, { intent: "unknown", sub_intent_slug: null, confidence: 0 });
});

Deno.test("parseClassification coerces empty-string sub_intent_slug to null", () => {
  const c = parseClassification('{"intent":"general","sub_intent_slug":"","confidence":0.5}');
  assertEquals(c.sub_intent_slug, null);
});

import { assert } from 'jsr:@std/assert@1';
import { GET_ITEM_SPECS_TOOL } from './ai-providers.ts';

Deno.test('buildEnhancedPrompt includes the spec-lookup rule', () => {
  const p = buildEnhancedPrompt('BASE_PROMPT');
  assert(p.includes('BASE_PROMPT'));
  assert(p.includes('get_item_specs'));
  assert(p.includes('has_cellular'));
});

Deno.test('GET_ITEM_SPECS_TOOL has the expected contract', () => {
  assertEquals(GET_ITEM_SPECS_TOOL.function.name, 'get_item_specs');
  assertEquals(GET_ITEM_SPECS_TOOL.function.parameters.required, []);
});
