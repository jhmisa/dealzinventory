import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { resolveFalModelUrl, extractFalImageUrl } from './fal.ts';

Deno.test('resolveFalModelUrl builds queue url from model id', () => {
  assertEquals(
    resolveFalModelUrl('https://queue.fal.run', 'fal-ai/clarity-upscaler'),
    'https://queue.fal.run/fal-ai/clarity-upscaler',
  );
});

Deno.test('resolveFalModelUrl keeps a full endpoint that already targets a model', () => {
  assertEquals(
    resolveFalModelUrl('https://queue.fal.run/fal-ai/topaz/upscale/', null),
    'https://queue.fal.run/fal-ai/topaz/upscale',
  );
});

Deno.test('resolveFalModelUrl throws when no model can be determined', () => {
  assertThrows(() => resolveFalModelUrl('https://queue.fal.run', ''));
});

Deno.test('extractFalImageUrl reads images[0].url, image.url, image_url', () => {
  assertEquals(extractFalImageUrl({ images: [{ url: 'a' }] }), 'a');
  assertEquals(extractFalImageUrl({ image: { url: 'b' } }), 'b');
  assertEquals(extractFalImageUrl({ image_url: 'c' }), 'c');
  assertEquals(extractFalImageUrl({ nope: 1 }), null);
});
