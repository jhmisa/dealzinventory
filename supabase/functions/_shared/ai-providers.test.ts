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
