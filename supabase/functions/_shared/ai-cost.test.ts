import { assertEquals } from 'jsr:@std/assert@1';
import { estimateCostUsd } from './ai-cost.ts';

Deno.test('estimateCostUsd prices input and output per million', () => {
  assertEquals(estimateCostUsd('claude-sonnet-4-5-20250929', { input_tokens: 1_000_000, output_tokens: 0 }), 3);
  assertEquals(estimateCostUsd('claude-sonnet-4-5-20250929', { input_tokens: 0, output_tokens: 1_000_000 }), 15);
});

Deno.test('estimateCostUsd combines input + output', () => {
  // 500k in @ $3/M = 1.5 ; 200k out @ $15/M = 3.0 ; total 4.5
  assertEquals(estimateCostUsd('claude-sonnet-4-5-20250929', { input_tokens: 500_000, output_tokens: 200_000 }), 4.5);
});

Deno.test('estimateCostUsd falls back for unknown models', () => {
  // fallback price is 3/15 — same as sonnet
  assertEquals(estimateCostUsd('some-unknown-model', { input_tokens: 1_000_000, output_tokens: 0 }), 3);
});

Deno.test('estimateCostUsd rounds to 6 decimals', () => {
  // 1 input token @ $0.30/M = 0.0000003 -> rounds to 0
  assertEquals(estimateCostUsd('google/gemini-2.5-flash', { input_tokens: 1, output_tokens: 0 }), 0);
  // 100 output tokens @ $2.50/M = 0.00025
  assertEquals(estimateCostUsd('google/gemini-2.5-flash', { input_tokens: 0, output_tokens: 100 }), 0.00025);
});
