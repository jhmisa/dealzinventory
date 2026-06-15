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
