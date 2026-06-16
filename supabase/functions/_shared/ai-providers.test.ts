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
