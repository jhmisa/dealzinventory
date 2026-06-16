import { assertEquals } from 'jsr:@std/assert@1';
import { resolveInvoiceModel, buildOpenRouterVisionBody } from './ai-vision.ts';

Deno.test('resolveInvoiceModel uses config model when set', () => {
  assertEquals(
    resolveInvoiceModel('openrouter', 'anthropic/claude-sonnet-4'),
    'anthropic/claude-sonnet-4',
  );
});

Deno.test('resolveInvoiceModel falls back to provider default', () => {
  assertEquals(resolveInvoiceModel('openrouter', null), 'google/gemini-2.5-flash');
  assertEquals(resolveInvoiceModel('openai', '   '), 'gpt-4o');
  assertEquals(resolveInvoiceModel('anthropic', undefined), 'claude-sonnet-4-5-20250929');
});

Deno.test('buildOpenRouterVisionBody includes model and image data url', () => {
  const body = buildOpenRouterVisionBody('m', 'sys', 'QUJD', 'image/png') as {
    model: string;
    messages: Array<{ role: string; content: unknown }>;
  };
  assertEquals(body.model, 'm');
  const userContent = body.messages[1].content as Array<Record<string, unknown>>;
  const img = userContent[0].image_url as { url: string };
  assertEquals(img.url, 'data:image/png;base64,QUJD');
});

import {
  modelSupportsVision,
  toAnthropicContent,
  toOpenAIContent,
  toGeminiParts,
  type VisionImage,
} from './ai-vision.ts';

const IMG: VisionImage = { base64: 'QUJD', mediaType: 'image/png' };

Deno.test('modelSupportsVision recognizes vision-capable models', () => {
  assertEquals(modelSupportsVision('anthropic', 'claude-sonnet-4-5-20250929'), true);
  assertEquals(modelSupportsVision('google', 'gemini-2.0-flash'), true);
  assertEquals(modelSupportsVision('openai', 'gpt-4o'), true);
  assertEquals(modelSupportsVision('openrouter', 'google/gemini-2.5-flash'), true);
  assertEquals(modelSupportsVision('openai', 'gpt-3.5-turbo'), false);
});

Deno.test('toAnthropicContent returns plain string when no images', () => {
  assertEquals(toAnthropicContent('hello', []), 'hello');
});

Deno.test('toAnthropicContent builds text + base64 image blocks', () => {
  const content = toAnthropicContent('hello', [IMG]) as Array<Record<string, unknown>>;
  assertEquals(content[0], { type: 'text', text: 'hello' });
  assertEquals(content[1], {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: 'QUJD' },
  });
});

Deno.test('toOpenAIContent returns plain string when no images', () => {
  assertEquals(toOpenAIContent('hi', []), 'hi');
});

Deno.test('toOpenAIContent builds text + image_url data URL', () => {
  const content = toOpenAIContent('hi', [IMG]) as Array<Record<string, unknown>>;
  assertEquals(content[0], { type: 'text', text: 'hi' });
  const img = content[1].image_url as { url: string };
  assertEquals(img.url, 'data:image/png;base64,QUJD');
});

Deno.test('toGeminiParts always returns parts array with inline_data', () => {
  const parts = toGeminiParts('yo', [IMG]) as Array<Record<string, unknown>>;
  assertEquals(parts[0], { text: 'yo' });
  assertEquals(parts[1], { inline_data: { mime_type: 'image/png', data: 'QUJD' } });
});
